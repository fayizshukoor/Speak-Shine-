import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import User from "./models/userSchema.js";
import Question from "./models/questionSchema.js";
import Status from "./models/statusSchema.js";
import generateVoice from "./generateVoice.js";
import fs from "fs";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const OWNER = process.env.OWNER_NUMBER;
const TIMEZONE = "Asia/Kolkata";

// ================= SAFE SEND =================
const safeSend = async (sock, jid, msg) => {
  try {
    if (!sock?.user) return false;
    await sock.sendMessage(jid, msg);
    return true;
  } catch (err) {
    console.log("Send error:", err);
    return false;
  }
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  // ================= STATUS =================
  const getStatus = async () => {
    let s = await Status.findOne();
    if (!s) s = await Status.create({});
    return s;
  };

  // ================= DAILY QUESTION =================
  const sendQuestion = async () => {
    const status = await getStatus();
    if (status.questionSentToday) return;

    const count = await Question.countDocuments();
    if (!count) {
      if (!status.notifiedEmpty) {
        await safeSend(sock, OWNER, { text: "🚨 No questions left!" });
        status.notifiedEmpty = true;
        await status.save();
      }
      return;
    }

    const q = await Question.aggregate([{ $sample: { size: 1 } }]);
    const question = q[0];

    const sent = await safeSend(sock, TARGET_GROUP, {
      text: `🧠 Daily Question\n\n💬 "${question.quote}"\n\n👉 ${question.question}`,
    });

    if (sent) {
      await Question.findByIdAndDelete(question._id);
      status.questionSentToday = true;
      await status.save();
    }
  };

  // ================= REMINDER =================
  const sendReminder = async (title) => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);

    if (!pending.length) {
      await safeSend(sock, TARGET_GROUP, { text: "🎉 All completed!" });
      return;
    }

    let msg = `${title}\n\n`;
    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });
  };

  // ================= DM REMINDER =================
  const sendDMReminder = async () => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);

    for (const u of pending) {
      await safeSend(sock, u.userId, {
        text: "⏰ Please submit your video today!",
      });
    }
  };

  // ================= FINAL WARNING =================
  const finalWarning = async () => {
    try {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) return;

      const text =
        "Final warning. Please submit your speaking video before deadline.";

      const filePath = "./warning.mp3";

      // 🎤 Generate voice
      await generateVoice(text, filePath);

      // 📖 Read file as buffer (IMPORTANT FIX)
      const audioBuffer = fs.readFileSync(filePath);

      // 📤 Send text
      await safeSend(sock, TARGET_GROUP, {
        text: "🚨 Final Warning! Submit before deadline!",
        mentions: pending.map((u) => u.userId),
      });

      // 🎧 Send voice (BUFFER → BEST METHOD)
      await sock.sendMessage(TARGET_GROUP, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: true,
      });

      // 🗑 delete file
      fs.unlinkSync(filePath);

      console.log("🎤 Voice sent successfully");
    } catch (err) {
      console.log("❌ Voice error:", err);
    }
  };

  // ================= DAILY REPORT =================
  const dailyReport = async () => {
    const users = await User.find();
    const completed = users.filter((u) => u.completed);
    const pending = users.filter((u) => !u.completed);

    let msg = `📊 *Daily Report*\n\n`;
    msg += `✅ Completed: ${completed.length}\n`;
    msg += `❌ Pending: ${pending.length}\n\n`;

    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });

    // reset
    await User.updateMany({}, { completed: false });

    const status = await Status.findOne();
    if (status) {
      status.questionSentToday = false;
      status.notifiedEmpty = false;
      await status.save();
    }
  };

  // ================= MESSAGE HANDLER =================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;

    const user = msg.key.participant;

    const content =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    const cmd = content.trim().toLowerCase();

    const groupMeta = await sock.groupMetadata(chatId);

    const isAdmin = groupMeta.participants.find(
      (p) => p.id === user && p.admin,
    );

    // =============================
    // 🧠 COMMANDS
    // =============================

    if (cmd === "/remaining") {
      return sendReminder("📋 Remaining Users");
    }

    // 📋 REMAINING USERS
    if (cmd.startsWith("/remaining")) {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) {
        return safeSend(sock, chatId, {
          text: "🎉 All users completed!",
        });
      }

      let msg = "📋 *Remaining Users*\n\n";
      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });
    }

    // 💰 FINE REPORT
    if (cmd.startsWith("/fine")) {
      const users = await User.find();

      let msg = "💰 *Fine Report*\n\n";

      users.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine || 0}\n`;
      });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });
    }

    // 🏆 LEADERBOARD
    if (cmd.startsWith("/leaderboard")) {
      const users = await User.find();

      let msg = "🏆 *Leaderboard*\n\n";

      users
        .sort((a, b) => b.completed - a.completed)
        .forEach((u, i) => {
          const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
          msg += `${medal} @${u.userId.split("@")[0]} → ${
            u.completed ? "✅" : "❌"
          }\n`;
        });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });
    }

    // 🔄 FULL RESET (ADMIN)
    if (cmd.startsWith("/reset")) {
      if (!isAdmin) {
        return safeSend(sock, chatId, {
          text: "❌ Admin only command",
        });
      }

      await User.updateMany({}, { completed: false, fine: 0 });

      return safeSend(sock, chatId, {
        text: "🔄 Full reset done!",
      });
    }

    // 🔄 RESET TODAY ONLY (ADMIN)
    if (cmd.startsWith("/resetday")) {
      if (!isAdmin) {
        return safeSend(sock, chatId, {
          text: "❌ Admin only command",
        });
      }

      await User.updateMany({}, { completed: false });

      return safeSend(sock, chatId, {
        text: "🔄 Today's status reset!",
      });
    }

    // video check
    const video =
      msg.message?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.videoMessage;

    if (!video) return;

    if ((video.seconds || 0) < 60) {
      return safeSend(sock, chatId, {
        text: "❌ Minimum 1 minute video",
      });
    }

    const existing = await User.findOne({ userId: user });

    if (existing?.completed) {
      return safeSend(sock, chatId, {
        text: "⚠️ Already submitted",
      });
    }

    await User.findOneAndUpdate(
      { userId: user },
      { completed: true },
      { upsert: true },
    );

    await safeSend(sock, chatId, {
      text: "✅ Completed",
    });
  });

  // ================= CRON JOBS =================

  cron.schedule("0 8 * * *", sendQuestion, { timezone: TIMEZONE });

  cron.schedule(
    "0 9,13,17 * * *",
    () => sendReminder("⏰ Reminder: Submit video"),
    { timezone: TIMEZONE },
  );

  cron.schedule("0 21,22 * * *", () => sendReminder("🌙 Night Reminder"), {
    timezone: TIMEZONE,
  });

  cron.schedule("0 23 * * *", sendDMReminder, { timezone: TIMEZONE });

  cron.schedule("35 15 * * *", finalWarning, { timezone: TIMEZONE });

  cron.schedule("0 0 * * *", dailyReport, { timezone: TIMEZONE });
  
  // ================= CONNECTION =================
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") console.log("✅ Connected");
    if (connection === "close") startBot();
  });
}

startBot();
