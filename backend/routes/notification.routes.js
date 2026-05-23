/**
 * Notification Routes
 * GET  /api/notifications           → fetch notifications for logged-in user
 * PATCH /api/notifications/read     → mark all as read
 * PATCH /api/notifications/:id/read → mark one as read
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  getNotifications,
  markAllRead,
  markOneRead,
} from "../controllers/notificationController.js";

const router = Router();

// All notification routes require authentication
router.use(authMiddleware);

router.get("/",            getNotifications);
router.patch("/read",      markAllRead);
router.patch("/:id/read",  markOneRead);

export default router;
