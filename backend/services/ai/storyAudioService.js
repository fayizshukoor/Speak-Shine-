/**
 * storyAudioService.js
 *
 * Generates an MP3 audio file from story text using ElevenLabs TTS,
 * then uploads it to Cloudflare R2 under story-audio/ folder.
 *
 * Requires: ELEVENLABS_API_KEY in Infisical
 */

import fetch from "node-fetch";
import { uploadBufferToR2 } from "../../config/storage.js";

const VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam — premade, free tier compatible

async function textToMp3Buffer(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set in Infisical.");
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let detail = errText;
    try { detail = JSON.parse(errText)?.detail?.message || errText; } catch {}
    throw new Error(`ElevenLabs API error ${res.status}: ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function generateAndUploadStoryAudio(storyText, topic = "story") {
  if (!storyText || storyText.trim().length < 10) {
    throw new Error("Story text is too short to generate audio");
  }

  console.log(`[StoryAudio] Generating TTS for "${topic}" (${storyText.length} chars)…`);

  const mp3Buffer = await textToMp3Buffer(storyText);
  console.log(`[StoryAudio] TTS done — ${(mp3Buffer.length / 1024).toFixed(1)} KB. Uploading to R2…`);

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const key = `story-audio/${slug}-${Date.now()}.mp3`;

  const publicUrl = await uploadBufferToR2(mp3Buffer, key, "audio/mpeg");
  console.log(`[StoryAudio] Uploaded: ${publicUrl}`);
  return publicUrl;
}
