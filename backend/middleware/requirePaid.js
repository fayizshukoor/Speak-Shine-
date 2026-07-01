/**
 * requirePaid middleware
 * Blocks access to protected routes if the user has not paid.
 * Admin and trainer roles bypass the payment gate.
 */

import User from "../../models/userSchema.js";
import { escapeRegex } from "../utils/phoneUtils.js";

export async function requirePaid(req, res, next) {
  const role = req.user?.role;

  // Admins and trainers always bypass payment gate
  if (role === "admin" || role === "trainer" || role === "viewer") {
    return next();
  }

  const phone = req.user?.phone;
  if (!phone) {
    return res.status(403).json({
      error: "Payment required to access this feature",
      code: "PAYMENT_REQUIRED",
    });
  }

  try {
    let user = await User.findOne({ phone }).select("paid").lean();
    if (!user) {
      user = await User.findOne({
        userId: { $regex: `^${escapeRegex(phone)}(@|:)` },
      }).select("paid").lean();
    }

    if (!user || !user.paid) {
      return res.status(403).json({
        error: "Payment required to access this feature",
        code: "PAYMENT_REQUIRED",
      });
    }

    next();
  } catch (err) {
    console.error("[requirePaid] DB error:", err.message);
    // Fail closed — if DB is down, block access
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}
