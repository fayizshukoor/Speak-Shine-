import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";
import FrameCache from "../models/frameCacheSchema.js";

const FRAME_COUNT = 8;
const GROQ_BATCH_LIMIT = 4; // split 8 frames into 2 batches of 4 (well under the 5-image limit)

/** Formats seconds as m:ss (e.g. 75 → "1:15") */
function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

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

  // Extract all frames in parallel — each stores directly to MongoDB so memory stays low
  const results = await Promise.all(
    timestamps.map((ts, i) => extractAndStoreFrame(videoPath, ts, videoId, i))
  );

  return results.filter(Boolean);
}

/**
 * Sends one batch of frameDocs to Groq Vision and returns the parsed result.
 * batchInfo: { index: 0-based batch number, total: total batches, startSec, endSec }
 * Returns null on any failure.
 */
async function analyzeFrameBatch(frameDocs, batchLabel, GROQ_API_KEY, batchInfo = {}) {
  const { index = 0, total = 1, startSec = null, endSec = null } = batchInfo;

  // Tell the model which part of the video these frames cover so its notes are accurate
  const timeContext = (startSec !== null && endSec !== null)
    ? `These ${frameDocs.length} frame(s) are from the ${index === 0 ? "first" : index === total - 1 ? "last" : "middle"} part of the video (approximately ${formatSec(startSec)}–${formatSec(endSec)}).`
    : `These ${frameDocs.length} frame(s) are from part ${index + 1} of ${total} of the video.`;

  const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.
${timeContext}
Evaluate non-verbal communication based on what you observe in these frames.
Do NOT reference frame numbers in your notes — describe what you see naturally (e.g. "The speaker maintains good eye contact" not "In frame 1...").
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
    const is429 = res.status === 429;
    console.log(`[Visual] ${batchLabel} Groq HTTP ${res.status}:`, e.slice(0, 300));
    if (is429) console.log(`[Visual] ⚠️ Daily token limit reached — visual analysis will be skipped until quota resets`);
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
 * Merges two batch results by averaging numeric scores and combining notes/arrays.
 * If only one batch succeeded, returns that result directly.
 */
function mergeBatchResults(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const avg = (x, y) => Math.round((x + y) / 2);

  // Combine notes: join both observations so neither batch is dropped.
  // Skip if they're identical or one is the generic fallback.
  const combineNotes = (noteA, noteB) => {
    const a = (noteA || "").trim();
    const b = (noteB || "").trim();
    if (!a) return b;
    if (!b) return a;
    if (a === b) return a;
    if (a === "Analysis partially available." || b === "Analysis partially available.") {
      return a === "Analysis partially available." ? b : a;
    }
    return `${a} ${b}`;
  };

  return {
    eyeContact:       avg(a.eyeContact,       b.eyeContact),
    bodyLanguage:     avg(a.bodyLanguage,      b.bodyLanguage),
    facialExpression: avg(a.facialExpression,  b.facialExpression),
    overallPresence:  avg(a.overallPresence,   b.overallPresence),
    eyeContactNote:   combineNotes(a.eyeContactNote,   b.eyeContactNote),
    bodyLanguageNote: combineNotes(a.bodyLanguageNote, b.bodyLanguageNote),
    expressionNote:   combineNotes(a.expressionNote,   b.expressionNote),
    // Deduplicate and combine suggestions/strengths
    visualSuggestions: [...new Set([...(a.visualSuggestions ?? []), ...(b.visualSuggestions ?? [])])],
    visualStrengths:   [...new Set([...(a.visualStrengths ?? []),   ...(b.visualStrengths ?? [])])],
  };
}

/**
 * Validation pass — sends all batch assessments to a text-only LLM.
 * The validator reviews every batch result, spots contradictions, and
 * produces a single reconciled, accurate final score + clean notes.
 *
 * Falls back to `merged` if the validation call fails.
 *
 * @param {object[]} batchResults  - Array of non-null batch results
 * @param {object}   merged        - Pre-merged fallback result
 * @param {string}   GROQ_API_KEY
 * @returns {Promise<object|null>}
 */
async function validateAndReconcile(batchResults, merged, GROQ_API_KEY) {
  // Summarise each batch result as readable text for the validator
  const batchSummaries = batchResults.map((r, i) => {
    return `Assessment ${i + 1} (${i === 0 ? "first half" : i === batchResults.length - 1 ? "second half" : `part ${i + 1}`} of video):
- Eye Contact: ${r.eyeContact}/10 — ${r.eyeContactNote ?? ""}
- Body Language: ${r.bodyLanguage}/10 — ${r.bodyLanguageNote ?? ""}
- Facial Expression: ${r.facialExpression}/10 — ${r.expressionNote ?? ""}
- Overall Presence: ${r.overallPresence}/10
- Strengths: ${(r.visualStrengths ?? []).join("; ") || "none noted"}
- Suggestions: ${(r.visualSuggestions ?? []).join("; ") || "none noted"}`;
  }).join("\n\n");

  const prompt = `You are a senior public speaking coach reviewing multiple partial assessments of the same student's video presentation. Each assessment covers a different segment of the video.

Your job is to:
1. Reconcile any contradictions between assessments (e.g. one says eye contact is 8, another says 3 — find the accurate overall picture)
2. Produce a single final score for each dimension that reflects the WHOLE video
3. Write clean, natural observation notes (no "assessment 1 says..." — just describe the student directly)
4. Keep suggestions and strengths that are genuinely useful, remove duplicates

Here are the partial assessments:

${batchSummaries}

Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<one clear observation>","bodyLanguageNote":"<one clear observation>","expressionNote":"<one clear observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // text-only model — fast and accurate for reconciliation
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // low temperature for consistent, factual output
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const e = await res.text();
      console.log(`[Visual] validator HTTP ${res.status}:`, e.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) { console.log("[Visual] validator returned no text"); return null; }

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    } else {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    const validated = JSON.parse(jsonStr);
    console.log("[Visual] validator reconciled result:", JSON.stringify(validated).slice(0, 150));
    return validated;

  } catch (err) {
    console.log("[Visual] validator failed (using merged result):", err.message);
    return null; // caller falls back to merged
  }
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
      batches.map((batch, idx) => {
        // Calculate approximate time range this batch covers in the video
        const framesPerBatch = GROQ_BATCH_LIMIT;
        const startFrameIdx = idx * framesPerBatch;
        const endFrameIdx = Math.min(startFrameIdx + batch.length - 1, frameDocs.length - 1);
        const startSec = frameDocs[startFrameIdx]?.timestamp ?? null;
        const endSec = frameDocs[endFrameIdx]?.timestamp ?? null;

        return analyzeFrameBatch(
          batch,
          `batch${idx + 1}/${batches.length}`,
          GROQ_API_KEY,
          { index: idx, total: batches.length, startSec, endSec }
        );
      })
    );

    // Clean up DB frames
    await FrameCache.deleteMany({ videoId }).catch(() => {});

    // Merge all batch results into a preliminary result
    const merged = batchResults.reduce((acc, result) => mergeBatchResults(acc, result), null);

    if (!merged) {
      console.log("[Visual] All batches failed");
      return null;
    }

    // Validation pass — send all batch results to a text-only LLM to reconcile
    // contradictions and produce a single accurate, coherent final result.
    const validBatchResults = batchResults.filter(Boolean);
    const validated = validBatchResults.length >= 2
      ? await validateAndReconcile(validBatchResults, merged, GROQ_API_KEY)
      : merged;

    const final = validated ?? merged;
    console.log("Visual analysis complete:", JSON.stringify(final).slice(0, 150));
    return final;

  } catch (err) {
    await FrameCache.deleteMany({ videoId }).catch(() => {});
    console.log("Visual analysis failed:", err.message);
    return null;
  }
}
