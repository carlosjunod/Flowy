import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { finalizeItem } from '../lib/finalize.js';
import { processHeroImage } from '../lib/social.js';
import { isTwitterUrl, extractTweetId } from '../lib/socialUrls.js';
import { ProcessorError } from './url.processor.js';

export { isTwitterUrl };

const CONTENT_CAP = 20_000;

interface SyndicationUser {
  name?: string;
  screen_name?: string;
}

interface SyndicationMedia {
  type?: string;
  media_url_https?: string;
  url?: string;
  // video variants omitted for v1 — we grab the still/preview instead.
}

interface SyndicationTweet {
  id_str?: string;
  text?: string;
  full_text?: string;
  user?: SyndicationUser;
  favorite_count?: number;
  conversation_count?: number;
  created_at?: string;
  mediaDetails?: SyndicationMedia[];
  photos?: { url?: string }[];
  entities?: { media?: SyndicationMedia[] };
}

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';

async function resolveTCo(url: string): Promise<string> {
  if (!/^https?:\/\/t\.co\//i.test(url)) return url;
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
}

async function fetchTweet(tweetId: string): Promise<SyndicationTweet> {
  // The syndication endpoint requires a `token` derived from the tweet id.
  // See: https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts
  const token = ((Number(tweetId) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '');
  const url = `${SYNDICATION_URL}?id=${tweetId}&token=${token}&lang=en`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        accept: 'application/json',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('TWITTER_FETCH_FAILED', msg);
  }
  if (res.status === 404) throw new ProcessorError('TWITTER_NOT_FOUND', `404 for ${tweetId}`);
  if (!res.ok) {
    throw new ProcessorError('TWITTER_FETCH_FAILED', `${res.status} ${tweetId}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('TWITTER_PARSE_FAILED', msg);
  }
  if (!json || typeof json !== 'object') {
    throw new ProcessorError('TWITTER_PARSE_FAILED', 'empty response');
  }
  return json as SyndicationTweet;
}

function pickMediaUrl(tweet: SyndicationTweet): string | undefined {
  const mediaArr: SyndicationMedia[] = [
    ...(tweet.mediaDetails ?? []),
    ...(tweet.entities?.media ?? []),
  ];
  const photoFromDetails = mediaArr.find((m) => m.type === 'photo' && m.media_url_https)?.media_url_https;
  if (photoFromDetails) return photoFromDetails;
  const videoStill = mediaArr.find((m) => m.type === 'video' && m.media_url_https)?.media_url_https;
  if (videoStill) return videoStill;
  const anyMedia = mediaArr.find((m) => m.media_url_https)?.media_url_https;
  if (anyMedia) return anyMedia;
  return tweet.photos?.[0]?.url;
}

function composeContent(tweet: SyndicationTweet, slide?: MediaSlide): string {
  const text = tweet.full_text ?? tweet.text ?? '';
  const author = tweet.user?.name ?? tweet.user?.screen_name ?? 'unknown';
  const handle = tweet.user?.screen_name ? `@${tweet.user.screen_name}` : '';
  const stats: string[] = [];
  if (typeof tweet.favorite_count === 'number') stats.push(`❤ ${tweet.favorite_count}`);
  if (typeof tweet.conversation_count === 'number') stats.push(`💬 ${tweet.conversation_count}`);

  const parts = [
    [author, handle].filter(Boolean).join(' '),
    stats.length > 0 ? stats.join(' · ') : '',
    '',
    text.trim(),
  ];
  if (slide?.summary) parts.push('', `Image: ${slide.summary}`);
  if (slide?.extracted_text) parts.push(`Text in image: ${slide.extracted_text}`);
  return parts.filter((p) => p !== undefined).join('\n');
}

export async function processTwitter(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');

  const resolved = await resolveTCo(rawUrl);
  if (!isTwitterUrl(resolved)) throw new ProcessorError('UNSUPPORTED_TWITTER_URL', resolved);

  const tweetId = extractTweetId(resolved);
  if (!tweetId) throw new ProcessorError('INVALID_TWITTER_URL', `no tweet id in ${resolved}`);

  const tweet = await fetchTweet(tweetId);
  const text = tweet.full_text ?? tweet.text ?? '';
  if (!text && !pickMediaUrl(tweet)) {
    throw new ProcessorError('TWITTER_EMPTY', 'tweet has no text or media');
  }

  let slide: MediaSlide | undefined;
  const mediaUrl = pickMediaUrl(tweet);
  if (mediaUrl) {
    try {
      const hero = await processHeroImage(item.id, 'twitter', mediaUrl, resolved, 'https://twitter.com/');
      slide = hero.slide;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[twitter] hero image failed: ${msg}`);
    }
  }

  const content = composeContent(tweet, slide);

  let structured;
  try {
    structured = await extractStructuredData(content);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  let vector: number[];
  try {
    vector = await generateEmbedding(`${structured.summary} ${structured.tags.join(' ')}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  const author = tweet.user?.screen_name ? `@${tweet.user.screen_name}` : '';
  await finalizeItem(item.id, {
    title: structured.title || (text ? text.slice(0, 80) : `Tweet ${tweetId}`),
    summary: structured.summary,
    content: content.slice(0, CONTENT_CAP),
    tags: structured.tags,
    category: structured.category,
    source_url: resolved,
    og_image: mediaUrl ?? '',
    og_description: text.slice(0, 500),
    site_name: author ? `X · ${author}` : 'X',
    ...(slide ? { media: [slide], r2_key: slide.r2_key } : {}),
  });

  await createEmbedding(item.id, vector);
}
