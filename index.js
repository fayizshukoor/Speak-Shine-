// =============================
// ⏰ DAY REMINDERS (9,1,5)
// =============================
cron.schedule(
  TEST_MODE ? "*/2 * * * *" : "0 9,13,17 * * *",
  async () => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);
    if (!pending.length) return;

    let msg = "⏰ *Reminder*\n\n📢 Submit your video 🎥\n\n";

    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });
  },
  { timezone: TIMEZONE }
);

// =============================
// 🌙 NIGHT GROUP REMINDER (9 & 10 PM)
// =============================
cron.schedule(
  TEST_MODE ? "*/2 * * * *" : "0 21,22 * * *",
  async () => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);
    if (!pending.length) return;

    let msg =
      "🌙 *Night Reminder*\n\n⚠️ Don't forget to submit your video!\n\n";

    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });
  },
  { timezone: TIMEZONE }
);

// =============================
// 🌙 11 PM DM (PENDING ONLY)
// =============================
cron.schedule(
  TEST_MODE ? "*/2 * * * *" : "0 23 * * *",
  async () => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);
    if (!pending.length) return;

    for (let u of pending) {
      await safeSend(sock, u.userId, {
        text:
          "🚨 *Reminder*\n\n⚠️ You haven't submitted your video!\n\n⏳ Submit before 12 AM",
      });
    }

    console.log("📩 11PM DM sent");
  },
  { timezone: TIMEZONE }
);

// =============================
// 🚨 11:50 PM WARNING + VOICE
// =============================
cron.schedule(
  TEST_MODE ? "*/2 * * * *" : "50 23 * * *",
  async () => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);
    if (!pending.length) return;

    let msg =
      "🚨 *LAST 10 MINUTES!*\n\n⚠️ Submit NOW or fine will apply!\n\n";

    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });

    // 🎤 VOICE
    const filePath = "./temp-warning.mp3";

    try {
      await generateVoice(
        "Last 10 minutes. Submit your video now or fine will be applied.",
        filePath
      );

      const buffer = fs.readFileSync(filePath);

      await sock.sendMessage(TARGET_GROUP, {
        audio: buffer,
        mimetype: "audio/mpeg",
        ptt: true,
      });

      fs.unlinkSync(filePath);

      console.log("🎤 Voice sent at 11:50 PM");
    } catch (err) {
      console.log("❌ Voice error:", err);
    }
  },
  { timezone: TIMEZONE }
);

// =============================
// 📊 FINAL REPORT (12 AM)
// =============================
cron.schedule(
  TEST_MODE ? "*/3 * * * *" : "0 0 * * *",
  async () => {
    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);

    let msg = "📊 *Yesterday Report*\n\n";

    msg += "🏆 *Leaderboard*\n\n";
    users
      .sort((a, b) => b.completed - a.completed)
      .forEach((u, i) => {
        const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
        msg += `${medal} @${u.userId.split("@")[0]} → ${
          u.completed ? "✅" : "❌"
        }\n`;
      });

    msg += "\n";

    if (notDone.length) {
      msg += "❌ *Not Completed*\n\n";
      for (let u of notDone) {
        if (!TEST_MODE) {
          u.fine += 2;
          await u.save();
        }
        msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      }
      msg += "\n";
    } else {
      msg += "🎉 Everyone completed!\n\n";
    }

    msg += "💰 *Total Fines*\n\n";
    users.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine}\n`;
    });

    // reset
    for (let u of users) {
      u.completed = false;
      await u.save();
    }

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: users.map((u) => u.userId),
    });
  },
  { timezone: TIMEZONE }
);