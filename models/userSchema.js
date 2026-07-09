import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: { type: String, default: null },
  phone: { type: String, default: null },
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
  consecutiveSkips: { type: Number, default: 0 },
  weeklySubmissions: { type: Number, default: 0 },
  monthlySubmissions: { type: Number, default: 0 },
  fineChargedToday: { type: Boolean, default: false },

  // ── Streak Freeze ────────────────────────────────────────────────────────
  // Earned at every 7-day streak milestone (+1 per 7 days).
  // Consumed automatically on a missed day to protect the streak.
  streakFreeze: { type: Number, default: 0 },

  // ── Monthly cumulative score ─────────────────────────────────────────────
  // Each day's best composite score (0–100) is added once per day.
  // On re-submission: if new score > todayScore, replace it (monthlyScore adjusted).
  // Resets to 0 on the 1st of every month.
  // lastScoreDate (YYYY-MM-DD IST) prevents double-counting on re-submissions.
  monthlyScore: { type: Number, default: 0, min: 0 },
  lastScoreDate: { type: String, default: null },
  todayScore: { type: Number, default: null }, // best score achieved today (resets daily via lastScoreDate)

  feedbackScores: {
    type: [{
      fluency: Number,
      grammar: Number,
      confidence: Number,
      vocabulary: Number,
      points: { type: Number, default: null },
      date: { type: Date, default: Date.now },
    }],
    default: [],
  },

  // ── Payment ──────────────────────────────────────────────────────────────
  // paid: true = user has an active subscription, false = payment required
  // Set to true by admin manually, or automatically after Razorpay verification
  paid: { type: Boolean, default: false },
  // Razorpay order/payment IDs for audit trail
  razorpayOrderId:   { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  paidAt:            { type: Date,   default: null },

  // Legacy fields — kept for DB compatibility, no longer used in business logic
  fine: { type: Number, default: 0 },
  weeklyFine: { type: Number, default: 0 },
});

userSchema.index({ phone: 1 });

export default mongoose.model("User", userSchema);
