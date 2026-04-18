import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

type ExecCb = (err: (Error & { stderr?: string }) | null, stdout?: string, stderr?: string) => void;
type ExecImpl = (cmd: string, args: string[], opts: unknown, cb: ExecCb) => void;

const execFileCallback = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const [cmd, cargs, opts, cb] = args as [string, string[], unknown, ExecCb];
    return (execFileCallback as unknown as ExecImpl)(cmd, cargs, opts, cb);
  },
}));

const transcribeMock = vi.fn();
vi.mock('openai', () => {
  class MockOpenAI {
    constructor(_: unknown) { /* noop */ }
    audio = { transcriptions: { create: (args: unknown) => transcribeMock(args) } };
  }
  return { default: MockOpenAI };
});

const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();
vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  createEmbedding: (...args: unknown[]) => createEmbeddingMock(...args),
  getItem: async () => ({}),
  pb: {},
  ensureAuth: async () => undefined,
}));

const extractStructuredDataMock = vi.fn();
const generateEmbeddingMock = vi.fn();
vi.mock('../../worker/src/lib/claude.js', () => ({
  extractStructuredData: (...args: unknown[]) => extractStructuredDataMock(...args),
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
  ClaudeError: class extends Error { code = 'CLAUDE_ERROR'; },
}));

const uploadFileMock = vi.fn();
vi.mock('../../worker/src/lib/storage.js', () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

const { processVideo, detectPlatform } = await import('../../worker/src/processors/video.js');

// Create a dummy yt-dlp output via the mocked execFile side-effect.
function mockYtDlpSuccess(itemId: string, opts: { withThumbnail?: boolean } = {}): void {
  const impl: ExecImpl = (cmd, _args, _opts, cb) => {
    if (cmd === 'yt-dlp') {
      const audio = join(tmpdir(), `tryflowy-${itemId}.mp3`);
      const thumb = join(tmpdir(), `tryflowy-${itemId}.jpg`);
      try { mkdirSync(tmpdir(), { recursive: true }); } catch { /* ignore */ }
      writeFileSync(audio, Buffer.from('fake-audio'));
      if (opts.withThumbnail !== false) writeFileSync(thumb, Buffer.from('fake-jpg'));
      cb(null, '', '');
      return;
    }
    if (cmd === 'ffmpeg') { cb(null, '', ''); return; }
    cb(null, '', '');
  };
  execFileCallback.mockImplementation(impl as unknown as () => void);
}

function mockYtDlpFail(message: string): void {
  const impl: ExecImpl = (_cmd, _args, _opts, cb) => {
    const err = new Error('Command failed') as Error & { stderr?: string };
    err.stderr = message;
    cb(err);
  };
  execFileCallback.mockImplementation(impl as unknown as () => void);
}

function baseItem(raw_url: string, id = `vid_${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    user: 'u1',
    type: 'video' as const,
    status: 'processing' as const,
    raw_url,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('detectPlatform', () => {
  it.each([
    ['https://www.tiktok.com/@user/video/7123456789012345678', 'tiktok'],
    ['https://vm.tiktok.com/abcdef/', 'tiktok'],
    ['https://www.instagram.com/reel/XYZ/', 'instagram'],
    ['https://instagram.com/p/XYZ/', 'instagram'],
  ])('detects %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });
  it('returns null for unknown', () => {
    expect(detectPlatform('https://example.com/video')).toBeNull();
  });
});

describe('processVideo', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    execFileCallback.mockReset();
    transcribeMock.mockReset().mockResolvedValue('hello this is a transcript');
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    extractStructuredDataMock.mockReset().mockResolvedValue({
      title: 'Video', summary: 'summary', tags: ['tag'], category: 'misc',
    });
    generateEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    uploadFileMock.mockReset().mockResolvedValue('https://files/thumb');
  });

  it('valid TikTok → yt-dlp called, transcription called, item updated ready with r2_key', async () => {
    const item = baseItem('https://www.tiktok.com/@user/video/7123456789012345678');
    mockYtDlpSuccess(item.id);
    await processVideo(item);
    expect(execFileCallback).toHaveBeenCalledWith('yt-dlp', expect.any(Array), expect.any(Object), expect.any(Function));
    expect(transcribeMock).toHaveBeenCalledOnce();
    expect(uploadFileMock).toHaveBeenCalledWith(
      `thumbnails/${item.id}.jpg`, expect.any(Buffer), 'image/jpeg',
    );
    expect(updateItemMock).toHaveBeenCalledWith(item.id, expect.objectContaining({
      status: 'ready', title: 'Video', source_url: item.raw_url, r2_key: `thumbnails/${item.id}.jpg`,
    }));
    expect(createEmbeddingMock).toHaveBeenCalled();
  });

  it('valid Instagram Reel → same flow', async () => {
    const item = baseItem('https://www.instagram.com/reel/XYZ/');
    mockYtDlpSuccess(item.id);
    await processVideo(item);
    expect(updateItemMock).toHaveBeenCalledWith(item.id, expect.objectContaining({ status: 'ready' }));
  });

  it('unsupported URL → throws UNSUPPORTED_VIDEO_URL', async () => {
    await expect(processVideo(baseItem('https://example.com/video'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_VIDEO_URL',
    });
    expect(execFileCallback).not.toHaveBeenCalled();
  });

  it('yt-dlp non-zero → throws DOWNLOAD_FAILED', async () => {
    mockYtDlpFail('ERROR: Unable to extract data');
    await expect(processVideo(baseItem('https://vm.tiktok.com/abc/'))).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
  });

  it('yt-dlp private profile → throws PRIVATE_PROFILE', async () => {
    mockYtDlpFail('ERROR: This video is private');
    await expect(processVideo(baseItem('https://www.instagram.com/reel/xyz/'))).rejects.toMatchObject({
      code: 'PRIVATE_PROFILE',
    });
  });

  it('transcription fails → throws TRANSCRIPTION_FAILED', async () => {
    const item = baseItem('https://www.tiktok.com/@u/video/123456789012345');
    mockYtDlpSuccess(item.id);
    transcribeMock.mockRejectedValue(new Error('api down'));
    await expect(processVideo(item)).rejects.toMatchObject({ code: 'TRANSCRIPTION_FAILED' });
  });

  it('no thumbnail → item ready without r2_key', async () => {
    const item = baseItem('https://vm.tiktok.com/noThumb/');
    mockYtDlpSuccess(item.id, { withThumbnail: false });
    await processVideo(item);
    const patch = updateItemMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch.status).toBe('ready');
    expect(patch.r2_key).toBeUndefined();
  });
});
