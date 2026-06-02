/**
 * Restore monthly scores script
 * Restores the correct monthlyScore values that were wiped by a bad migration.
 * 
 * Usage: node scripts/restore-monthly-scores.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

const userSchema = new mongoose.Schema({
  userId: String,
  name: String,
  phone: String,
  monthlyScore: { type: Number, default: 0 },
  lastScoreDate: { type: String, default: null },
}, { strict: false });

const User = mongoose.model("User", userSchema);

// Scores to restore (from screenshot — name match is partial/case-insensitive)
const RESTORE = [
  { nameMatch: "Shabeer",         score: 94.60 },
  { nameMatch: "Fayiz",           score: 94    },
  { nameMatch: "Sidharth",        score: 162   },
  { nameMatch: "Abdul Fathah",    score: 76    },
  { nameMatch: "Muhammed niyas",  score: 70    },
  { nameMatch: "Muhammed Adhil",  score: 60    },
];

async function restore() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI not found in .env");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✅ Connected\n");

  const allUsers = await User.find({}).lean();
  console.log(`📋 Found ${allUsers.length} users in DB\n`);

  for (const { nameMatch, score } of RESTORE) {
    // Case-insensitive partial name match
    const user = allUsers.find(u =>
      u.name && u.name.toLowerCase().includes(nameMatch.toLowerCase())
    );

    if (!user) {
      console.warn(`⚠️  No user found matching name: "${nameMatch}"`);
      continue;
    }

    const before = user.monthlyScore ?? 0;
    await User.updateOne({ _id: user._id }, {
      $set: { monthlyScore: score },
    });
    console.log(`✅ ${user.name.padEnd(22)} | before: ${String(before).padStart(6)} → after: ${score}`);
  }

  console.log("\n🎉 Done. Scores restored.");

  // Show final state
  const updated = await User.find({}, "name monthlyScore").lean();
  const sorted = updated
    .filter(u => (u.monthlyScore || 0) > 0)
    .sort((a, b) => (b.monthlyScore || 0) - (a.monthlyScore || 0));

  console.log("\n📊 Current leaderboard scores:");
  sorted.forEach((u, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${(u.name || "—").padEnd(22)} ${u.monthlyScore} pts`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

restore().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
