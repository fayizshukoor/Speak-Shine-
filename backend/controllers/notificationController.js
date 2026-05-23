/**
 * Notification Controller
 * Handles HTTP requests for notification endpoints.
 */

import Notification from "../../models/notificationSchema.js";

/**
 * GET /api/notifications
 * Fetch the 30 most recent notifications for the logged-in user.
 * Returns both read and unread so the dropdown can show history.
 */
export async function getNotifications(req, res) {
  try {
    const { phone } = req.user;

    const notifications = await Notification.find({ recipientPhone: phone })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const unreadCount = notifications.filter((n) => !n.read).length;

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error("[Notifications] getNotifications error:", err.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
}

/**
 * PATCH /api/notifications/read
 * Mark ALL unread notifications as read for the logged-in user.
 */
export async function markAllRead(req, res) {
  try {
    const { phone } = req.user;

    await Notification.updateMany(
      { recipientPhone: phone, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Notifications] markAllRead error:", err.message);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
export async function markOneRead(req, res) {
  try {
    const { id } = req.params;
    const { phone } = req.user;

    // Only allow marking your own notifications
    await Notification.updateOne(
      { _id: id, recipientPhone: phone },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Notifications] markOneRead error:", err.message);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
}
