import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },    // topic (broad subject)
  todayQuestion: { type: String, default: null }, // actual question asked to members
  recentCategories: { type: [String], default: [] },  // last 7 used categories (dedup window)
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
