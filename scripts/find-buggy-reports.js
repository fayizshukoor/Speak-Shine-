/**
 * Find and fix buggy video reports with 0 duration pts for a specific phone.
 * Also updates the compositeScore in the report to the correct value.
 * Run: node scripts/find-buggy-reports.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const videoReportSchema = new mongoose.Schema({}, { strict: false });
const VideoReport = mongoose.model("VideoReport", videoReportSchema);

async function fixReports() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log("Connected\n");

  // Find all Sidharth's reports with length=0 (buggy)
  const buggyReports = await VideoReport.find({
    phone: "8848096746",
    "analysis.scoreBreakdown.length": 0,
    "analysis.compositeScore": { $ne: null },
  }).lean();

  console.log(`Found ${buggyReports.length} buggy report(s) for 8848096746\n`);

  for (const r of buggyReports) {
    const bd = r.analysis?.scoreBreakdown;
    const stats = r.analysis?.stats;
    const speechRatio = stats?.rhythm?.speechRatio;
    const wpm = stats?.wpm;
    const dur = r.videoDuration || 0;
    const maxDur = bd?.maxLength === 33.33 ? 300 : 600; // regular=300, special=600
    const minDur = 60;

    // Recalculate speech multiplier
    let speechMultiplier = 0;
    if (typeof speechRatio === "number" && speechRatio > 0) {
      speechMultiplier = speechRatio >= 85 ? 1.0 : speechRatio / 85;
    } else if (typeof wpm === "number" && wpm > 0) {
      speechMultiplier = Math.min(1, wpm / 100);
    }

    // Recalculate base length score
    const actualDur = Math.min(dur, maxDur);
    const rangeScore = maxDur > minDur ? Math.max(0, (actualDur - minDur) / (maxDur - minDur)) : 1;
    const baseLengthScore = actualDur >= minDur
      ? (0.5 + 0.5 * rangeScore) * 33.33
      : (actualDur / minDur) * 0.5 * 33.33;
    const correctLength = Math.round(baseLengthScore * speechMultiplier * 100) / 100;

    // New composite score
    const correctComposite = Math.min(100, Math.round(
      (correctLength + (bd?.vocabUsed || 0) + (bd?.topic || 0) + (bd?.comm || 0)) * 100
    ) / 100);

    console.log(`Report ${r._id}`);
    console.log(`  submittedAt: ${r.submittedAt}`);
    console.log(`  videoDuration: ${dur}s | speechRatio: ${speechRatio}% | wpm: ${wpm}`);
    console.log(`  buggy composite: ${r.analysis.compositeScore} | correct: ${correctComposite}`);
    console.log(`  length: 0 → ${correctLength}`);

    // Update the report
    await VideoReport.updateOne(
      { _id: r._id },
      {
        $set: {
          "analysis.compositeScore": correctComposite,
          "analysis._compositeScore": correctComposite,
          "analysis.scoreBreakdown.length": correctLength,
          "analysis.scoreBreakdown.speechRatio": speechRatio ?? null,
          "analysis.scoreBreakdown.speechMultiplier": Math.round(speechMultiplier * 100),
          "analysis._scoreBreakdown.length": correctLength,
          "analysis._scoreBreakdown.speechRatio": speechRatio ?? null,
          "analysis._scoreBreakdown.speechMultiplier": Math.round(speechMultiplier * 100),
        }
      }
    );
    console.log(`  ✅ Report updated\n`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

fixReports().catch(e => { console.error(e.message); process.exit(1); });
