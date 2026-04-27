import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayCategory: { type: String, default: null },
  todayPosterImage: { type: String, default: null }, // base64 PNG — cleared after 15h or midnight
  posterExpiresAt: { type: Date, default: null },    // when to auto-clear the poster
  recentCategories: { type: [String], default: [] },
  // Configurable schedule times (HH:MM, 24h, IST)
  posterSendTime: { type: String, default: "08:00" },       // when to send daily poster/question
  questionGenerateTime: { type: String, default: "07:00" }, // when to pre-generate questions if low
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
