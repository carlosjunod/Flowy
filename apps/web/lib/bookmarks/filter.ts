import type { ParsedBookmark } from './parser';
import { normalizeUrl, sha256Hex } from '../url-normalize';

export type InvalidReason =
  | 'BAD_SCHEME'
  | 'LOCAL_HOST'
  | 'UNPARSEABLE_URL'
  | 'EMPTY_URL';

export interface RejectedBookmark {
  bookmark: ParsedBookmark;
  reason: InvalidReason;
}

export interface AcceptedBookmark {
  bookmark: ParsedBookmark;
  normalized_url: string;
  element_hash: string;
}

export interface BookmarkFilterResult {
  accepted: AcceptedBookmark[];
  rejected_invalid: RejectedBookmark[];
  duplicates_in_import: ParsedBookmark[];
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /\.local$/i,
];

export function isAllowedScheme(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function isLocalOrPrivateHost(hostname: string): boolean {
  if (!hostname) return true;
  if (!hostname.includes('.')) return true; // bare hostname → almost certainly intranet
  return PRIVATE_HOST_PATTERNS.some((p) => p.test(hostname));
}

function classify(bookmark: ParsedBookmark): InvalidReason | null {
  if (!bookmark.url) return 'EMPTY_URL';
  let parsed: URL;
  try {
    parsed = new URL(bookmark.url);
  } catch {
    return 'UNPARSEABLE_URL';
  }
  if (!isAllowedScheme(parsed)) return 'BAD_SCHEME';
  if (isLocalOrPrivateHost(parsed.hostname)) return 'LOCAL_HOST';
  return null;
}

export async function filterBookmarks(
  input: ParsedBookmark[],
): Promise<BookmarkFilterResult> {
  const rejected: RejectedBookmark[] = [];
  const duplicates: ParsedBookmark[] = [];
  const seen = new Map<string, AcceptedBookmark>();

  for (const bm of input) {
    const reason = classify(bm);
    if (reason) {
      rejected.push({ bookmark: bm, reason });
      continue;
    }
    const normalized = normalizeUrl(bm.url);
    if (!normalized) {
      rejected.push({ bookmark: bm, reason: 'UNPARSEABLE_URL' });
      continue;
    }
    const hash = await sha256Hex(normalized);
    if (seen.has(hash)) {
      duplicates.push(bm);
      continue;
    }
    seen.set(hash, { bookmark: bm, normalized_url: normalized, element_hash: hash });
  }

  return {
    accepted: Array.from(seen.values()),
    rejected_invalid: rejected,
    duplicates_in_import: duplicates,
  };
}
