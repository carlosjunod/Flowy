import { YoutubeTranscript as Impl } from 'youtube-transcript/dist/youtube-transcript.esm.js';

export interface TranscriptChunk {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

interface Loaded {
  fetchTranscript(
    url: string,
    config?: { lang?: string; country?: string },
  ): Promise<TranscriptChunk[]>;
}

// youtube-transcript@1.3.0 declares `"type": "module"` but its `main`
// (dist/youtube-transcript.common.js) is actually CJS. On Node 20.19+ / 22+
// `require(esm)` is enabled by default, so createRequire() no longer shields us:
// Node parses the CJS file as ESM and crashes on `exports is not defined`.
// The package also ships a real ESM bundle at dist/youtube-transcript.esm.js,
// so we import that subpath directly and bypass the broken `main`.
export const YoutubeTranscript: Loaded = Impl;
