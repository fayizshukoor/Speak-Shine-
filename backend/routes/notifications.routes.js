import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Notification from "../../models/notificationSchema.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications — fetch notifications for logged-in user
// Returns: unread ones + read ones from last 24 hours only
router.get("/", async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notifications = await Notification.find({
      recipientPhone: req.user.phone,
      $or: [
        { read: false },                          // all unread
        { read: true, createdAt: { $gte: since24h } }, // read but recent
      ],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/read — mark all as read
router.patch("/read", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientPhone: req.user.phone, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch("/:id/read", async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientPhone: req.user.phone },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

export default router;
