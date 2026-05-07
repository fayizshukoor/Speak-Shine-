import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    category: String,
    topic: String,
    question: String,
    // Manual setup fields
    isManualSetup: { type: Boolean, default: false },
    setupType: { 
      type: String, 
      enum: ["regular", "weekly_reflection", "monthly_reflection", "monthly_goals"],
      default: "regular"
    },
    scheduledFor: { type: Date }, // When this question should be used
    createdBy: { type: String }, // Phone number of admin/trainer who created it
    isUsed: { type: Boolean, default: false }, // Whether this manual question has been used
  },
  { timestamps: true },
);

export default mongoose.model("Question", questionSchema);
