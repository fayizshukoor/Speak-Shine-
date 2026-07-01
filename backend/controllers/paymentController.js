/**
 * Payment Controller
 * Handles Razorpay order creation, signature verification, and admin paid toggle
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../../models/userSchema.js";
import { escapeRegex } from "../utils/phoneUtils.js";

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials not configured");
  }
  return new Razorpay({ key_id, key_secret });
}

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order. Amount must be in INR (we convert to paise).
 */
export async function createOrder(req, res) {
  try {
    const razorpay = getRazorpay();

    // Amount in INR from request body, default 499 INR
    const amountINR = Number(req.body.amount) || 499;
    const amountPaise = Math.round(amountINR * 100); // convert to paise

    if (amountPaise < 100) {
      return res.status(400).json({ error: "Amount must be at least ₹1 (100 paise)" });
    }

    // receipt max 40 chars — use short hash of user id + truncated timestamp
    const shortId = String(req.user.id).slice(-8);
    const shortTs = String(Date.now()).slice(-8);
    const receipt = `r_${shortId}_${shortTs}`; // max ~20 chars

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
    });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    // Surface Razorpay's own error message (e.g. bad credentials, invalid amount)
    const razorpayMsg = err?.error?.description || err?.message || "Failed to create payment order";
    console.error("[Payment] create-order error:", razorpayMsg, err?.error || "");
    res.status(500).json({ error: razorpayMsg });
  }
}

/**
 * POST /api/payments/verify
 * Verifies Razorpay payment signature. If valid, marks the user as paid.
 */
export async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return res.status(500).json({ error: "Razorpay not configured" });
    }

    // HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", key_secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.warn("[Payment] Signature mismatch for order:", razorpay_order_id);
      return res.status(400).json({ error: "Payment verification failed — signature mismatch" });
    }

    // Signature valid — mark user as paid
    // Find user by phone from auth context
    const phone = req.user.phone;
    if (!phone) {
      return res.status(400).json({ error: "Cannot resolve user phone" });
    }

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.findOne({
        userId: { $regex: `^${escapeRegex(phone)}(@|:)` },
      });
    }

    if (!user) {
      return res.status(404).json({ error: "User record not found" });
    }

    user.paid = true;
    user.razorpayOrderId = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.paidAt = new Date();
    await user.save();

    console.log(`[Payment] ✅ Payment verified & user marked paid: ${phone}`);
    res.json({ success: true, message: "Payment successful! Access granted." });
  } catch (err) {
    console.error("[Payment] verify error:", err.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
}

/**
 * PATCH /api/payments/admin/toggle-paid/:phone
 * Admin can manually toggle a user's paid status.
 */
export async function adminTogglePaid(req, res) {
  try {
    const { phone } = req.params;

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.findOne({
        userId: { $regex: `^${escapeRegex(phone)}(@|:)` },
      });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.paid = !user.paid;
    if (user.paid && !user.paidAt) {
      user.paidAt = new Date(); // record when admin manually activated
    }
    await user.save();

    console.log(`[Payment] Admin toggled paid=${user.paid} for ${phone}`);
    res.json({ success: true, paid: user.paid });
  } catch (err) {
    console.error("[Payment] admin toggle-paid error:", err.message);
    res.status(500).json({ error: "Failed to toggle payment status" });
  }
}
