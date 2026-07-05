import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayCategory: { type: String, default: null },
  todayContentType: { type: String, enum: ["question", "story_audio"], default: "question" },
  todayAudioUrl: { type: String, default: null },
  todayStoryTranscript: { type: String, default: null },
  todaySummaryGuide: { type: String, default: null },
  todayPosterImage: { type: String, default: null },
  posterExpiresAt: { type: Date, default: null },
  recentCategories: { type: [String], default: [] },
  // Daily vocabulary words (configurable count, related to today's question)
  todayVocabulary: {
    type: [{
      word:    { type: String, required: true },
      meaning: { type: String, required: true },
      example: { type: String, required: true },
    }],
    default: [],
  },
  // Vocabulary challenge settings (admin-configurable)
  vocabWordCount: { type: Number, default: 3, min: 1, max: 10 }, // how many words per day
  vocabLevel: { type: String, default: "B2", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] }, // CEFR level
  // Story Summary settings (admin-configurable)
  storyWordCount: { type: Number, default: 200, min: 100, max: 400 },
  usedStoryThemes: { type: [String], default: [] },
  storyLevel: { type: String, default: "B1", enum: ["A2", "B1", "B2", "C1"] },
  // Which day of the week auto-story runs (0=Sun, 1=Mon, ... 6=Sat). Default: 6 (Saturday)
  storyDay: { type: Number, default: 6, min: 0, max: 6 },
  // Monthly reflection
  isMonthlyReflectionDay: { type: Boolean, default: false },
  isMonthlyGoalsDay: { type: Boolean, default: false },
  isWeeklyReflectionDay: { type: Boolean, default: false },
  isStorySummaryDay: { type: Boolean, default: false },
  // Daily report tracking
  dailyReportGenerated: { type: Boolean, default: false },
  reportExpiresAt: { type: Date, default: null },
  // Configurable schedule times (HH:MM, 24h, IST)
  posterSendTime: { type: String, default: "08:00" },
  questionGenerateTime: { type: String, default: "07:00" },
  // Track last successful daily reset (YYYY-MM-DD in IST) to detect missed resets
  lastResetDate: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
