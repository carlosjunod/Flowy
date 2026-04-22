import type { ItemRecord } from '../pocketbase.js';

export interface DigestItemRef {
  id: string;
  title: string;
  source_url?: string;
  image_url?: string;
}

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

export interface DigestRecord {
  id: string;
  user: string;
  generated_at: string;
  content: DigestContent;
  items_count: number;
  categories_count: number;
  created: string;
  updated: string;
}

export type GroupedItems = Map<string, ItemRecord[]>;
