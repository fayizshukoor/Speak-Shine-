import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: { type: String, default: null },
  phone: { type: String, default: null },   // e.g. "8848096746" — auto-saved on first login
  fine: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
  weeklySubmissions: { type: Number, default: 0 },
  weeklyFine: { type: Number, default: 0 },
  monthlySubmissions: { type: Number, default: 0 },
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
});

userSchema.index({ phone: 1 });

export default mongoose.model("User", userSchema);