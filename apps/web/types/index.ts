export type ItemStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ItemType =
  | 'url'
  | 'screenshot'
  | 'youtube'
  | 'receipt'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'instagram'
  | 'reddit'
  | 'screen_recording';

export type ItemSource = 'share' | 'web' | 'bookmark_import';

export type MediaSlideKind = 'image' | 'video';

export interface MediaSlide {
  index: number;
  kind: MediaSlideKind;
  r2_key: string;
  source_url?: string;
  summary?: string;
  extracted_text?: string;
}

export interface Item {
  id: string;
  user: string;
  type: ItemType;
  raw_url?: string;
  r2_key?: string;
  title?: string;
  summary?: string;
  content?: string;
  tags: string[];
  category?: string;
  status: ItemStatus;
  error_msg?: string;
  source_url?: string;
  media?: MediaSlide[];
  og_image?: string;
  og_description?: string;
  site_name?: string;
  source?: ItemSource;
  import_batch?: string;
  original_title?: string;
  bookmarked_at?: string;
  created: string;
  updated: string;
}

export type ImportBatchStatus = 'running' | 'complete' | 'failed';

export interface ImportBatch {
  id: string;
  user: string;
  label?: string;
  status: ImportBatchStatus;
  total: number;
  completed_count: number;
  dead_count: number;
  failed_count: number;
  started_at: string;
  completed_at?: string;
  created: string;
  updated: string;
}

export interface Embedding {
  id: string;
  item: string;
  vector: number[];
  created: string;
}

export interface ChatMessageType {
  role: 'user' | 'assistant';
  content: string;
  items?: Item[];
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
