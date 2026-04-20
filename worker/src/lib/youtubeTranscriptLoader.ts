import { createRequire } from 'node:module';

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

// youtube-transcript@1.3.0 ships CJS under `main` but sets `"type": "module"`,
// which breaks native ESM `import`. Load via createRequire at the edge of the
// worker so the rest of the codebase (and tests) can mock this module cleanly.
const require = createRequire(import.meta.url);

interface YoutubeTranscriptModule {
  YoutubeTranscript: Loaded;
}

const loaded = require('youtube-transcript') as YoutubeTranscriptModule;

export const YoutubeTranscript: Loaded = loaded.YoutubeTranscript;
