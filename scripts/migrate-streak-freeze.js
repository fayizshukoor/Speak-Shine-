/**
 * Migration: backfill streakFreeze for existing users
 *
 * The streak freeze award (+1 per 7-day milestone) was added after launch.
 * Users who already have streaks ≥ 7 never received their earned freezes.
 *
 * Formula: earned = floor(streak / 7)
 * We only ADD the difference between what they should have and what they have,
 * so anyone who already has the correct amount is untouched.
 *
 * Safe to run multiple times — idempotent (only adds what's missing).
 *
 * Usage:
 *   node scripts/migrate-streak-freeze.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌  MONGODB_URI not set in .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("✅  Connected to MongoDB");

const User = mongoose.model(
  "User",
  new mongoose.Schema({}, { strict: false, collection: "users" })
);

const users = await User.find({ streak: { $gte: 7 } }).lean();
console.log(`Found ${users.length} user(s) with streak ≥ 7`);

let updated = 0;
let skipped = 0;

for (const u of users) {
  const streak       = u.streak        || 0;
  const currentFreeze = u.streakFreeze  || 0;
  const shouldHave   = Math.floor(streak / 7);   // total earned over lifetime
  const toAdd        = Math.max(0, shouldHave - currentFreeze);

  if (toAdd === 0) {
    skipped++;
    continue;
  }

  await User.updateOne(
    { _id: u._id },
    { $set: { streakFreeze: shouldHave } }
  );

  console.log(
    `  ✓ ${(u.name || u.userId || String(u._id)).padEnd(22)} ` +
    `streak=${streak}  had=${currentFreeze}  should=${shouldHave}  added=${toAdd}`
  );
  updated++;
}

console.log(`\n✅  Migration complete — ${updated} updated, ${skipped} already correct`);
await mongoose.disconnect();
