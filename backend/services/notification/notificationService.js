/**
 * Notification Service
 * Saves a notification to MongoDB and emits a real-time socket event
 * if the recipient is currently connected.
 */

import Notification from "../../../models/notificationSchema.js";

/**
 * Create and deliver a notification.
 *
 * @param {object} opts
 * @param {string}  opts.recipientPhone  - Phone number of the user to notify
 * @param {string}  opts.type            - Notification type ("comment" | "like" | "mention")
 * @param {string}  opts.message         - Human-readable message shown in the bell dropdown
 * @param {string}  opts.url             - Frontend route to navigate to on click
 * @param {object}  opts.io              - Socket.io server instance (req.app.get("io"))
 * @param {Map}     opts.onlineUsers     - Map<phone, socketId> of currently connected users
 */
export async function createNotification({ recipientPhone, type, message, url, io, onlineUsers }) {
  try {
    // Persist to DB so offline users see it on next login
    const notification = await Notification.create({
      recipientPhone,
      type,
      message,
      url,
    });

    // Real-time delivery: if the user is online, emit immediately
    if (io && onlineUsers) {
      const socketId = onlineUsers.get(recipientPhone);
      if (socketId) {
        io.to(socketId).emit("notification:new", {
          _id:       notification._id,
          type:      notification.type,
          message:   notification.message,
          url:       notification.url,
          read:      false,
          createdAt: notification.createdAt,
        });
      }
    }

    return notification;
  } catch (err) {
    // Notifications are non-critical — log but don't crash the comment flow
    console.error("[Notification] Failed to create notification:", err.message);
    return null;
  }
}
