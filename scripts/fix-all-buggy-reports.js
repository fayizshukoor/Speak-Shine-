/**
 * Fix ALL video reports with buggy 0 duration pts (analysis._stats bug).
 * Recalculates correct compositeScore + scoreBreakdown.length for every affected report.
 * Also updates the User.monthlyScore if the report is from today.
 *
 * Run: node scripts/fix-all-buggy-reports.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

// Minimal schemas — strict: false to avoid field stripping
const VideoReport = mongoose.model("VideoReport", new mongoose.Schema({}, { strict: false }));
const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }));

// Get today's date in IST as "YYYY-MM-DD"
function getTodayIST() {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = nowIST.getFullYear();
  const m = String(nowIST.getMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const todayIST = getTodayIST();

  // Find ALL reports where length pts = 0 but compositeScore is not null
  // These are the buggy ones — they had speech but got 0 duration pts
  const buggyReports = await VideoReport.find({
    "analysis.scoreBreakdown.length": 0,
    "analysis.compositeScore": { $ne: null },
    "analysis.stats": { $exists: true },
  }).lean();

  console.log(`Found ${buggyReports.length} buggy report(s) across all users\n`);

  if (buggyReports.length === 0) {
    console.log("Nothing to fix.");
    await mongoose.disconnect();
    return;
  }

  let fixed = 0;
  let skipped = 0;

  for (const r of buggyReports) {
    const bd = r.analysis?.scoreBreakdown;
    const stats = r.analysis?.stats;
    const speechRatio = stats?.rhythm?.speechRatio;
    const wpm = stats?.wpm;
    const dur = r.videoDuration || 0;

    // Determine max duration from breakdown maxLength or default
    const maxDur = (bd?.maxLength === 33.33 || !bd?.maxLength) ? 300 : 600;
    const minDur = 60;

    // If no speech data at all (truly silent) — skip, 0 is correct
    if ((speechRatio == null || speechRatio === 0) && (!wpm || wpm === 0)) {
      console.log(`⏭  SKIP ${r._id} (${r.phone}) — no speech data, 0 duration is correct`);
      skipped++;
      continue;
    }

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

    const buggyComposite = r.analysis.compositeScore;
    const diff = correctComposite - buggyComposite;

    console.log(`🔧 ${r.phone?.padEnd(12)} | Report ${r._id} | ${new Date(r.submittedAt).toISOString().slice(0,16)}`);
    console.log(`   dur=${dur}s speechRatio=${speechRatio}% wpm=${wpm} → multiplier=${(speechMultiplier*100).toFixed(0)}%`);
    console.log(`   length: 0 → ${correctLength} | composite: ${buggyComposite} → ${correctComposite} (+${diff.toFixed(2)})`);

    // Update the VideoReport
    await VideoReport.updateOne(
      { _id: r._id },
      {
        $set: {
          "analysis.compositeScore":                correctComposite,
          "analysis._compositeScore":               correctComposite,
          "analysis.scoreBreakdown.length":         correctLength,
          "analysis.scoreBreakdown.speechRatio":    speechRatio ?? null,
          "analysis.scoreBreakdown.speechMultiplier": Math.round(speechMultiplier * 100),
          "analysis._scoreBreakdown.length":        correctLength,
          "analysis._scoreBreakdown.speechRatio":   speechRatio ?? null,
          "analysis._scoreBreakdown.speechMultiplier": Math.round(speechMultiplier * 100),
        }
      }
    );

    // If report is from today, also fix User.monthlyScore
    const reportDateIST = new Date(r.submittedAt)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD

    if (reportDateIST === todayIST && r.phone) {
      const user = await User.findOne({ phone: r.phone }).lean();
      if (user && Math.abs((user.todayScore ?? 0) - buggyComposite) < 1) {
        await User.updateOne(
          { phone: r.phone },
          {
            $inc: { monthlyScore: diff },
            $set: { todayScore: correctComposite },
          }
        );
        console.log(`   👤 User monthlyScore updated: +${diff.toFixed(2)} | todayScore: ${buggyComposite} → ${correctComposite}`);
      } else {
        console.log(`   👤 User monthlyScore skipped (todayScore=${user?.todayScore}, may already be fixed)`);
      }
    }

    console.log(`   ✅ Done\n`);
    fixed++;
  }

  console.log(`\nSummary: ${fixed} fixed, ${skipped} skipped`);

  // Final leaderboard
  const users = await User.find(
    { monthlyScore: { $gt: 0 } },
    "name phone monthlyScore todayScore"
  ).lean();

  console.log("\nFinal leaderboard:");
  users
    .sort((a, b) => (b.monthlyScore || 0) - (a.monthlyScore || 0))
    .forEach((u, i) => console.log(
      `  ${i+1}. ${(u.name||"?").padEnd(22)} ${u.monthlyScore?.toFixed(2)} pts  (today: ${u.todayScore?.toFixed(2) ?? "-"})`
    ));

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch(e => { console.error(e.message); process.exit(1); });
