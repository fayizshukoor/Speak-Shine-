/**
 * vocabularyGenerator.js
 * Generates 5 vocabulary words related to today's question/topic.
 * Words are stored in Status.todayVocabulary and shown to users before they record.
 */

import fetch from "node-fetch";
import Status from "../../../models/statusSchema.js";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

/**
 * Generate 5 vocabulary words for a given topic/question via Groq Llama.
 * Returns array of { word, meaning, example } or null on failure.
 */
async function generateVocabularyWords(topic, question) {
  const prompt = `You are an English vocabulary teacher for B1-B2 level learners.

Today's speaking topic: "${topic || "General English"}"
Today's question: "${question || "Talk about your daily life"}"

Generate exactly 5 vocabulary words that:
- Are relevant to this topic/question
- Are useful for B1-B2 level English learners
- Would naturally come up when answering this question
- Are not too basic (not: good, bad, happy) and not too advanced (not: ephemeral, sycophant)

For each word provide:
- word: the vocabulary word (single word or common phrase, max 2 words)
- meaning: a simple 1-line definition (max 15 words)
- example: a short example sentence using the word naturally (max 20 words)

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {"word": "resilient", "meaning": "able to recover quickly from difficulties", "example": "She stayed resilient even after failing the exam twice."},
  ...
]`;

  let lastError = null;

  // Try up to 2 times
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      while (true) {
        const apiKey = getTextKey();
        if (!apiKey) {
          lastError = new Error("No Groq API keys available");
          break;
        }

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            max_tokens: 600,
          }),
        });

        if (res.status === 429) {
          const errText = await res.text();
          markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`Groq API error ${res.status}`);
          break;
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content?.trim();
        if (!raw) { lastError = new Error("Empty response"); break; }

        // Extract JSON array
        let jsonStr = raw;
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) {
          jsonStr = fence[1].trim();
        } else {
          const s = raw.indexOf("[");
          const e = raw.lastIndexOf("]");
          if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
        }
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

        const parsed = JSON.parse(jsonStr);

        // Validate structure
        if (!Array.isArray(parsed) || parsed.length === 0) {
          lastError = new Error("Invalid response structure");
          break;
        }

        const valid = parsed
          .filter(w => w.word && w.meaning && w.example)
          .slice(0, 5)
          .map(w => ({
            word:    String(w.word).trim(),
            meaning: String(w.meaning).trim(),
            example: String(w.example).trim(),
          }));

        if (valid.length < 3) {
          lastError = new Error("Too few valid words returned");
          break;
        }

        return valid;
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.warn(`[VocabGen] Attempt ${attempt} failed: ${err.message} — retrying…`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.error("[VocabGen] All attempts failed:", lastError?.message);
  return null;
}

/**
 * Generate and store today's vocabulary words in Status.
 * Safe to call multiple times — skips if already generated.
 * Returns the vocabulary array (may be empty if generation failed).
 */
export async function ensureTodayVocabulary() {
  try {
    const status = await Status.findOne().lean();

    // Already have words for today — return them
    if (status?.todayVocabulary && status.todayVocabulary.length >= 3) {
      return status.todayVocabulary;
    }

    // Need a question to generate words from
    const topic    = status?.todayTopic    || null;
    const question = status?.todayQuestion || null;

    if (!question && !topic) {
      console.log("[VocabGen] No question available yet — skipping vocabulary generation");
      return [];
    }

    console.log(`[VocabGen] Generating vocabulary for topic: "${topic}"`);
    const words = await generateVocabularyWords(topic, question);

    if (!words || words.length === 0) {
      console.warn("[VocabGen] Generation failed — vocabulary will be empty today");
      return [];
    }

    // Store in Status
    await Status.updateOne({}, { $set: { todayVocabulary: words } }, { upsert: true });
    console.log(`[VocabGen] ✅ Stored ${words.length} vocabulary words: ${words.map(w => w.word).join(", ")}`);

    return words;
  } catch (err) {
    console.error("[VocabGen] ensureTodayVocabulary error:", err.message);
    return [];
  }
}

/**
 * Get today's vocabulary words.
 * If missing, triggers generation on-demand (lazy generation).
 */
export async function getTodayVocabulary() {
  return ensureTodayVocabulary();
}
