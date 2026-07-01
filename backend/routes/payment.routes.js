/**
 * Payment Routes
 * Razorpay checkout and admin paid-status management
 */

import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  createOrder,
  verifyPayment,
  adminTogglePaid,
} from "../controllers/paymentController.js";

const router = express.Router();

// ── User-facing payment endpoints ────────────────────────────────────────────
// POST /api/payments/create-order  — create a Razorpay order
router.post("/create-order", authMiddleware, createOrder);

// POST /api/payments/verify  — verify signature & mark user paid
router.post("/verify", authMiddleware, verifyPayment);

// ── Admin endpoints ───────────────────────────────────────────────────────────
// PATCH /api/payments/admin/toggle-paid/:phone  — manually toggle paid status
router.patch(
  "/admin/toggle-paid/:phone",
  authMiddleware,
  requireRole("admin"),
  adminTogglePaid
);

export default router;
