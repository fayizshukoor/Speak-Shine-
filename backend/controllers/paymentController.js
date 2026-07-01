/**
 * Payment Controller
 * Handles Razorpay order creation, signature verification, admin paid toggle,
 * and transaction history for users and admins.
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../../models/userSchema.js";
import Transaction from "../../models/transactionSchema.js";
import Auth from "../../models/authSchema.js";
import { escapeRegex } from "../utils/phoneUtils.js";

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials not configured");
  }
  return new Razorpay({ key_id, key_secret });
}

// Helper: find user by phone (handles both plain and WhatsApp formats)
async function findUserByPhone(phone) {
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.findOne({
      userId: { $regex: `^${escapeRegex(phone)}(@|:)` },
    });
  }
  return user;
}

/**
 * POST /api/payments/create-order
 */
export async function createOrder(req, res) {
  try {
    const razorpay = getRazorpay();

    const amountINR = Number(req.body.amount) || 499;
    const amountPaise = Math.round(amountINR * 100);

    if (amountPaise < 100) {
      return res.status(400).json({ error: "Amount must be at least ₹1 (100 paise)" });
    }

    const shortId = String(req.user.id).slice(-8);
    const shortTs = String(Date.now()).slice(-8);
    const receipt = `r_${shortId}_${shortTs}`;

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
    const razorpayMsg = err?.error?.description || err?.message || "Failed to create payment order";
    console.error("[Payment] create-order error:", razorpayMsg, err?.error || "");
    res.status(500).json({ error: razorpayMsg });
  }
}

/**
 * POST /api/payments/verify
 */
export async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return res.status(500).json({ error: "Razorpay not configured" });

    // Verify signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", key_secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.warn("[Payment] Signature mismatch for order:", razorpay_order_id);

      // Log failed transaction
      await Transaction.create({
        phone: req.user.phone || "unknown",
        name:  req.user.name  || null,
        razorpayOrderId:   razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount: 0,
        status: "failed",
        source: "razorpay",
      }).catch(() => {});

      return res.status(400).json({ error: "Payment verification failed — signature mismatch" });
    }

    // Find user — use phone from auth context, fall back to Auth DB lookup by JWT id
    let phone = req.user.phone;
    const authId = req.user.id;

    console.log(`[Payment] Verify - phone: ${phone}, authId: ${authId}, orderId: ${razorpay_order_id}`);

    let user = null;

    if (phone) {
      user = await findUserByPhone(phone);
    }

    // Fallback: resolve phone from Auth document using JWT id
    if (!user && authId) {
      const Auth = (await import("../../models/authSchema.js")).default;
      const auth = await Auth.findById(authId).select("phone name").lean();
      if (auth?.phone) {
        console.log(`[Payment] Resolved phone from Auth doc: ${auth.phone}`);
        phone = auth.phone;
        req.user.phone = auth.phone;
        req.user.name  = req.user.name || auth.name;
        user = await findUserByPhone(phone);
      }
    }

    if (!user) {
      console.error(`[Payment] ❌ User not found — phone: ${phone}, authId: ${authId}`);
      return res.status(404).json({ error: "User record not found. Please contact support." });
    }

    // Fetch amount from Razorpay order for accurate logging
    let amountINR = 0;
    try {
      const rzp = getRazorpay();
      const orderDetails = await rzp.orders.fetch(razorpay_order_id);
      amountINR = orderDetails.amount / 100;
    } catch { /* non-critical */ }

    // Mark user paid
    user.paid = true;
    user.razorpayOrderId   = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.paidAt = new Date();
    await user.save();

    // Log successful transaction
    await Transaction.create({
      phone,
      name:  req.user.name || user.name || null,
      userId: user.userId || null,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amountINR,
      status: "success",
      source: "razorpay",
    });

    console.log(`[Payment] ✅ Payment verified & logged: ${phone} ₹${amountINR}`);
    res.json({ success: true, message: "Payment successful! Access granted." });
  } catch (err) {
    console.error("[Payment] verify error:", err.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
}

/**
 * PATCH /api/payments/admin/toggle-paid/:phone
 */
export async function adminTogglePaid(req, res) {
  try {
    const { phone } = req.params;
    const { note } = req.body;

    const user = await findUserByPhone(phone);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.paid = !user.paid;
    if (user.paid && !user.paidAt) {
      user.paidAt = new Date();
    }
    await user.save();

    // Log admin manual transaction
    if (user.paid) {
      await Transaction.create({
        phone,
        name:   user.name || null,
        userId: user.userId || null,
        amount: 0,
        status: "manual",
        source: "admin",
        note:   note || `Manually activated by admin`,
      });
    }

    console.log(`[Payment] Admin toggled paid=${user.paid} for ${phone}`);
    res.json({ success: true, paid: user.paid });
  } catch (err) {
    console.error("[Payment] admin toggle-paid error:", err.message);
    res.status(500).json({ error: "Failed to toggle payment status" });
  }
}

/**
 * GET /api/payments/my-transactions
 * Returns the logged-in user's payment history
 */
export async function getMyTransactions(req, res) {
  try {
    let phone = req.user.phone;

    // Fallback: resolve phone from Auth doc if missing from token context
    if (!phone && req.user.id) {
      const Auth = (await import("../../models/authSchema.js")).default;
      const auth = await Auth.findById(req.user.id).select("phone").lean();
      phone = auth?.phone || null;
    }

    if (!phone) return res.status(400).json({ error: "Cannot resolve user phone" });

    const transactions = await Transaction.find({ phone })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Also get current paid status from user doc
    const user = await findUserByPhone(phone);

    res.json({
      transactions,
      paid:      user?.paid      ?? false,
      paidAt:    user?.paidAt    ?? null,
      paymentId: user?.razorpayPaymentId ?? null,
    });
  } catch (err) {
    console.error("[Payment] my-transactions error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

/**
 * GET /api/payments/admin/all
 * Returns all transactions for admin dashboard
 */
export async function adminGetAllTransactions(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1"));
    const limit = Math.min(100, parseInt(req.query.limit || "50"));
    const skip  = (page - 1) * limit;
    const status = req.query.status; // filter by status

    const filter = status ? { status } : {};

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);

    // Revenue stats
    const stats = await Transaction.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    const totalRevenue = stats[0]?.total ?? 0;
    const totalPaid    = stats[0]?.count ?? 0;
    const totalManual  = await Transaction.countDocuments({ status: "manual" });

    res.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: { totalRevenue, totalPaid, totalManual },
    });
  } catch (err) {
    console.error("[Payment] admin-all error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}
