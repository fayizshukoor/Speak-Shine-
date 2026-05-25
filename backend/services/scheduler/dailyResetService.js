/**
 * Daily Reset Service
 * Business logic for daily resets, fines, streaks, and counters
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import StreakRecord from "../../../models/streakRecordSchema.js";

const TIMEZONE = "Asia/Kolkata";

/**
 * Apply a missed-day fine for one user.
 * Negative fine = streak-reward buffer (₹5 at 7 days ≈ 2 free days at ₹2/day).
 * Buffer absorbs the fine without charging weeklyFine; streak is left unchanged.
 * When buffer is exhausted, overflow is charged and streak resets.
 */
export function computeMissedDayFineUpdate(currentFine, fineAmount) {
  const fine = currentFine || 0;
  if (fine < 0) {
    const newFine = fine + fineAmount;
    if (newFine <= 0) {
      return { fineCharged: false, setFine: newFine, weeklyFineInc: 0 };
    }
    return { fineCharged: true, setFine: newFine, weeklyFineInc: newFine };
  }
  return { fineCharged: true, incFine: fineAmount, weeklyFineInc: fineAmount };
}

/**
 * Apply daily fines and update streaks
 * Runs at midnight IST
 */
export async function applyDailyFinesAndStreaks() {
  try {
    const FINE_AMOUNT = Number(process.env.FINE_AMOUNT) || 2;
    const STREAK_REWARD_DAYS = 7;
    const STREAK_REWARD_AMOUNT = 5;

    // ── 1. Missed today: fine (or buffer absorb); reset streak only if fined ─
    const missedUsers = await User.find({ completed: false }).lean();
    let finesApplied = 0;
    let finesAbsorbed = 0;
    let streaksReset = 0;

    for (const u of missedUsers) {
      const update = computeMissedDayFineUpdate(u.fine, FINE_AMOUNT);

      if (update.setFine !== undefined) {
        await User.updateOne({ _id: u._id }, { $set: { fine: update.setFine } });
        if (update.fineCharged) finesApplied++;
        else finesAbsorbed++;
      } else {
        await User.updateOne(
          { _id: u._id },
          { $inc: { fine: update.incFine, weeklyFine: update.weeklyFineInc } }
        );
        finesApplied++;
      }

      if (update.fineCharged) {
        await User.updateOne({ _id: u._id }, { $set: { streak: 0 } });
        streaksReset++;
      }
    }

    // ── 2. Submitted today: increment streak ────────────────────────────────
    const submittedUsers = await User.find({ completed: true }).lean();

    await User.updateMany({ completed: true }, { $inc: { streak: 1 } });

    // ── 4. 7-day streak reward: subtract ₹5 from fine (can go negative) ──
    // Negative fine = "free pass" buffer — absorbs future missed-day fines
    // Use pre-fetched users + 1 to get the exact post-increment streak value,
    // avoiding any timing issue with reading after updateMany.
    const rewardedUsers = [];

    for (const u of submittedUsers) {
      const newStreak = (u.streak || 0) + 1; // what the streak will be after increment
      if (newStreak > 0 && newStreak % STREAK_REWARD_DAYS === 0) {
        await User.updateOne({ _id: u._id }, { $inc: { fine: -STREAK_REWARD_AMOUNT } });
        rewardedUsers.push({
          name: u.name || u.phone,
          previousFine: u.fine || 0,
          newFine: (u.fine || 0) - STREAK_REWARD_AMOUNT,
          streak: newStreak,
          deducted: STREAK_REWARD_AMOUNT,
        });
        console.log(`[DailyReset] 🎁 Streak reward: ${u.name} streak=${newStreak} fine ${u.fine || 0} → ${(u.fine || 0) - STREAK_REWARD_AMOUNT}`);
      }
    }

    // ── 5. Update all-time streak record (Hall of Fame) ───────────────────
    // Fetch AFTER increment so we see the updated streak values
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

    return {
      finesApplied,
      finesAbsorbed,
      streaksReset,
      fineAmount: FINE_AMOUNT,
      streaksUpdated: true,
      rewardedUsers
    };
  } catch (err) {
    console.error("[DailyReset] Apply fines error:", err);
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
    const result = await User.updateMany({}, { completed: false });

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
      { $set: { monthlySubmissions: 0 } }
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
 * Track consecutive missed days and auto-disable accounts at threshold
 */
export async function trackConsecutiveSkipsAndAutoDisable() {
  const AUTO_DISABLE_SKIPS = Number(process.env.AUTO_DISABLE_SKIPS) || 3;

  await User.updateMany({ completed: true }, { $set: { consecutiveSkips: 0 } });
  await User.updateMany({ completed: false }, { $inc: { consecutiveSkips: 1 } });

  const toDisable = await User.find({
    consecutiveSkips: { $gte: AUTO_DISABLE_SKIPS },
  }).select("phone name consecutiveSkips").lean();

  if (toDisable.length === 0) {
    return { disabled: 0 };
  }

  const Auth = (await import("../../../models/authSchema.js")).default;
  const { forceLogoutUser } = await import("../../sockets/chatSocket.js");

  let disabled = 0;
  for (const u of toDisable) {
    const phone = u.phone;
    if (!phone) continue;

    const updated = await Auth.findOneAndUpdate(
      { phone, isActive: true },
      { $set: { isActive: false, refreshTokens: [] } },
      { new: true }
    );

    if (updated) {
      disabled++;
      console.log(`[DailyReset] 🚫 Auto-disabled ${u.name || phone} after ${u.consecutiveSkips} consecutive skips`);
      forceLogoutUser(phone);
    }
  }

  return { disabled };
}

/**
 * Complete daily reset process
 * Runs all reset tasks in order
 */
export async function performDailyReset() {
  try {
    console.log("[DailyReset] 🔄 Running daily reset...");

    // 1. Apply fines and update streaks
    const finesResult = await applyDailyFinesAndStreaks();
    console.log(`[DailyReset] ✅ Fine ₹${finesResult.fineAmount} applied to ${finesResult.finesApplied} missed users`);
    if (finesResult.finesAbsorbed > 0) {
      console.log(`[DailyReset] 🛡️ ${finesResult.finesAbsorbed} missed day(s) absorbed by streak fine buffer (streak kept)`);
    }
    if (finesResult.streaksReset > 0) {
      console.log(`[DailyReset] ✅ Streak reset for ${finesResult.streaksReset} user(s) who were fined`);
    }
    console.log("[DailyReset] ✅ Streaks incremented for submitters");
    
    if (finesResult.rewardedUsers.length > 0) {
      finesResult.rewardedUsers.forEach(u => {
        console.log(`[DailyReset] 🎁 Streak reward: ${u.name} -₹${u.deducted} fine (${u.streak} day streak)`);
      });
    }

    // 2. Consecutive skip tracking + auto-disable
    const skipResult = await trackConsecutiveSkipsAndAutoDisable();
    if (skipResult.disabled > 0) {
      console.log(`[DailyReset] 🚫 Auto-disabled ${skipResult.disabled} user(s)`);
    }

    // 3. Increment submission counters
    const countersResult = await incrementSubmissionCounters();
    console.log("[DailyReset] ✅ Incremented weekly/monthly submissions");

    // 4. Reset daily flags
    const flagsResult = await resetDailyFlags();
    console.log("[DailyReset] ✅ Reset completed flags");

    // 5. Sunday: reset weekly
    const weeklyResult = await resetWeeklyCounters();
    if (weeklyResult.isSunday) {
      console.log("[DailyReset] ✅ Weekly submissions + fines reset (Sunday)");
    }

    // 6. 1st of month: reset monthly
    const monthlyResult = await resetMonthlyCounters();
    if (monthlyResult.isFirstDay) {
      console.log("[DailyReset] ✅ Monthly submissions reset (1st of month)");
    }

    // 7. Reset status flags + stamp lastResetDate so startup catch-up knows it ran
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
        lastResetDate: todayIST,
      }
    }, { upsert: true });
    console.log("[DailyReset] ✅ Status flags reset");

    console.log("[DailyReset] 🔄 Daily reset complete");

    return {
      success: true,
      finesApplied: finesResult.finesApplied,
      streakRewards: finesResult.rewardedUsers.length,
      countersUpdated: countersResult.updated,
      flagsReset: flagsResult.reset,
      weeklyReset: weeklyResult.reset,
      monthlyReset: monthlyResult.reset
    };
  } catch (err) {
    console.error("[DailyReset] ❌ Daily reset error:", err);
    throw err;
  }
}
