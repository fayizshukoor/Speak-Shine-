/**
 * scheduler.js — Standalone question scheduler for the webapp.
 * Runs inside api/server.js so it works independently of the WhatsApp bot.
 * Every minute checks if it's time to publish today's question to the webapp.
 */

import cron from "node-cron";
import Status from "../models/statusSchema.js";
import Question from "../models/questionSchema.js";
import { generateAndInsertQuestions } from "../ai/questionGenerator.js";

const TIMEZONE = "Asia/Kolkata";

async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return; // already published today
    }

    // Ensure question bank has questions
    let count = await Question.countDocuments();
    if (count === 0) {
      console.log("[Scheduler] Question bank empty — auto-generating 14...");
      try {
        const { totalInDb } = await generateAndInsertQuestions(14);
        count = totalInDb;
        console.log(`[Scheduler] Generated questions. Total: ${count}`);
      } catch (err) {
        console.log("[Scheduler] Auto-generate failed:", err.message);
        return;
      }
    } else if (count <= 7) {
      // Refill in background
      generateAndInsertQuestions(14)
        .then(({ inserted, totalInDb }) => console.log(`[Scheduler] Auto-refill: +${inserted.length} questions. Total: ${totalInDb}`))
        .catch(err => console.log("[Scheduler] Background refill failed:", err.message));
    }

    // Pick a question avoiding recent categories
    const statusDoc = await Status.findOne();
    const recentCategories = statusDoc?.recentCategories || [];

    let q = null;
    if (recentCategories.length > 0) {
      const fresh = await Question.aggregate([
        { $match: { category: { $nin: recentCategories } } },
        { $sample: { size: 1 } },
      ]);
      if (fresh?.length) q = fresh;
    }
    if (!q || !q.length) {
      q = await Question.aggregate([{ $sample: { size: 1 } }]);
    }
    if (!q || !q.length) {
      console.log("[Scheduler] No questions available");
      return;
    }

    const question = q[0];
    const updatedRecent = question.category
      ? [...new Set([...recentCategories, question.category])].slice(-7)
      : recentCategories;

    await Status.updateOne({}, {
      $set: {
        questionSentToday: true,
        todayTopic: question.topic || null,
        todayQuestion: question.question || null,
        todayCategory: question.category || null,
        recentCategories: updatedRecent,
      }
    }, { upsert: true });

    await Question.findByIdAndDelete(question._id);
    console.log(`[Scheduler] ✅ Question published | Topic: ${question.topic} | Category: ${question.category}`);
  } catch (err) {
    console.log("[Scheduler] Error:", err.message);
  }
}

export function startScheduler() {
  console.log("[Scheduler] Starting question scheduler...");

  // Run every minute — check if it's time based on DB setting
  cron.schedule("* * * * *", async () => {
    try {
      const s = await Status.findOne().lean();
      if (!s) return;

      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const nowTime = `${String(nowIST.getHours()).padStart(2,"0")}:${String(nowIST.getMinutes()).padStart(2,"0")}`;

      const sendTime = s.posterSendTime || "08:00";
      if (nowTime === sendTime && !s.questionSentToday) {
        console.log(`[Scheduler] ⏰ Time matched: ${nowTime} — publishing question`);
        await publishDailyQuestion();
      }
    } catch (err) {
      console.log("[Scheduler] Cron error:", err.message);
    }
  }, { timezone: TIMEZONE });

  // Catch-up: if scheduled time already passed today and question not sent yet
  setTimeout(async () => {
    try {
      const s = await Status.findOne().lean();
      if (!s || s.questionSentToday) return;

      const sendTime = s.posterSendTime || "08:00";
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const nowMins = nowIST.getHours() * 60 + nowIST.getMinutes();
      const [sh, sm] = sendTime.split(":").map(Number);
      const sendMins = sh * 60 + sm;

      // If within 4-hour window after scheduled time
      if (nowMins >= sendMins && nowMins <= sendMins + 240) {
        console.log(`[Scheduler] Catch-up: ${sendTime} already passed, publishing now...`);
        await publishDailyQuestion();
      }
    } catch (err) {
      console.log("[Scheduler] Catch-up error:", err.message);
    }
  }, 5000); // wait 5s for DB to connect

  console.log("[Scheduler] ✅ Question scheduler running");
}
