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
  getMyTransactions,
  adminGetAllTransactions,
} from "../controllers/paymentController.js";

const router = express.Router();

// ── User endpoints ────────────────────────────────────────────────────────────
router.post("/create-order", authMiddleware, createOrder);
router.post("/verify",       authMiddleware, verifyPayment);
router.get("/my-transactions", authMiddleware, getMyTransactions);

// ── Admin endpoints ───────────────────────────────────────────────────────────
router.patch("/admin/toggle-paid/:phone", authMiddleware, requireRole("admin"), adminTogglePaid);
router.get("/admin/all",                  authMiddleware, requireRole("admin", "viewer"), adminGetAllTransactions);

export default router;
