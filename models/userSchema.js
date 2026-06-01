import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: { type: String, default: null },
  phone: { type: String, default: null },   // e.g. "8848096746" — auto-saved on first login
  fine: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
  consecutiveSkips: { type: Number, default: 0 }, // days missed in a row — auto-disable at 3
  weeklySubmissions: { type: Number, default: 0 },
  weeklyFine: { type: Number, default: 0 },
  monthlySubmissions: { type: Number, default: 0 },
  fineChargedToday: { type: Boolean, default: false }, // set by daily reset; used by report generator
  feedbackScores: {
    type: [{
      fluency: Number,
      grammar: Number,
      confidence: Number,
      vocabulary: Number,
      date: { type: Date, default: Date.now },
    }],
    default: [],
  },
  // Today's composite score (0–100). Overwritten on each submission; reset to null at 11am daily.
  todayScore: { type: Number, default: null, min: 0, max: 100 },
});

userSchema.index({ phone: 1 });

export default mongoose.model("User", userSchema);