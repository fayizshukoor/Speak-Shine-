import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";
import FrameCache from "../models/frameCacheSchema.js";

const FRAME_COUNT = 8;
const GROQ_BATCH_LIMIT = 4; // split 8 frames into 2 batches of 4 (well under the 5-image limit)

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) { console.log("ffprobe error:", err.message); return resolve(60); }
        const dur = parseFloat((stdout || "").trim());
        resolve(isNaN(dur) || dur <= 0 ? 60 : dur);
      }
    );
  });
}

/**
 * Extracts a single frame, stores it in MongoDB, and returns the DB _id.
 * The base64 string is never held in Node.js heap beyond this function.
 */
async function extractAndStoreFrame(videoPath, timestamp, videoId, frameIndex) {
  return new Promise((resolve) => {
    const framePath = `${videoPath}_frame_${timestamp}.jpg`;
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${framePath}" -y`,
      async (err) => {
        if (err) return resolve(null);
        if (!fs.existsSync(framePath)) return resolve(null);
        try {
          const buffer = fs.readFileSync(framePath);
          fs.unlinkSync(framePath);
          if (buffer.length < 1000) return resolve(null);

          // Store in MongoDB — free buffer from memory immediately
          const base64 = buffer.toString("base64");
          const doc = await FrameCache.create({ videoId, frameIndex, timestamp, base64 });
          return resolve(doc._id);
        } catch (e) {
          console.log("Frame store error:", e.message);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Extracts FRAME_COUNT frames spaced evenly by video duration.
 * Timestamp formula: Math.floor(duration / FRAME_COUNT * i) for i = 1..FRAME_COUNT
 * e.g. 120s video → timestamps at 15, 30, 45, 60, 75, 90, 105, 120s
 */
async function extractAndStoreFrames(videoPath, videoId) {
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  const duration = await getVideoDuration(videoPath);

  // duration / FRAME_COUNT spacing — e.g. 120s / 8 = every 15s
  const timestamps = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    timestamps.push(Math.max(1, Math.floor((duration / FRAME_COUNT) * i)));
  }

  console.log(`[Visual] duration=${duration}s, interval=${(duration / FRAME_COUNT).toFixed(1)}s, timestamps=[${timestamps.join(", ")}]`);

  // Extract sequentially — one frame in memory at a time
  const ids = [];
  for (let i = 0; i < timestamps.length; i++) {
    const id = await extractAndStoreFrame(videoPath, timestamps[i], videoId, i);
    if (id) ids.push(id);
  }

  return ids;
}

/**
 * Sends one batch of frameDocs to Groq Vision and returns the parsed result.
 * Returns null on any failure.
 */
async function analyzeFrameBatch(frameDocs, batchLabel, GROQ_API_KEY) {
  const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.
Analyze these ${frameDocs.length} frame(s) and evaluate non-verbal communication.
Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<observation>","bodyLanguageNote":"<observation>","expressionNote":"<observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

  const userContent = [
    { type: "text", text: prompt },
    ...frameDocs.map((doc) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${doc.base64}` },
    })),
  ];

  // Free base64 from memory before the API call
  frameDocs.forEach((doc) => { doc.base64 = null; });

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{ role: "user", content: userContent }],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const e = await res.text();
    console.log(`[Visual] ${batchLabel} Groq HTTP ${res.status}:`, e.slice(0, 300));
    return null;
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) { console.log(`[Visual] ${batchLabel} no text returned`); return null; }

  let jsonStr = raw;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    jsonStr = fence[1].trim();
  } else {
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
  }
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.log(`[Visual] ${batchLabel} JSON parse failed, attempting partial extraction`);
    const extract = (key) => {
      const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
      return m ? parseInt(m[1]) : null;
    };
    const eyeContact = extract("eyeContact");
    const bodyLanguage = extract("bodyLanguage");
    const facialExpression = extract("facialExpression");
    const overallPresence = extract("overallPresence");
    if (eyeContact === null && bodyLanguage === null) return null;
    return {
      eyeContact, bodyLanguage, facialExpression, overallPresence,
      eyeContactNote: "Analysis partially available.",
      bodyLanguageNote: "Analysis partially available.",
      expressionNote: "Analysis partially available.",
      visualSuggestions: [], visualStrengths: [],
    };
  }
}

/**
 * Merges two batch results by averaging numeric scores and combining text/arrays.
 * If only one batch succeeded, returns that result directly.
 */
function mergeBatchResults(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const avg = (x, y) => Math.round((x + y) / 2);

  return {
    eyeContact:       avg(a.eyeContact,       b.eyeContact),
    bodyLanguage:     avg(a.bodyLanguage,      b.bodyLanguage),
    facialExpression: avg(a.facialExpression,  b.facialExpression),
    overallPresence:  avg(a.overallPresence,   b.overallPresence),
    // Use the more detailed note (longer string wins)
    eyeContactNote:   (a.eyeContactNote?.length ?? 0) >= (b.eyeContactNote?.length ?? 0)
                        ? a.eyeContactNote : b.eyeContactNote,
    bodyLanguageNote: (a.bodyLanguageNote?.length ?? 0) >= (b.bodyLanguageNote?.length ?? 0)
                        ? a.bodyLanguageNote : b.bodyLanguageNote,
    expressionNote:   (a.expressionNote?.length ?? 0) >= (b.expressionNote?.length ?? 0)
                        ? a.expressionNote : b.expressionNote,
    // Deduplicate and combine suggestions/strengths
    visualSuggestions: [...new Set([...(a.visualSuggestions ?? []), ...(b.visualSuggestions ?? [])])],
    visualStrengths:   [...new Set([...(a.visualStrengths ?? []),   ...(b.visualStrengths ?? [])])],
  };
}

export async function analyzeVideo(videoPath) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) { console.log("GROQ_API_KEY not set"); return null; }

  const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let frameIds = [];
  try {
    frameIds = await extractAndStoreFrames(videoPath, videoId);
  } catch (err) {
    console.log("Visual frame extraction error:", err.message);
    return null;
  }

  if (frameIds.length === 0) {
    console.log("No frames stored");
    return null;
  }

  try {
    const frameDocs = await FrameCache.find({ videoId }).sort({ frameIndex: 1 }).lean();
    console.log(`[Visual] ${frameDocs.length} frames retrieved, splitting into batches of ${GROQ_BATCH_LIMIT}`);

    // Split into batches of GROQ_BATCH_LIMIT (4), send in parallel
    const batches = [];
    for (let i = 0; i < frameDocs.length; i += GROQ_BATCH_LIMIT) {
      batches.push(frameDocs.slice(i, i + GROQ_BATCH_LIMIT));
    }

    const batchResults = await Promise.all(
      batches.map((batch, idx) =>
        analyzeFrameBatch(batch, `batch${idx + 1}/${batches.length}`, GROQ_API_KEY)
      )
    );

    // Clean up DB frames
    await FrameCache.deleteMany({ videoId }).catch(() => {});

    // Merge all batch results
    const merged = batchResults.reduce((acc, result) => mergeBatchResults(acc, result), null);

    if (!merged) {
      console.log("[Visual] All batches failed");
      return null;
    }

    console.log("Visual analysis complete:", JSON.stringify(merged).slice(0, 150));
    return merged;

  } catch (err) {
    await FrameCache.deleteMany({ videoId }).catch(() => {});
    console.log("Visual analysis failed:", err.message);
    return null;
  }
}
