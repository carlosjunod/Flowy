declare module '@extractus/article-extractor' {
  export interface ArticleData {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
    author?: string;
    content?: string;
    published?: string;
    source?: string;
    links?: string[];
    ttr?: number;
  }
  export function extract(
    input: string,
    parserOptions?: Record<string, unknown>,
    fetchOptions?: Record<string, unknown>,
  ): Promise<ArticleData | null>;
  export function extractFromHtml(html: string, url?: string): Promise<ArticleData | null>;
}

declare module 'youtube-transcript' {
  export interface TranscriptChunk {
    text: string;
    duration: number;
    offset: number;
    lang?: string;
  }
  export class YoutubeTranscript {
    static fetchTranscript(
      url: string,
      config?: { lang?: string; country?: string },
    ): Promise<TranscriptChunk[]>;
  }
}

declare module 'youtube-transcript/dist/youtube-transcript.esm.js' {
  export * from 'youtube-transcript';
}
