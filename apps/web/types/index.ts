export type ItemStatus = 'pending' | 'processing' | 'ready' | 'error';
export type ItemType = 'url' | 'screenshot' | 'youtube' | 'receipt' | 'pdf' | 'audio';

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
