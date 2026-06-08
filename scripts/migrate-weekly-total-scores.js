/**
 * Migration: seed weeklyScore, monthlyScore, totalPoints from VideoReport.analysis.compositeScore
 *
 * The composite scoring system started 2025-06-01.
 * This script reads completed VideoReport docs, sums their compositeScore per user,
 * and writes the correct values into the User document.
 *
 * - totalPoints  = sum of ALL compositeScores ever (VideoReport lifetime)
 * - monthlyScore = sum of compositeScores submitted in the current calendar month
 * - weeklyScore  = sum of compositeScores submitted in the current Mon–Sun week
 *
 * Safe to run multiple times — it always recomputes from source-of-truth VideoReports.
 *
 * Usage:
 *   node scripts/migrate-weekly-total-scores.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("❌  MONGO_URI not set in .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("✅  Connected to MongoDB");

const User = mongoose.model("User", new mongoose.Schema({}, { strict: false, collection: "users" }));
const VideoReport = mongoose.model("VideoReport", new mongoose.Schema({}, { strict: false, collection: "videoreports" }));

// ── Date helpers in IST ──────────────────────────────────────────────────────
function nowIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function getMonthRange() {
  const n = nowIST();
  const start = new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0, 0);
  const end   = new Date(n.getFullYear(), n.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function getWeekRange() {
  const n = nowIST();
  const day = n.getDay(); // 0=Sun, 1=Mon …
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(n);
  monday.setDate(n.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday, end: sunday };
}

const monthRange = getMonthRange();
const weekRange  = getWeekRange();
console.log(`Month range: ${monthRange.start.toDateString()} → ${monthRange.end.toDateString()}`);
console.log(`Week  range: ${weekRange.start.toDateString()} → ${weekRange.end.toDateString()}\n`);

// ── Fetch all completed VideoReports that have a compositeScore ──────────────
const reports = await VideoReport.find({
  status: "completed",
  "analysis.compositeScore": { $gt: 0 },
}).lean();

console.log(`Found ${reports.length} completed VideoReport(s) with compositeScore\n`);

// ── Group by phone ────────────────────────────────────────────────────────────
const byPhone = {};
for (const r of reports) {
  const phone = r.phone;
  if (!phone) continue;
  if (!byPhone[phone]) byPhone[phone] = [];
  byPhone[phone].push({
    score: r.analysis.compositeScore,
    date:  new Date(r.submittedAt),
  });
}

// ── Update each user ─────────────────────────────────────────────────────────
const users = await User.find({}).lean();
let updated = 0;

for (const u of users) {
  const phone = u.phone;
  const entries = byPhone[phone] || [];

  const totalPoints  = Math.round(entries.reduce((s, e) => s + e.score, 0) * 10) / 10;
  const monthlyScore = Math.round(entries.filter(e => e.date >= monthRange.start && e.date < monthRange.end).reduce((s, e) => s + e.score, 0) * 10) / 10;
  const weeklyScore  = Math.round(entries.filter(e => e.date >= weekRange.start  && e.date < weekRange.end ).reduce((s, e) => s + e.score, 0) * 10) / 10;

  await User.updateOne(
    { _id: u._id },
    { $set: { totalPoints, monthlyScore, weeklyScore } }
  );

  if (entries.length > 0 || (u.totalPoints || 0) > 0) {
    console.log(
      `  ✓ ${(u.name || u.phone || "?").padEnd(25)} ` +
      `reports=${String(entries.length).padStart(2)}  ` +
      `total=${String(totalPoints).padStart(6)}  ` +
      `monthly=${String(monthlyScore).padStart(6)}  ` +
      `weekly=${String(weeklyScore).padStart(6)}`
    );
  }
  updated++;
}

console.log(`\n✅  Done — ${updated} user(s) updated`);
await mongoose.disconnect();
