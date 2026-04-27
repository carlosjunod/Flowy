import {
  getItem,
  updateItem,
  type ItemExploration,
  type ItemRecord,
} from '../lib/pocketbase.js';
import {
  ClaudeError,
  identifyContent,
  type IdentifyResult,
} from '../lib/claude.js';
import { sampleVideoFrames, VideoFramesError } from '../lib/videoFrames.js';

const VIDEO_FRAME_TYPES = new Set<string>(['youtube', 'video', 'screen_recording']);

export interface ExploreOptions {
  includeVideoFrames: boolean;
}

export interface ExploreOutcome {
  status: ItemExploration['status'];
  framesAnalyzed: number;
  primary?: { url: string; title: string };
  candidateCount: number;
}

function buildContext(item: ItemRecord): string {
  const parts: string[] = [];
  if (item.title) parts.push(`Title: ${item.title}`);
  if (item.category) parts.push(`Category: ${item.category}`);
  if (Array.isArray(item.tags) && item.tags.length > 0) parts.push(`Tags: ${item.tags.join(', ')}`);
  if (item.source_url) parts.push(`Source: ${item.source_url}`);
  if (item.summary) parts.push(`Summary: ${item.summary}`);
  if (item.og_description) parts.push(`OG description: ${item.og_description}`);
  if (item.content) parts.push(`Body:\n${item.content.slice(0, 12_000)}`);
  if (Array.isArray(item.media)) {
    item.media.forEach((slide, i) => {
      const blocks: string[] = [];
      if (slide.summary) blocks.push(slide.summary);
      if (slide.extracted_text) blocks.push(slide.extracted_text.slice(0, 2_000));
      if (slide.transcript) blocks.push(slide.transcript.slice(0, 2_000));
      if (blocks.length > 0) parts.push(`Media slide ${i + 1}:\n${blocks.join('\n')}`);
    });
  }
  return parts.join('\n\n');
}

function shouldSampleFrames(item: ItemRecord, opts: ExploreOptions): boolean {
  if (!opts.includeVideoFrames) return false;
  if (!VIDEO_FRAME_TYPES.has(item.type)) return false;
  // Only sample when we actually have a URL to fetch from.
  return Boolean(item.source_url ?? item.raw_url);
}

function mergeOnScreenText(frames: { extracted_text?: string }[]): string {
  return frames
    .map((f) => f.extracted_text ?? '')
    .filter((t) => t.trim().length > 0)
    .join('\n---\n')
    .slice(0, 4000);
}

function toExploration(
  result: IdentifyResult,
  framesAnalyzed: number,
  onScreenText: string,
  visualCues: string[],
): ItemExploration {
  const exploration: ItemExploration = {
    status: result.status === 'enriched' && (result.primary_link || result.candidates.length > 0)
      ? 'enriched'
      : 'no_match',
    candidates: result.candidates.map((c) => ({
      name: c.name,
      url: c.url,
      kind: c.kind,
      confidence: c.confidence,
      reason: c.reason,
    })),
    notes: result.notes,
    last_explored_at: new Date().toISOString(),
  };
  if (result.primary_link) exploration.primary_link = result.primary_link;
  if (framesAnalyzed > 0) {
    exploration.video_insights = {
      frames_analyzed: framesAnalyzed,
      on_screen_text: onScreenText,
      visual_cues: visualCues.slice(0, 10),
    };
  }
  return exploration;
}

export async function processExplore(itemId: string, opts: ExploreOptions): Promise<ExploreOutcome> {
  const item = await getItem(itemId);

  // Mark as exploring so the UI can show a spinner.
  await updateItem(itemId, {
    exploration: {
      status: 'exploring',
      candidates: [],
      last_explored_at: new Date().toISOString(),
    },
  });

  const context = buildContext(item);
  let frames: { mediaType: 'image/jpeg'; data: string }[] = [];
  let onScreenText = '';
  const visualCues: string[] = [];

  if (shouldSampleFrames(item, opts)) {
    const url = item.source_url ?? item.raw_url ?? '';
    try {
      const sampled = await sampleVideoFrames({ url, count: 4, prefix: `flowy-explore-${itemId}-` });
      frames = sampled.map((f) => ({
        mediaType: 'image/jpeg' as const,
        data: f.buffer.toString('base64'),
      }));
    } catch (err) {
      const msg = err instanceof VideoFramesError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
      console.warn(`[explore] frame sampling failed for ${itemId}: ${msg}`);
    }
  }

  let result: IdentifyResult;
  try {
    result = await identifyContent({
      context,
      frames: frames.length > 0 ? frames : undefined,
      enableWebSearch: true,
    });
  } catch (err) {
    const msg = err instanceof ClaudeError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    const errored: ItemExploration = {
      status: 'error',
      candidates: [],
      notes: '',
      last_explored_at: new Date().toISOString(),
      error_msg: msg.slice(0, 500),
    };
    await updateItem(itemId, { exploration: errored });
    throw err;
  }

  // Pull on-screen text from item.media (in case the existing pipeline already
  // OCR'd frames) plus what we observed.
  if (Array.isArray(item.media)) {
    onScreenText = mergeOnScreenText(item.media);
  }

  const exploration = toExploration(result, frames.length, onScreenText, visualCues);
  await updateItem(itemId, { exploration });

  return {
    status: exploration.status,
    framesAnalyzed: frames.length,
    primary: exploration.primary_link
      ? { url: exploration.primary_link.url, title: exploration.primary_link.title }
      : undefined,
    candidateCount: exploration.candidates.length,
  };
}
