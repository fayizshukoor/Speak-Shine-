/**
 * Bug Condition + Fix Verification Tests for visual-analysis-failure-fix
 *
 * Validates that 8 frames are extracted and sent in 2 batches of 4,
 * each batch staying within the Groq Vision API 5-image limit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import { exec } from 'child_process';

vi.mock('fs');
vi.mock('child_process');
vi.mock('node-fetch');

vi.mock('../models/frameCacheSchema.js', () => {
  const FrameCache = {
    create: vi.fn(),
    find: vi.fn(),
    deleteMany: vi.fn(),
  };
  return { default: FrameCache };
});

const { analyzeVideo } = await import('./analyzeVideo.js');
const fetch = (await import('node-fetch')).default;
const FrameCache = (await import('../models/frameCacheSchema.js')).default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockExec(duration = 120) {
  exec.mockImplementation((cmd, callback) => {
    if (cmd.includes('ffprobe')) {
      callback(null, `${duration}\n`, '');
    } else {
      callback(null, '', '');
    }
  });
}

function mockFs(videoPath) {
  fs.existsSync.mockImplementation((p) => p === videoPath || p.includes('_frame_'));
  fs.readFileSync.mockReturnValue(Buffer.alloc(2000, 0xff));
  fs.unlinkSync.mockImplementation(() => {});
}

function mockFrameCache() {
  let stored = [];

  FrameCache.create.mockImplementation(async ({ videoId, frameIndex, timestamp, base64 }) => {
    const _id = `id_${frameIndex}`;
    stored.push({ _id, videoId, frameIndex, timestamp, base64 });
    return { _id };
  });

  FrameCache.find.mockImplementation(() => {
    const sorted = [...stored].sort((a, b) => a.frameIndex - b.frameIndex);
    return { sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(sorted) };
  });

  FrameCache.deleteMany.mockResolvedValue({});

  return { getStored: () => stored };
}

/** Returns a mock fetch that records each call's image count and always succeeds. */
function mockFetchSuccess() {
  const calls = []; // [{imageCount}]

  fetch.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.messages[0].content;
    const imageCount = content.filter(i => i.type === 'image_url').length;
    calls.push({ imageCount });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              eyeContact: 7, bodyLanguage: 8, facialExpression: 6, overallPresence: 7,
              eyeContactNote: 'Good engagement', bodyLanguageNote: 'Confident posture',
              expressionNote: 'Natural expressions',
              visualSuggestions: ['Maintain eye contact'],
              visualStrengths: ['Strong presence'],
            }),
          },
        }],
      }),
    };
  });

  return { getCalls: () => calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Visual Analysis — 8 frames via 2 batches of 4', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts 8 frames and sends them in 2 API calls, each with ≤5 images', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120); // 2-minute video → interval = 120/8 = 15s
    mockFs(videoPath);
    mockFrameCache();
    const { getCalls } = mockFetchSuccess();

    const result = await analyzeVideo(videoPath);

    const calls = getCalls();
    expect(calls).toHaveLength(2);                          // 2 batches
    calls.forEach(c => expect(c.imageCount).toBeLessThanOrEqual(5)); // each ≤ 5
    expect(calls.reduce((s, c) => s + c.imageCount, 0)).toBe(8);    // total = 8

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('eyeContact');
    expect(result).toHaveProperty('bodyLanguage');
    expect(result).toHaveProperty('facialExpression');
    expect(result).toHaveProperty('overallPresence');
  });

  it('timestamps are spaced by duration/8 (e.g. 120s → every 15s)', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);
    const { getStored } = mockFrameCache();
    mockFetchSuccess();

    await analyzeVideo(videoPath);

    const timestamps = getStored().map(f => f.timestamp);
    expect(timestamps).toHaveLength(8);
    // 120/8 = 15 → expected: 15, 30, 45, 60, 75, 90, 105, 120
    expect(timestamps).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });

  it('merges scores from both batches — validator produces final reconciled result', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);
    mockFrameCache();

    let callCount = 0;
    fetch.mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body);
      const isTextOnly = !body.messages[0].content.some?.(i => i?.type === 'image_url')
        && typeof body.messages[0].content === 'string';

      // Batch 1: eye contact 6, body language 8
      // Batch 2: eye contact 8, body language 6
      // Validator (3rd call, text-only): reconciles to 7 each
      if (callCount === 3 || isTextOnly) {
        return {
          ok: true, status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  eyeContact: 7, bodyLanguage: 7, facialExpression: 7, overallPresence: 7,
                  eyeContactNote: 'Reconciled note', bodyLanguageNote: 'Reconciled note',
                  expressionNote: 'Reconciled note',
                  visualSuggestions: ['tip'], visualStrengths: ['strength'],
                }),
              },
            }],
          }),
        };
      }

      const scores = callCount === 1
        ? { eyeContact: 6, bodyLanguage: 8, facialExpression: 6, overallPresence: 6 }
        : { eyeContact: 8, bodyLanguage: 6, facialExpression: 8, overallPresence: 8 };

      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                ...scores,
                eyeContactNote: 'note', bodyLanguageNote: 'note',
                expressionNote: 'note', visualSuggestions: ['tip'], visualStrengths: ['strength'],
              }),
            },
          }],
        }),
      };
    });

    const result = await analyzeVideo(videoPath);

    // Validator reconciles to 7 for all scores
    expect(result.eyeContact).toBe(7);
    expect(result.bodyLanguage).toBe(7);
    expect(result.facialExpression).toBe(7);
    expect(result.overallPresence).toBe(7);
    expect(result.eyeContactNote).toBe('Reconciled note');
  });

  it('returns partial result if one batch fails', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);
    mockFrameCache();

    let callCount = 0;
    fetch.mockImplementation(async (_url, options) => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, text: async () => 'Internal Server Error' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                eyeContact: 7, bodyLanguage: 8, facialExpression: 6, overallPresence: 7,
                eyeContactNote: 'Good', bodyLanguageNote: 'Good', expressionNote: 'Good',
                visualSuggestions: ['tip'], visualStrengths: ['strength'],
              }),
            },
          }],
        }),
      };
    });

    const result = await analyzeVideo(videoPath);
    expect(result).not.toBeNull();
    expect(result.eyeContact).toBe(7);
  });

  it('makes 3 API calls total: 2 vision batches + 1 text validator', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);
    mockFrameCache();

    const apiCalls = [];
    fetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      const hasImages = Array.isArray(body.messages[0].content) &&
        body.messages[0].content.some(i => i?.type === 'image_url');
      apiCalls.push({ model: body.model, hasImages });

      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                eyeContact: 7, bodyLanguage: 7, facialExpression: 7, overallPresence: 7,
                eyeContactNote: 'Good', bodyLanguageNote: 'Good', expressionNote: 'Good',
                visualSuggestions: ['tip'], visualStrengths: ['strength'],
              }),
            },
          }],
        }),
      };
    });

    await analyzeVideo(videoPath);

    expect(apiCalls).toHaveLength(3);
    expect(apiCalls[0].hasImages).toBe(true);  // batch 1 — vision
    expect(apiCalls[1].hasImages).toBe(true);  // batch 2 — vision
    expect(apiCalls[2].hasImages).toBe(false); // validator — text only
    expect(apiCalls[2].model).toBe('llama-3.3-70b-versatile');
  });

  it('returns null when GROQ_API_KEY is not set', async () => {
    delete process.env.GROQ_API_KEY;
    const result = await analyzeVideo('test_video.mp4');
    expect(result).toBeNull();
  });

  it('returns null when no frames are extracted', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    fs.existsSync.mockReturnValue(false); // video file not found
    const result = await analyzeVideo(videoPath);
    expect(result).toBeNull();
  });

  it('Property: for any video duration, each batch has ≤5 images and total = 8', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 600 }).map(d => ({ duration: d, path: `vid_${d}.mp4` })),
        async ({ duration, path: videoPath }) => {
          vi.clearAllMocks();
          mockExec(duration);
          mockFs(videoPath);
          mockFrameCache();
          const { getCalls } = mockFetchSuccess();

          await analyzeVideo(videoPath);

          const calls = getCalls();
          expect(calls.length).toBeGreaterThan(0);
          calls.forEach(c => expect(c.imageCount).toBeLessThanOrEqual(5));
          expect(calls.reduce((s, c) => s + c.imageCount, 0)).toBe(8);
        }
      ),
      { numRuns: 20 }
    );
  });
});
