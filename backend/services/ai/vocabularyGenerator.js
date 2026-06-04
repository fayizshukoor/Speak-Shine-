/**
 * vocabularyGenerator.js
 * Generates vocabulary words related to today's question/topic.
 * Word count and CEFR level are configurable via Status.vocabWordCount / Status.vocabLevel.
 */

import fetch from "node-fetch";
import Status from "../../../models/statusSchema.js";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

// CEFR level descriptors for the prompt
const LEVEL_DESCRIPTORS = {
  A1: "absolute beginner — very simple everyday words (e.g. happy, walk, home). Not too easy though — must be useful for speaking practice.",
  A2: "elementary — simple but practical words used in daily conversations (e.g. suggest, nervous, improve)",
  B1: "intermediate — words learners know but may not actively use (e.g. confident, achieve, situation)",
  B2: "upper-intermediate — richer, more precise words (e.g. articulate, elaborate, perspective, convey)",
  C1: "advanced — sophisticated words used by fluent speakers (e.g. compelling, nuanced, resilient, inevitably)",
  C2: "proficient — complex academic or professional vocabulary (e.g. juxtaposition, pragmatic, eloquent)",
};

/**
 * Generate vocabulary words for a given topic/question via Groq Llama.
 * @param {string} topic
 * @param {string} question
 * @param {number} count - how many words to generate
 * @param {string} level - CEFR level string e.g. "B2"
 * @returns {Array<{word, meaning, example}>|null}
 */
async function generateVocabularyWords(topic, question, count = 3, level = "B2") {
  const levelDesc = LEVEL_DESCRIPTORS[level] || LEVEL_DESCRIPTORS["B2"];

  const prompt = `You are an English vocabulary teacher.

Today's speaking topic: "${topic || "General English"}"
Today's question: "${question || "Talk about your daily life"}"

Generate exactly ${count} vocabulary words that:
- Are relevant to this topic/question
- Are at ${level} level (${levelDesc})
- Would naturally come up when answering this question
- Each word is a single word or common 2-word phrase

For each word provide:
- word: the vocabulary word (max 2 words)
- meaning: a simple 1-line definition (max 15 words)
- example: a short example sentence using the word naturally (max 20 words)

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {"word": "elaborate", "meaning": "to explain something in more detail", "example": "Can you elaborate on your main point about communication?"},
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
            max_tokens: Math.max(300, count * 120),
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
          .slice(0, count)
          .map(w => ({
            word:    String(w.word).trim(),
            meaning: String(w.meaning).trim(),
            example: String(w.example).trim(),
          }));

        if (valid.length < Math.min(2, count)) {
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
 * Reads vocabWordCount and vocabLevel from Status for dynamic configuration.
 * Returns the vocabulary array (may be empty if generation failed).
 */
export async function ensureTodayVocabulary() {
  try {
    const status = await Status.findOne().lean();

    // Read dynamic settings (admin-configurable)
    const wordCount = Math.max(1, Math.min(10, status?.vocabWordCount ?? 3));
    const level     = status?.vocabLevel || "B2";

    // Already have enough words for today — return them
    if (status?.todayVocabulary && status.todayVocabulary.length >= Math.min(wordCount, 2)) {
      return status.todayVocabulary;
    }

    // Need a question to generate words from
    const topic    = status?.todayTopic    || null;
    const question = status?.todayQuestion || null;

    if (!question && !topic) {
      console.log("[VocabGen] No question available yet — skipping vocabulary generation");
      return [];
    }

    console.log(`[VocabGen] Generating ${wordCount} vocabulary words at ${level} level for topic: "${topic}"`);
    const words = await generateVocabularyWords(topic, question, wordCount, level);

    if (!words || words.length === 0) {
      console.warn("[VocabGen] Generation failed — vocabulary will be empty today");
      return [];
    }

    // Store in Status
    await Status.updateOne({}, { $set: { todayVocabulary: words } }, { upsert: true });
    console.log(`[VocabGen] ✅ Stored ${words.length} words (${level}): ${words.map(w => w.word).join(", ")}`);

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
