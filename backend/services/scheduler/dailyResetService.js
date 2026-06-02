/**
 * Daily Reset Service
 * Business logic for daily resets, fines, streaks, and counters
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import StreakRecord from "../../../models/streakRecordSchema.js";

const TIMEZONE = "Asia/Kolkata";

/**
 * Update streaks at midnight — missed users reset to 0, submitters increment.
 * Fines and auto-disable have been removed.
 */
export async function applyStreakUpdates() {
  try {
    // 1. Missed today → reset streak to 0
    const missedResult = await User.updateMany(
      { completed: false },
      { $set: { streak: 0, fineChargedToday: false } }
    );

    // 2. Submitted today → increment streak
    await User.updateMany(
      { completed: true },
      { $inc: { streak: 1 }, $set: { fineChargedToday: false } }
    );

    // 3. Update all-time streak record (Hall of Fame)
    try {
      const updatedUsers = await User.find({}).lean();
      const topUser = updatedUsers.reduce((best, u) =>
        (u.streak || 0) > (best ? (best.streak || 0) : 0) ? u : best, null);

      if (topUser && (topUser.streak || 0) > 0) {
        const existing = await StreakRecord.findOne();
        if (!existing || topUser.streak > existing.streak) {
          await StreakRecord.findOneAndUpdate(
            {},
            {
              name: topUser.name || topUser.userId || "Unknown",
              userId: topUser.userId || null,
              streak: topUser.streak,
              achievedAt: new Date(),
            },
            { upsert: true, new: true }
          );
          console.log(`[DailyReset] 🏆 New all-time streak record: ${topUser.name} — ${topUser.streak} days`);
        }
      }
    } catch (recErr) {
      console.error("[DailyReset] Streak record update failed:", recErr);
    }

    return { streaksReset: missedResult.modifiedCount };
  } catch (err) {
    console.error("[DailyReset] Streak update error:", err);
    throw err;
  }
}

/**
 * Increment weekly and monthly submission counters
 */
export async function incrementSubmissionCounters() {
  try {
    const result = await User.updateMany(
      { completed: true },
      { $inc: { weeklySubmissions: 1, monthlySubmissions: 1 } }
    );

    return {
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Increment counters error:", err);
    throw err;
  }
}

/**
 * Reset daily completed flags
 */
export async function resetDailyFlags() {
  try {
    const result = await User.updateMany({}, { completed: false, fineChargedToday: false });

    return {
      reset: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset flags error:", err);
    throw err;
  }
}

/**
 * Reset weekly submissions and fines (Sunday only)
 */
export async function resetWeeklyCounters() {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday

    if (dayOfWeek !== 0) {
      return { isSunday: false, reset: false };
    }

    const result = await User.updateMany(
      {},
      { $set: { weeklySubmissions: 0, weeklyFine: 0 } }
    );

    return {
      isSunday: true,
      reset: true,
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset weekly error:", err);
    throw err;
  }
}

/**
 * Reset monthly submissions (1st of month only)
 */
export async function resetMonthlyCounters() {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfMonth = nowIST.getDate();

    if (dayOfMonth !== 1) {
      return { isFirstDay: false, reset: false };
    }

    const result = await User.updateMany(
      {},
      { $set: { monthlySubmissions: 0, monthlyScore: 0, lastScoreDate: null } }
    );

    return {
      isFirstDay: true,
      reset: true,
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset monthly error:", err);
    throw err;
  }
}

/**
 * Reset status flags
 */
export async function resetStatusFlags() {
  try {
    await Status.updateOne({}, {
      $set: {
        questionSentToday: false,
        dailyReportGenerated: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        isWeeklyReflectionDay: false,
      }
    }, { upsert: true });

    return { reset: true };
  } catch (err) {
    console.error("[DailyReset] Reset status error:", err);
    throw err;
  }
}

/**
 * Complete daily reset process
 * Runs all reset tasks in order
 */
export async function performDailyReset() {
  try {
    console.log("[DailyReset] 🔄 Running daily reset...");

    // 1. Update streaks only (no fines, no auto-disable)
    const streakResult = await applyStreakUpdates();
    if (streakResult.streaksReset > 0) {
      console.log(`[DailyReset] ✅ Streak reset for ${streakResult.streaksReset} user(s) who missed`);
    }
    console.log("[DailyReset] ✅ Streaks incremented for submitters");

    // 2. Increment submission counters
    const countersResult = await incrementSubmissionCounters();
    console.log("[DailyReset] ✅ Incremented weekly/monthly submissions");

    // 3. Reset daily flags
    const flagsResult = await resetDailyFlags();
    console.log("[DailyReset] ✅ Reset completed flags");

    // 4. Sunday: reset weekly
    const weeklyResult = await resetWeeklyCounters();
    if (weeklyResult.isSunday) {
      console.log("[DailyReset] ✅ Weekly submissions reset (Sunday)");
    }

    // 5. 1st of month: reset monthly
    const monthlyResult = await resetMonthlyCounters();
    if (monthlyResult.isFirstDay) {
      console.log("[DailyReset] ✅ Monthly submissions reset (1st of month)");
    }

    // 6. Reset status flags + vocabulary + stamp lastResetDate
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y = nowIST.getFullYear();
    const mo = String(nowIST.getMonth() + 1).padStart(2, "0");
    const d = String(nowIST.getDate()).padStart(2, "0");
    const todayIST = `${y}-${mo}-${d}`;

    await Status.updateOne({}, {
      $set: {
        questionSentToday: false,
        dailyReportGenerated: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        isWeeklyReflectionDay: false,
        todayQuestion: null,
        todayTopic: null,
        todayCategory: null,
        todayPosterImage: null,
        todayVocabulary: [],      // ← reset vocab words each day
        lastResetDate: todayIST,
      }
    }, { upsert: true });
    console.log("[DailyReset] ✅ Status flags + vocabulary reset");

    // 7. Reset monthlyScore + lastScoreDate on 1st of month only
    if (monthlyResult.isFirstDay) {
      await User.updateMany({}, { $set: { monthlyScore: 0, lastScoreDate: null } });
      console.log("[DailyReset] ✅ monthlyScore reset to 0 for all users (1st of month)");
    }

    console.log("[DailyReset] 🔄 Daily reset complete");

    return {
      success: true,
      streaksReset: streakResult.streaksReset,
      countersUpdated: countersResult.updated,
      flagsReset: flagsResult.reset,
      weeklyReset: weeklyResult.reset,
      monthlyReset: monthlyResult.reset,
    };
  } catch (err) {
    console.error("[DailyReset] ❌ Daily reset error:", err);
    throw err;
  }
}
