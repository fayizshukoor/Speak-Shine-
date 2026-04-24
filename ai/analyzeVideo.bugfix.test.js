/**
 * Bug Condition + Fix Verification Tests for visual-analysis-failure-fix
 *
 * Validates that 8 frames are extracted and sent in 2 batches of 4,
 * each batch staying within the Groq Vision API 5-image limit.
 * Frames are now stored as temp files on disk (not MongoDB).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';

vi.mock('fs');
vi.mock('child_process');
vi.mock('node-fetch');

// Mock the key manager
vi.mock('./groqKeyManager.js', () => ({
  getVisionKey: vi.fn(() => 'test-api-key'),
  markKeyExhausted: vi.fn(),
  parseRetryAfter: vi.fn(() => 0),
  keyStatus: vi.fn(() => '1 key(s) configured (1 available, 0 exhausted)'),
  keyCount: vi.fn(() => 1),
}));

const { analyzeVideo } = await import('./analyzeVideo.js');
const fetch = (await import('node-fetch')).default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockExec(duration = 120) {
  exec.mockImplementation((cmd, callback) => {
    if (cmd.includes('ffprobe')) {
      callback(null, `${duration}\n`, '');
    } else {
      // ffmpeg — simulate frame file creation
      callback(null, '', '');
    }
  });
}

function mockFs(videoPath) {
  fs.existsSync.mockImplementation((p) => {
    // video file exists, frame files exist after ffmpeg
    if (p === videoPath) return true;
    if (p.includes('frame_')) return true;
    return false;
  });
  fs.mkdirSync.mockImplementation(() => {});
  fs.statSync.mockReturnValue({ size: 5000 }); // frame file size > 1000
  fs.readFileSync.mockReturnValue(Buffer.alloc(5000, 0xff)); // valid frame data
  fs.unlinkSync.mockImplementation(() => {});
  fs.rmdirSync.mockImplementation(() => {});
}

function mockFetchSuccess() {
  const calls = [];

  fetch.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.messages[0].content;
    const imageCount = Array.isArray(content)
      ? content.filter(i => i?.type === 'image_url').length
      : 0;
    calls.push({ imageCount, model: body.model });

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

describe('Visual Analysis — 8 frames via 2 batches of 4 (disk-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts 8 frames and sends them in 2 API calls, each with ≤5 images', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);
    const { getCalls } = mockFetchSuccess();

    const result = await analyzeVideo(videoPath);

    const calls = getCalls().filter(c => c.imageCount > 0); // vision calls only
    expect(calls).toHaveLength(2);
    calls.forEach(c => expect(c.imageCount).toBeLessThanOrEqual(5));
    expect(calls.reduce((s, c) => s + c.imageCount, 0)).toBe(8);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('eyeContact');
    expect(result).toHaveProperty('bodyLanguage');
    expect(result).toHaveProperty('facialExpression');
    expect(result).toHaveProperty('overallPresence');
  });

  it('merges scores from both batches — validator produces final reconciled result', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);

    let callCount = 0;
    fetch.mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body);
      const content = body.messages[0].content;
      const hasImages = Array.isArray(content) && content.some(i => i?.type === 'image_url');

      if (!hasImages) {
        // validator call
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
    expect(result.eyeContact).toBe(7);
    expect(result.eyeContactNote).toBe('Reconciled note');
  });

  it('makes 3 API calls total: 2 vision batches + 1 text validator', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);

    const apiCalls = [];
    fetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      const content = body.messages[0].content;
      const hasImages = Array.isArray(content) && content.some(i => i?.type === 'image_url');
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
    expect(apiCalls[0].hasImages).toBe(true);
    expect(apiCalls[1].hasImages).toBe(true);
    expect(apiCalls[2].hasImages).toBe(false);
    expect(apiCalls[2].model).toBe('llama-3.3-70b-versatile');
  });

  it('returns partial result if one batch fails', async () => {
    const videoPath = 'test_video.mp4';
    mockExec(120);
    mockFs(videoPath);

    let callCount = 0;
    fetch.mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body);
      const content = body.messages[0].content;
      const hasImages = Array.isArray(content) && content.some(i => i?.type === 'image_url');

      if (hasImages && callCount === 1) {
        return { ok: false, status: 500, text: async () => 'Internal Server Error' };
      }
      return {
        ok: true, status: 200,
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

  it('returns null when no API keys are configured', async () => {
    const { getVisionKey } = await import('./groqKeyManager.js');
    getVisionKey.mockReturnValueOnce(null);
    const result = await analyzeVideo('test_video.mp4');
    expect(result).toBeNull();
  });

  it('returns null when video file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    exec.mockImplementation((cmd, callback) => callback(null, '60\n', ''));
    const result = await analyzeVideo('nonexistent.mp4');
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
          const { getCalls } = mockFetchSuccess();

          await analyzeVideo(videoPath);

          const calls = getCalls().filter(c => c.imageCount > 0);
          expect(calls.length).toBeGreaterThan(0);
          calls.forEach(c => expect(c.imageCount).toBeLessThanOrEqual(5));
          expect(calls.reduce((s, c) => s + c.imageCount, 0)).toBe(8);
        }
      ),
      { numRuns: 20 }
    );
  });
});
