import mongoose from "mongoose";

/**
 * Notification Schema
 * Persists notifications so offline users see them when they next open the app.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipientPhone: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["comment", "like", "mention"],
      default: "comment",
    },
    message: {
      type: String,
      required: true,
      maxlength: 300,
    },
    /** Route the frontend should navigate to when the notification is clicked */
    url: {
      type: String,
      default: "/community",
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Compound index: fast "fetch unread for user" queries
notificationSchema.index({ recipientPhone: 1, read: 1 });

// TTL index: auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model("Notification", notificationSchema);
