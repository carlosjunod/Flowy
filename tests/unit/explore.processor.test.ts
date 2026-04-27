import { describe, it, expect, vi, beforeEach } from 'vitest';

const getItemMock = vi.fn();
const updateItemMock = vi.fn();
const identifyContentMock = vi.fn();
const sampleVideoFramesMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  getItem: (...a: unknown[]) => getItemMock(...a),
  updateItem: (...a: unknown[]) => updateItemMock(...a),
}));

vi.mock('../../worker/src/lib/claude.js', () => ({
  identifyContent: (...a: unknown[]) => identifyContentMock(...a),
  ClaudeError: class extends Error { code = 'CLAUDE_ERROR'; },
  MODEL: 'claude-sonnet-4-5',
}));

vi.mock('../../worker/src/lib/videoFrames.js', () => ({
  sampleVideoFrames: (...a: unknown[]) => sampleVideoFramesMock(...a),
  VideoFramesError: class extends Error { code = 'VIDEO_FRAMES_ERROR'; },
}));

const { processExplore } = await import('../../worker/src/processors/explore.processor.js');

beforeEach(() => {
  getItemMock.mockReset();
  updateItemMock.mockReset().mockResolvedValue(undefined);
  identifyContentMock.mockReset();
  sampleVideoFramesMock.mockReset();
});

describe('processExplore', () => {
  it('text-only path: writes "exploring" then enriched with primary_link', async () => {
    getItemMock.mockResolvedValue({
      id: 'i1', user: 'u1', type: 'url', status: 'ready',
      title: 'Cool AI search tool', summary: 'open source', content: 'See github.com/foo/bar',
      tags: ['ai', 'search'], category: 'dev', source_url: 'https://twitter.com/x/status/1',
    });
    identifyContentMock.mockResolvedValue({
      status: 'enriched',
      primary_link: { url: 'https://github.com/foo/bar', title: 'foo/bar', kind: 'github', confidence: 0.9 },
      candidates: [],
      notes: 'Direct mention in body',
    });

    const outcome = await processExplore('i1', { includeVideoFrames: false });

    expect(updateItemMock).toHaveBeenCalledTimes(2);
    expect(updateItemMock.mock.calls[0]?.[1]).toMatchObject({ exploration: { status: 'exploring' } });
    expect(updateItemMock.mock.calls[1]?.[1]).toMatchObject({
      exploration: expect.objectContaining({
        status: 'enriched',
        primary_link: expect.objectContaining({ url: 'https://github.com/foo/bar', kind: 'github' }),
        candidates: [],
      }),
    });
    expect(outcome.status).toBe('enriched');
    expect(outcome.framesAnalyzed).toBe(0);
    expect(outcome.primary?.url).toBe('https://github.com/foo/bar');
    expect(sampleVideoFramesMock).not.toHaveBeenCalled();
  });

  it('video path: samples frames and passes them to identifyContent', async () => {
    getItemMock.mockResolvedValue({
      id: 'i2', user: 'u1', type: 'youtube', status: 'ready',
      title: 'Video that shows a repo on screen', summary: '', content: '[transcript without any URL]',
      tags: [], category: 'dev', source_url: 'https://youtube.com/watch?v=abc12345678',
    });
    sampleVideoFramesMock.mockResolvedValue([
      { buffer: Buffer.from('frame1'), mediaType: 'image/jpeg' },
      { buffer: Buffer.from('frame2'), mediaType: 'image/jpeg' },
    ]);
    identifyContentMock.mockResolvedValue({
      status: 'enriched',
      primary_link: { url: 'https://github.com/owner/repo', title: 'owner/repo', kind: 'github', confidence: 0.85 },
      candidates: [{ name: 'Repo Alt', url: 'https://example.com', kind: 'product', confidence: 0.5, reason: 'similar' }],
      notes: 'Repo URL visible in frame 2',
    });

    const outcome = await processExplore('i2', { includeVideoFrames: true });

    expect(sampleVideoFramesMock).toHaveBeenCalledTimes(1);
    const callArgs = sampleVideoFramesMock.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({ url: 'https://youtube.com/watch?v=abc12345678', count: 4 });

    expect(identifyContentMock).toHaveBeenCalledTimes(1);
    const idArgs = identifyContentMock.mock.calls[0]?.[0];
    expect(idArgs.frames).toHaveLength(2);
    expect(idArgs.frames[0].mediaType).toBe('image/jpeg');
    expect(idArgs.frames[0].data).toBe(Buffer.from('frame1').toString('base64'));

    expect(outcome.framesAnalyzed).toBe(2);
    const finalPatch = updateItemMock.mock.calls[1]?.[1] as { exploration: { video_insights?: { frames_analyzed: number } } };
    expect(finalPatch.exploration.video_insights?.frames_analyzed).toBe(2);
  });

  it('no_match: writes status no_match when identifyContent returns nothing', async () => {
    getItemMock.mockResolvedValue({ id: 'i3', user: 'u1', type: 'url', status: 'ready', title: 'Generic blog', tags: [] });
    identifyContentMock.mockResolvedValue({ status: 'no_match', primary_link: undefined, candidates: [], notes: '' });

    const outcome = await processExplore('i3', { includeVideoFrames: false });

    expect(outcome.status).toBe('no_match');
    expect(updateItemMock.mock.calls[1]?.[1]).toMatchObject({
      exploration: expect.objectContaining({ status: 'no_match', candidates: [] }),
    });
  });

  it('error: stores error status and rethrows when Claude throws', async () => {
    getItemMock.mockResolvedValue({ id: 'i4', user: 'u1', type: 'url', status: 'ready', title: 't', tags: [] });
    identifyContentMock.mockRejectedValue(new Error('claude boom'));

    await expect(processExplore('i4', { includeVideoFrames: false })).rejects.toThrow();

    expect(updateItemMock).toHaveBeenCalledTimes(2);
    expect(updateItemMock.mock.calls[1]?.[1]).toMatchObject({
      exploration: expect.objectContaining({ status: 'error', error_msg: expect.stringMatching(/claude boom/) }),
    });
  });

  it('frame sampling failure does not abort the run; falls back to text-only', async () => {
    getItemMock.mockResolvedValue({
      id: 'i5', user: 'u1', type: 'youtube', status: 'ready',
      title: 't', tags: [], source_url: 'https://youtube.com/watch?v=zzz12345678',
    });
    sampleVideoFramesMock.mockRejectedValue(new Error('yt-dlp failed'));
    identifyContentMock.mockResolvedValue({
      status: 'enriched',
      primary_link: { url: 'https://github.com/x/y', title: 'x/y', kind: 'github', confidence: 0.8 },
      candidates: [],
      notes: '',
    });

    const outcome = await processExplore('i5', { includeVideoFrames: true });
    expect(outcome.framesAnalyzed).toBe(0);
    expect(outcome.status).toBe('enriched');
    const idArgs = identifyContentMock.mock.calls[0]?.[0];
    expect(idArgs.frames).toBeUndefined();
  });
});
