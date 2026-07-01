/**
 * Dashboard Service
 * Business logic for dashboard stats, reports, and settings
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import DailyReport from "../../../models/dailyReportSchema.js";
import StreakRecord from "../../../models/streakRecordSchema.js";
import { generateSVGPoster } from "../../../api/posterGenerator.js";
import env from "../../config/env.js";
import { getTodayVocabulary } from "../ai/vocabularyGenerator.js";

/**
 * Get poster image - use bot's stored PNG if available, else generate SVG fallback
 */
function getPosterImage(status) {
  if (status?.todayPosterImage) {
    const isExpired = status.posterExpiresAt && new Date() > new Date(status.posterExpiresAt);
    if (!isExpired) return status.todayPosterImage;
  }
  // Fallback: generate SVG with correct category
  if (!status?.todayQuestion) return null;
  return generateSVGPoster({
    topic: status.todayTopic || "Speaking Practice",
    question: status.todayQuestion,
    category: status.todayCategory || "General",
  });
}

/**
 * Get today's dashboard overview (all roles)
 */
export async function getTodayOverview() {
  const status = await Status.findOne().lean();
  const users = await User.find().lean();

  const completed = users.filter(u => u.completed);
  const pending = users.filter(u => !u.completed);
  const topStreak = [...users]
    .sort((a, b) => (b.streak || 0) - (a.streak || 0))
    .slice(0, 5)
    .map(u => ({
      name: u.name,
      userId: u.userId,
      streak: u.streak || 0,
      weeklySubmissions: u.weeklySubmissions || 0,
      completed: u.completed || false,
    }));

  return {
    today: {
      questionSent: status?.questionSentToday || false,
      topic: status?.todayTopic || null,
      question: status?.todayQuestion || null,
      category: status?.todayCategory || null,
      posterImage: getPosterImage(status),
    },
    stats: {
      total: users.length,
      completed: completed.length,
      pending: pending.length,
    },
    topStreak,
  };
}

/**
 * Get weekly report summary (admin/trainer only)
 */
export async function getWeeklyReport() {
  const users = await User.find().lean();
  const sorted = [...users].sort((a, b) => (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0));
  
  return sorted.map(u => ({
    name: u.name,
    userId: u.userId,
    weeklySubmissions: u.weeklySubmissions || 0,
    streak: u.streak || 0,
    streakFreeze: u.streakFreeze || 0,
    monthlyScore: u.monthlyScore || 0,
  }));
}

/**
 * Get monthly report summary (admin/trainer only)
 */
export async function getMonthlyReport() {
  const users = await User.find().lean();
  const sorted = [...users].sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0));
  
  return sorted.map(u => ({
    name: u.name,
    userId: u.userId,
    monthlySubmissions: u.monthlySubmissions || 0,
    monthlyScore: u.monthlyScore || 0,
    streak: u.streak || 0,
    streakFreeze: u.streakFreeze || 0,
  }));
}

/**
 * Get full profile for logged-in user
 */
