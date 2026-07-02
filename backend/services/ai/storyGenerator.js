/**
 * ai/storyGenerator.js
 *
 * Generates a short English listening story for Saturday Story Summary tasks.
 * Uses Groq Llama (same key rotation as questionGenerator.js).
 *
 * Returns: { topic, story, summaryGuide, question, theme }
 */

import fetch from "node-fetch";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

export const STORY_THEMES = [
  "a surprising act of kindness",
  "a lesson learned from a mistake",
  "an unexpected friendship",
  "a challenge that changed someone",
  "a moment of courage",
  "an adventure that went wrong",
  "a small decision with a big impact",
  "helping a stranger",
  "losing something valuable and finding something better",
  "a misunderstanding that turned into something good",
  "overcoming a fear",
  "an act of honesty that was difficult",
  "a second chance that changed everything",
  "finding strength in a difficult moment",
  "a childhood memory with a lesson",
  "a journey that taught something unexpected",
  "making a sacrifice for someone else",
  "a dream that finally came true",
  "learning to forgive",
  "standing up for what is right",
];

/**
 * Pick a theme not in usedThemes. If all used, reset and pick from full list.
 */
export function pickFreshTheme(usedThemes = []) {
  const available = STORY_THEMES.filter(t => !usedThemes.includes(t));
  const pool = available.length > 0 ? available : STORY_THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Generate a listening story via Groq.
 * @param {object} options
 * @param {number}   [options.wordCount=200]   - target word count (100–400). 200 ≈ 1:30 min audio.
 * @param {string[]} [options.usedThemes=[]]   - themes already used (skip for no-repeat)
 * @param {string}   [options.level="B1"]      - CEFR difficulty: A2, B1, B2, C1
 */
export async function generateListeningStory({ wordCount = 200, usedThemes = [], level = "B1" } = {}) {
  const theme = pickFreshTheme(usedThemes);
  const minWords = Math.max(80, wordCount - 20);
  const maxWords = wordCount + 20;

  const levelDescriptions = {
    A2: "beginner-elementary (A2) — very simple sentences, basic everyday vocabulary, very familiar topics",
    B1: "intermediate (B1) — clear simple language, common vocabulary, relatable everyday situations",
    B2: "upper-intermediate (B2) — varied vocabulary, some complex sentences, nuanced ideas",
    C1: "advanced (C1) — rich vocabulary, complex sentence structures, sophisticated themes and ideas",
  };
  const levelDesc = levelDescriptions[level] || levelDescriptions["B1"];

  const prompt = `Write a short English listening story for ${levelDesc} learners on the theme: "${theme}".

Requirements:
- Length: ${minWords}–${maxWords} words (keep it strictly within this range)
- Vocabulary and sentence complexity must match the ${level} CEFR level
- Has a clear beginning, middle, and end
- Has a moral or lesson at the end
- Written in third person (about a person using a common Indian name)
- Natural spoken English style — like a narrator telling a story aloud
- Minimal or no dialogue — pure narration preferred

After the story, provide:
1. topic: A short 3–6 word title for the story
2. summaryGuide: Exactly 4 key points that a good summary should cover (short bullet points)
3. question: The task instruction for the student (1 sentence, starting with "Listen to the story and...")

Return ONLY valid JSON in this exact format, no markdown, no extra text:
{
  "topic": "...",
  "story": "...",
  "summaryGuide": ["point 1", "point 2", "point 3", "point 4"],
  "question": "..."
}`;

  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const apiKey = getTextKey();
    if (!apiKey) throw new Error("All Groq API keys exhausted — story generation unavailable");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.85,
        max_tokens: 1500,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty response from Groq");

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    else {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.topic || !parsed.story || !Array.isArray(parsed.summaryGuide) || !parsed.question) {
        throw new Error("Missing required fields in story response");
      }
      return {
        topic: parsed.topic.trim(),
        story: parsed.story.trim(),
        summaryGuide: parsed.summaryGuide.map(p => String(p).trim()),
        question: parsed.question.trim(),
        theme, // return so caller can push to usedStoryThemes
      };
    } catch (parseErr) {
      lastError = parseErr;
      console.warn("[StoryGenerator] JSON parse failed, retrying...", parseErr.message);
      continue;
    }
  }

  throw new Error(`Story generation failed after retries: ${lastError?.message}`);
}
