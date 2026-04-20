/**
 * Standalone test for the AI feedback pipeline.
 * Usage: node testFeedback.js <path-to-video.mp4>
 *
 * Skips WhatsApp download — feeds a local video file directly into the pipeline.
 */

import dotenv from "dotenv";
import { extractAudio } from "./ai/extractAudio.js";
import { transcribe } from "./ai/transcribe.js";
import { analyzeSpeech } from "./ai/analyzeSpeech.js";
import fs from "fs";
import path from "path";

dotenv.config();

const videoPath = process.argv[2];

if (!videoPath) {
  console.log("Usage: node testFeedback.js <path-to-video.mp4>");
  process.exit(1);
}

if (!fs.existsSync(videoPath)) {
  console.log(`❌ File not found: ${videoPath}`);
  process.exit(1);
}

// Sample topic/question (simulates today's daily question)
const TEST_TOPIC    = "Describe your daily routine and how you manage your time.";
const TEST_QUESTION = "What part of your day is most productive and why?";

const id = Date.now();
const audioPath = path.resolve(`./tmp/test_audio_${id}.mp3`);

fs.mkdirSync("./tmp", { recursive: true });

console.log("\n🎬 Starting feedback pipeline test...\n");

try {
  // Step 1: Extract audio
  console.log("1️⃣  Extracting audio from video...");
  await extractAudio(videoPath, `test_${id}`);
  console.log(`   ✅ Audio saved: ${audioPath}\n`);

  // Step 2: Transcribe
  console.log("2️⃣  Transcribing with Whisper (verbose_json)...");
  const transcription = await transcribe(audioPath);
  console.log(`   ✅ Transcript (${transcription.words.length} words, ${Math.round(transcription.duration)}s):`);
  console.log(`   "${transcription.text.slice(0, 200)}${transcription.text.length > 200 ? "..." : ""}"\n`);

  // Step 3: Analyze
  console.log("3️⃣  Analyzing with Llama-3.3-70b...");
  const result = await analyzeSpeech(
    transcription.text,
    transcription.duration,
    transcription.words,
    TEST_TOPIC,
    TEST_QUESTION
  );

  // Step 4: Print full result
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 AUDIO STATS (from Whisper):");
  console.log(`   Duration : ${result._stats.duration}`);
  console.log(`   Pace     : ${result._stats.wpm ?? "N/A"} wpm`);
  console.log(`   Words    : ${result._stats.wordCount}`);
  console.log(`   Fillers  : ${result._stats.fillerTotal} total —`, result._stats.fillerWords);
  console.log(`   Pauses   : ${result._stats.pauses} long pause(s)`);

  console.log("\n🎯 SCORES:");
  console.log(`   Fluency        : ${result.fluency}/10`);
  console.log(`   Grammar        : ${result.grammar}/10`);
  console.log(`   Confidence     : ${result.confidence}/10`);
  console.log(`   Vocabulary     : ${result.vocabulary}/10`);
  console.log(`   Topic Relevance: ${result.topicRelevance ?? "N/A"}/10`);

  if (result.grammarErrors?.length) {
    console.log("\n❌ GRAMMAR ERRORS:");
    result.grammarErrors.forEach(e => {
      console.log(`   "${e.original}" → "${e.correction}" (${e.rule})`);
    });
  }

  if (result.strongPoints?.length) {
    console.log("\n✅ STRONG POINTS:");
    result.strongPoints.forEach(p => console.log(`   • ${p}`));
  }

  if (result.vocabularyHighlights) {
    console.log("\n💎 VOCABULARY:");
    console.log(`   Strong : ${result.vocabularyHighlights.strong?.join(", ") || "none"}`);
    console.log(`   Weak   : ${result.vocabularyHighlights.weak?.join(", ") || "none"}`);
  }

  if (result.suggestions?.length) {
    console.log("\n💡 SUGGESTIONS:");
    result.suggestions.forEach(s => console.log(`   • ${s}`));
  }

  if (result.overallComment) {
    console.log("\n📝 OVERALL:");
    console.log(`   ${result.overallComment}`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("✅ Pipeline test complete!\n");

} catch (err) {
  console.log("\n❌ Error:", err.message);
  console.error(err);
} finally {
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
}