export async function getUserProfile(phone) {
  // phone may be null when the auth account has no linked WhatsApp number yet
  let user = null;
  if (phone) {
    // Match by phone field — try with and without country code prefix
    user = await User.findOne({ 
      phone: { $in: [phone, phone.replace(/^91/, ""), `91${phone}`] } 
    }).lean();
  }

  // If no WhatsApp user found, create a basic profile from auth data
  if (!user) {
    user = {
      name: "User",
      phone: phone,
      feedbackScores: [],
      streak: 0,
      fine: 0,
      completed: false,
      weeklySubmissions: 0,
      monthlySubmissions: 0,
      monthlyScore: 0,
      streakFreeze: 0,
    };
  }

  const status = await Status.findOne().lean();
  const allUsers = await User.find().lean();
  const completed = allUsers.filter(u => u.completed).length;
  const sortedByStreak = [...allUsers].sort((a, b) => (b.streak || 0) - (a.streak || 0));

  // Lazy-generate vocabulary if missing (non-blocking — resolves in parallel)
  const vocabularyPromise = (status?.questionSentToday && status?.todayQuestion)
    ? getTodayVocabulary().catch(() => [])
    : Promise.resolve(status?.todayVocabulary || []);

  // ── Leaderboard sort ─────────────────────────────────────────────────────
  // Primary sort: monthlyScore desc (highest pts first, always)
  // Secondary sort: streak desc (tiebreaker when scores are equal)
  // Submitted today floats above non-submitted at equal score
  const leaderboardSorted = [...allUsers].sort((a, b) => {
    const scoreA = a.monthlyScore ?? 0;
    const scoreB = b.monthlyScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;          // higher pts first
    if (b.completed !== a.completed) return b.completed ? 1 : -1; // submitted floats up
    return (b.streak || 0) - (a.streak || 0);               // streak tiebreaker
  });

  const topStreak = leaderboardSorted
    .map(u => ({
      name: u.name,
      userId: u.userId,
      streak: u.streak || 0,
      weeklySubmissions: u.weeklySubmissions || 0,
      completed: u.completed || false,
      monthlyScore: u.monthlyScore ?? 0,
    }));

  // ── Today's top scorer ──────────────────────────────────────────────────
  // Find the user with the highest todayScore who actually scored today
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayIST = `${nowIST.getFullYear()}-${String(nowIST.getMonth()+1).padStart(2,"0")}-${String(nowIST.getDate()).padStart(2,"0")}`;
  const todayScoredUsers = allUsers.filter(u => u.lastScoreDate === todayIST && u.todayScore != null);
  const topScorerToday = todayScoredUsers.length > 0
    ? todayScoredUsers.reduce((best, u) => (u.todayScore > best.todayScore ? u : best))
    : null;
  const todayTopScorer = topScorerToday ? {
    name: topScorerToday.name,
    score: Math.round(topScorerToday.todayScore),
  } : null;

  // Find the current user's rank in the full leaderboard
  const myRankIdx = leaderboardSorted.findIndex(u =>
    u.phone === phone ||
    u.phone === phone.replace(/^91/, "") ||
    u.phone === `91${phone}`
  );
  const myStreakEntry = myRankIdx >= 0 ? {
    rank: myRankIdx + 1,
    name: leaderboardSorted[myRankIdx].name,
    userId: leaderboardSorted[myRankIdx].userId,
    streak: leaderboardSorted[myRankIdx].streak || 0,
    weeklySubmissions: leaderboardSorted[myRankIdx].weeklySubmissions || 0,
    completed: leaderboardSorted[myRankIdx].completed || false,
    monthlyScore: leaderboardSorted[myRankIdx].monthlyScore ?? 0,
    inTop5: myRankIdx < 5,
  } : null;

  // Check if we should show daily report (12 AM - 8 AM)
  let dailyReport = null;
  let showReport = false;
  
  if (status?.dailyReportGenerated && status?.reportExpiresAt) {
    const now = new Date();
    if (now < new Date(status.reportExpiresAt)) {
      // We're in the report window
      showReport = true;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      if (user && user._id) {
        dailyReport = await DailyReport.findOne({
          userId: user._id,
          date: todayStart,
        }).lean();
      }
    }
  }

  return {
    profile: {
      name: user.name,
      feedbackScores: user.feedbackScores || [],
      streak: user.streak || 0,
      streakFreeze: user.streakFreeze || 0,
      monthlyScore: user.monthlyScore || 0,
      completed: user.completed || false,
      weeklySubmissions: user.weeklySubmissions || 0,
      monthlySubmissions: user.monthlySubmissions || 0,
      linkedPhone: user.phone || null,
    },
    today: {
      questionSent: status?.questionSentToday || false,
      topic: status?.todayTopic || null,
      question: status?.todayQuestion || null,
      category: status?.todayCategory || null,
      posterImage: getPosterImage(status),
      isMonthlyReflection: status?.isMonthlyReflectionDay || false,
      isMonthlyGoals: status?.isMonthlyGoalsDay || false,
      isWeeklyReflection: status?.isWeeklyReflectionDay || false,
      vocabulary: await vocabularyPromise,
    },
    dailyReport: showReport ? dailyReport : null,
    showReport,
    reportExpiresAt: showReport ? status.reportExpiresAt : null,
    posterSendTime: status?.posterSendTime || "08:00",
    stats: {
      total: allUsers.length,
      completed,
      pending: allUsers.length - completed,
      totalFreeze: allUsers.reduce((sum, u) => sum + (u.streakFreeze || 0), 0),
    },
    topStreak,
    myStreakEntry,
    todayTopScorer,
    streakRecord: await (async () => {
      // Always check if current top user beats the stored record
      const topUser = sortedByStreak[0];
      const existing = await StreakRecord.findOne().lean();
      if (topUser && (topUser.streak || 0) > 0) {
        if (!existing || topUser.streak > existing.streak) {
          return await StreakRecord.findOneAndUpdate(
            {},
            {
              name: topUser.name || topUser.userId || "Unknown",
              userId: topUser.userId || null,
              streak: topUser.streak,
              achievedAt: new Date(),
            },
            { upsert: true, new: true }
          ).lean();
        }
      }
      return existing;
    })(),
  };
}

