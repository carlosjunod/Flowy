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
  | 'screen_recording';

export type MediaSlideKind = 'image' | 'video';

export interface MediaSlide {
  index: number;
  kind: MediaSlideKind;
  r2_key: string;
  source_url?: string;
  summary?: string;
  extracted_text?: string;
}

export type ExplorationStatus = 'exploring' | 'enriched' | 'no_match' | 'error';
export type ExplorationLinkKind = 'github' | 'product' | 'docs' | 'app_store' | 'other';

export interface ExplorationLink {
  url: string;
  title: string;
  kind: ExplorationLinkKind;
  confidence: number;
}

export interface ExplorationCandidate {
  name: string;
  url?: string;
  kind: ExplorationLinkKind;
  confidence: number;
  reason: string;
}

export interface ExplorationVideoInsights {
  frames_analyzed: number;
  on_screen_text: string;
  visual_cues: string[];
}

export interface ItemExploration {
  status: ExplorationStatus;
  primary_link?: ExplorationLink;
  candidates: ExplorationCandidate[];
  video_insights?: ExplorationVideoInsights;
  notes?: string;
  last_explored_at: string;
  error_msg?: string;
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
  exploration?: ItemExploration;
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
