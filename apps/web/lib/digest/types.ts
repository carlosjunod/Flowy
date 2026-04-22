export interface DigestSection {
  category: string;
  summary: string;
  image_urls: string[];
  item_ids: string[];
}

export interface DigestContent {
  sections: DigestSection[];
  window_start: string;
  window_end: string;
}

export interface Digest {
  id: string;
  user: string;
  generated_at: string;
  content: DigestContent;
  items_count: number;
  categories_count: number;
  created: string;
  updated: string;
}

export interface DigestSettings {
  digest_enabled: boolean;
  digest_time: string;
}

const UTC_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidDigestTime(value: unknown): value is string {
  return typeof value === 'string' && UTC_TIME_RE.test(value);
}