/**
 * Get feedback score history for a user
 * Tries multiple phone formats to handle country code variations
 */
export async function getUserScores(phone) {
  const stripped = phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({
    phone: { $in: [phone, stripped, `91${stripped}`, `+91${stripped}`] }
  }).lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  return {
    name: user.name,
    feedbackScores: user.feedbackScores || [],
    streak: user.streak || 0,
    streakFreeze: user.streakFreeze || 0,
    monthlyScore: user.monthlyScore || 0,
  };
}

/**
 * Manually set today's question (admin only)
 */
export async function setTodayQuestion(topic, question, category) {
  if (!question) {
    throw new Error("question is required");
  }
  
  await Status.updateOne({}, {
    $set: {
      todayQuestion: question,
      todayTopic: topic || null,
      todayCategory: category || null,
      questionSentToday: true,
    }
  }, { upsert: true });
  
  return { success: true };
}

/**
 * Get bot schedule settings (admin only)
 */
export async function getSettings() {
  let status = await Status.findOne().lean();
  if (!status) {
    status = await Status.create({});
  }
  
  return {
    posterSendTime: status.posterSendTime || "08:00",
    questionGenerateTime: status.questionGenerateTime || "07:00",
    vocabWordCount: status.vocabWordCount ?? 3,
    vocabLevel: status.vocabLevel || "B2",
  };
}

/**
 * Update bot schedule settings (admin only)
 */
