/**
 * Fix buggy today's scores for users affected by the duration scoring bug.
 * The bug caused 0.0/33.3 on duration because analysis._stats was read
 * instead of analysis.stats.
 * Run: node scripts/fix-today-score.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userSchema = new mongoose.Schema({
  name: String, phone: String,
  monthlyScore: Number, todayScore: Number, lastScoreDate: String,
}, { strict: false });
const User = mongoose.model("User", userSchema);

// All users affected by the bug today (2026-06-04)
const FIXES = [
  { phone: "8848096746", name: "Sidharth T",        buggyScore: 54.17, correctScore: 87.53 },
  { phone: "9947341403", name: "Muhammed Adhil KP", buggyScore: 44.79, correctScore: 77.95 },
  { phone: "8594059783", name: "Abdul Fathah",       buggyScore: 50.00, correctScore: 83.33 },
];

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log("Connected\n");

  for (const { phone, name, buggyScore, correctScore } of FIXES) {
    const diff = correctScore - buggyScore;
    const user = await User.findOne({ phone }).lean();

    if (!user) {
      console.log(`❌ ${name} — not found`);
      continue;
    }

    // Skip if todayScore doesn't match buggy value (already fixed or different)
    if (Math.abs((user.todayScore ?? 0) - buggyScore) > 0.5) {
      console.log(`⚠️  ${name} — todayScore is ${user.todayScore?.toFixed(2)}, expected ${buggyScore} — skipping`);
      continue;
    }

    const result = await User.findOneAndUpdate(
      { phone },
      {
        $inc: { monthlyScore: diff },
        $set: { todayScore: correctScore },
      },
      { new: true }
    ).lean();

    console.log(`✅ ${result.name}:`);
    console.log(`   todayScore:   ${buggyScore} → ${correctScore}`);
    console.log(`   monthlyScore: ${(result.monthlyScore - diff).toFixed(2)} → ${result.monthlyScore.toFixed(2)} (+${diff.toFixed(2)})\n`);
  }

  // Final leaderboard
  const all = await User.find({}, "name monthlyScore todayScore").lean();
  console.log("Updated leaderboard:");
  all.filter(u => (u.monthlyScore || 0) > 0)
    .sort((a, b) => (b.monthlyScore || 0) - (a.monthlyScore || 0))
    .forEach((u, i) => console.log(`  ${i+1}. ${(u.name||"?").padEnd(22)} ${u.monthlyScore?.toFixed(2)} pts  (today: ${u.todayScore?.toFixed(2) ?? "-"})`));

  await mongoose.disconnect();
}

fix().catch(e => { console.error(e.message); process.exit(1); });
