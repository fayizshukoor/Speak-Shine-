/**
 * Guest Controller
 * Provides dummy preview data for unauthenticated visitors.
 * Guest visits are tracked and auto-expire in 24 hours.
 */

import { getRedisClient, isRedisAvailable } from "../config/redis.js";
import Auth from "../../models/authSchema.js";

const DAILY_REGISTRATION_LIMIT = parseInt(process.env.MAX_DAILY_REGISTRATIONS || "30", 10);
const GUEST_VISIT_TTL = 24 * 60 * 60; // 24 hours in seconds

// ── Dummy data generators ─────────────────────────────────────────────────────

function generateDummyScores() {
  // Realistic-looking score progression over the last 10 days
  const base = { fluency: 5.8, grammar: 6.2, confidence: 5.5, vocabulary: 6.0 };
  return Array.from({ length: 10 }, (_, i) => {
    const progress = i * 0.22;
    const jitter = () => (Math.random() - 0.5) * 0.8;
    return {
      date: new Date(Date.now() - (9 - i) * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      fluency:    Math.min(10, Math.max(1, +(base.fluency    + progress + jitter()).toFixed(1))),
      grammar:    Math.min(10, Math.max(1, +(base.grammar    + progress + jitter()).toFixed(1))),
      confidence: Math.min(10, Math.max(1, +(base.confidence + progress + jitter()).toFixed(1))),
      vocabulary: Math.min(10, Math.max(1, +(base.vocabulary + progress + jitter()).toFixed(1))),
    };
  });
}

function generateDummyCommunityFeed() {
  const members = [
    { name: "Arjun M.",    avatar: "🧑‍💼", topic: "Describe a challenging decision you made" },
    { name: "Priya K.",    avatar: "👩‍🎓", topic: "Talk about a mentor who influenced you" },
    { name: "Rahul S.",    avatar: "👨‍💻", topic: "What motivates you every morning?" },
    { name: "Divya R.",    avatar: "👩‍🏫", topic: "Describe your dream career in 3 minutes" },
    { name: "Kiran T.",    avatar: "🧑‍🔬", topic: "How do you handle workplace stress?" },
    { name: "Sneha V.",    avatar: "👩‍💼", topic: "Talk about a book that changed your perspective" },
  ];

  return members.map((m, i) => ({
    id: `dummy-${i}`,
    userName: m.name,
    avatar: m.avatar,
    topic: m.topic,
    scores: {
      fluency:    +(6.5 + Math.random() * 2.5).toFixed(1),
      grammar:    +(6.0 + Math.random() * 3.0).toFixed(1),
      confidence: +(5.8 + Math.random() * 3.2).toFixed(1),
      vocabulary: +(6.2 + Math.random() * 2.8).toFixed(1),
    },
    overallComment: [
      "Excellent articulation and strong command over vocabulary! Keep maintaining this consistency.",
      "Great energy and clear pronunciation. Work on sentence transitions for a smoother flow.",
      "Very confident delivery. Grammar was spot-on and vocabulary choices were impressive.",
      "Solid performance! Your confidence has visibly improved compared to last week.",
      "Clear and concise communication. A few filler words to watch out for but overall impressive.",
      "Outstanding fluency! The topic handling was natural and engaging throughout.",
    ][i],
    duration: `${2 + Math.floor(Math.random() * 3)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
    reactions: { like: 8 + i * 3, dislike: Math.floor(Math.random() * 2) },
    comments: 2 + i,
    submittedAt: new Date(Date.now() - i * 3600000 * 4).toISOString(),
    isDemo: true,
    thumbnailColor: ["#7c6fff", "#4ade80", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c"][i],
  }));
}

function getGuestDashboardData() {
  const scores = generateDummyScores();
  const latest = scores[scores.length - 1];

  return {
    isGuest: true,
    profile: {
      name: "Guest User",
      streak: 0,
      weeklySubmissions: 0,
      monthlySubmissions: 0,
    },
    today: {
      question: "Tell us about a skill you are learning and why it excites you.",
      topic: "Personal Growth",
      category: "Self-Development",
      questionSent: true,
      vocabulary: [
        { word: "Resilience",  meaning: "The ability to recover quickly from setbacks" },
        { word: "Perseverance", meaning: "Continued effort despite difficulty or delay" },
        { word: "Articulate",  meaning: "Able to express thoughts and feelings clearly" },
      ],
    },
    stats: {
      streak: 0,
      weeklySubmissions: 0,
      monthlySubmissions: 0,
      totalSubmissions: 0,
      fine: 0,
    },
    leaderboard: [
      { name: "Arjun M.",  streak: 42, completed: true,  weeklySubmissions: 5 },
      { name: "Priya K.",  streak: 38, completed: true,  weeklySubmissions: 5 },
      { name: "Rahul S.",  streak: 31, completed: false, weeklySubmissions: 4 },
      { name: "Divya R.",  streak: 27, completed: true,  weeklySubmissions: 5 },
      { name: "Kiran T.",  streak: 19, completed: false, weeklySubmissions: 3 },
    ],
    scoreHistory: scores,
    latestScores: latest,
    communityStats: {
      totalMembers: 87,
      submissionsToday: 23,
      avgStreak: 12,
      topScore: 9.4,
    },
    communityFeed: generateDummyCommunityFeed(),
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/guest/preview
 * Returns attractive dummy dashboard data for unauthenticated visitors.
 */
export async function getGuestPreview(req, res) {
  try {
    const data = getGuestDashboardData();
    // Cache-busted every time so scores look fresh on refresh
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    console.error("[Guest] Preview error:", err.message);
    res.status(500).json({ error: "Failed to load preview data" });
  }
}

/**
 * POST /api/guest/visit
 * Logs a guest visit with optional info (device type etc.).
 * Data auto-expires in 24 hours via Redis TTL.
 */
export async function trackGuestVisit(req, res) {
  try {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const { referrer, device } = req.body || {};

    if (isRedisAvailable()) {
      const key = `guest:visit:${ip}:${Date.now()}`;
      const visit = JSON.stringify({
        ip,
        referrer: referrer || null,
        device: device || null,
        visitedAt: new Date().toISOString(),
      });
      await getRedisClient().set(key, visit, "EX", GUEST_VISIT_TTL);
    }

    res.json({ success: true });
  } catch (err) {
    // Non-critical, just log and continue
    console.error("[Guest] Visit tracking error:", err.message);
    res.json({ success: true });
  }
}

/**
 * GET /api/guest/slots
 * Returns how many registration slots are left today (max 30/day).
 */
export async function getRegistrationSlots(req, res) {
  try {
    // Count registrations created today (midnight IST to now)
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const midnightIST = new Date(nowIST);
    midnightIST.setHours(0, 0, 0, 0);

    // Count both Auth records (approved) and treat pending as "used slots"
    const PendingRegistration = (await import("../../models/pendingRegistrationSchema.js")).default;
    const todayRegistrations = await PendingRegistration.countDocuments({
      createdAt: { $gte: midnightIST },
    });

    const slotsLeft = Math.max(0, DAILY_REGISTRATION_LIMIT - todayRegistrations);
    const percentFull = Math.round((todayRegistrations / DAILY_REGISTRATION_LIMIT) * 100);

    res.json({
      slotsLeft,
      totalSlots: DAILY_REGISTRATION_LIMIT,
      percentFull,
      isFull: slotsLeft === 0,
    });
  } catch (err) {
    console.error("[Guest] Slots error:", err.message);
    // On error, return full availability so registration isn't blocked by a bug
    res.json({ slotsLeft: DAILY_REGISTRATION_LIMIT, totalSlots: DAILY_REGISTRATION_LIMIT, percentFull: 0, isFull: false });
  }
}