export async function updateSettings(posterSendTime, questionGenerateTime, vocabWordCount, vocabLevel) {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const updates = {};
  
  if (posterSendTime !== undefined) {
    if (!timeRegex.test(posterSendTime)) {
      const error = new Error("Invalid posterSendTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.posterSendTime = posterSendTime;
  }
  
  if (questionGenerateTime !== undefined) {
    if (!timeRegex.test(questionGenerateTime)) {
      const error = new Error("Invalid questionGenerateTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.questionGenerateTime = questionGenerateTime;
  }

  if (vocabWordCount !== undefined) {
    const count = parseInt(vocabWordCount, 10);
    if (isNaN(count) || count < 1 || count > 10) {
      const error = new Error("vocabWordCount must be between 1 and 10");
      error.statusCode = 400;
      throw error;
    }
    updates.vocabWordCount = count;
    // Clear today's vocab so it regenerates with new count
    updates.todayVocabulary = [];
  }

  if (vocabLevel !== undefined) {
    const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (!VALID_LEVELS.includes(vocabLevel)) {
      const error = new Error(`vocabLevel must be one of: ${VALID_LEVELS.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    updates.vocabLevel = vocabLevel;
    // Clear today's vocab so it regenerates with new level
    updates.todayVocabulary = [];
  }
  
  await Status.updateOne({}, { $set: updates }, { upsert: true });
  
  return { success: true, ...updates };
}

/**
 * Debug daily report status (admin only)
 */
export async function getDebugReport() {
  const status = await Status.findOne().lean();
  const now = new Date();
  const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  
  const todayStart = new Date(nowIST);
  todayStart.setHours(0, 0, 0, 0);
  
  const reportCount = await DailyReport.countDocuments({
    date: { $gte: todayStart }
  });
  
  return {
    currentTime: now,
    currentTimeIST: nowIST,
    status: {
      dailyReportGenerated: status?.dailyReportGenerated || false,
      reportExpiresAt: status?.reportExpiresAt || null,
      questionSentToday: status?.questionSentToday || false,
    },
    reportCount,
    showReport: status?.dailyReportGenerated && status?.reportExpiresAt && now < new Date(status.reportExpiresAt),
    explanation: !status?.dailyReportGenerated 
      ? "Reports not generated yet (scheduler hasn't run at midnight)"
      : now >= new Date(status.reportExpiresAt)
      ? "Report window expired (past 8 AM)"
      : "Report should be visible",
  };
}

/**
 * Manually trigger report generation (admin only, for testing)
 */
export async function generateReportNow() {
  const { generateDailyReports } = await import("../../../backend/services/scheduler/dailyReportService.js");
  await generateDailyReports();
  return { success: true, message: "Daily reports generated successfully" };
}

/**
 * Force monthly reflection mode ON (admin only, for testing)
 */
export async function enableMonthlyReflection() {
  const { MONTHLY_REFLECTION_QUESTIONS, MONTHLY_REFLECTION_TOPIC, MONTHLY_REFLECTION_CATEGORY } = await import("../../../api/scheduler.js");
  const reflectionText = MONTHLY_REFLECTION_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isMonthlyReflectionDay: true,
      isMonthlyGoalsDay: false,
      todayTopic: MONTHLY_REFLECTION_TOPIC,
      todayQuestion: reflectionText,
      todayCategory: MONTHLY_REFLECTION_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Monthly reflection mode activated — refresh the app to see it" };
}

/**
 * Force monthly goal-setting mode ON (admin only, for testing)
 */
export async function enableMonthlyGoals() {
  const { MONTHLY_GOALS_QUESTIONS, MONTHLY_GOALS_TOPIC, MONTHLY_GOALS_CATEGORY } = await import("../../../api/scheduler.js");
  const goalsText = MONTHLY_GOALS_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isMonthlyGoalsDay: true,
      isMonthlyReflectionDay: false,
      isWeeklyReflectionDay: false,
      todayTopic: MONTHLY_GOALS_TOPIC,
      todayQuestion: goalsText,
      todayCategory: MONTHLY_GOALS_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Monthly goal-setting mode activated — refresh the app to see it" };
}

/**
 * Force weekly reflection mode ON (admin only, for testing)
 */
export async function enableWeeklyReflection() {
  const { WEEKLY_REFLECTION_QUESTIONS, WEEKLY_REFLECTION_TOPIC, WEEKLY_REFLECTION_CATEGORY } = await import("../../../api/scheduler.js");
  const weeklyText = WEEKLY_REFLECTION_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isWeeklyReflectionDay: true,
      isMonthlyReflectionDay: false,
      isMonthlyGoalsDay: false,
      todayTopic: WEEKLY_REFLECTION_TOPIC,
      todayQuestion: weeklyText,
      todayCategory: WEEKLY_REFLECTION_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Weekly reflection mode activated — refresh the app to see it" };
}

/**
 * Turn off all special modes (admin only)
 */
export async function disableSpecialModes() {
  await Status.updateOne({}, {
    $set: {
      isMonthlyReflectionDay: false,
      isMonthlyGoalsDay: false,
      isWeeklyReflectionDay: false,
      questionSentToday: false,
      todayTopic: null,
      todayQuestion: null,
      todayCategory: null,
    }
  });
  
  return { success: true, message: "All special modes turned off" };
}
