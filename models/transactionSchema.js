import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  // User reference
  phone:      { type: String, required: true, index: true },
  name:       { type: String, default: null },
  userId:     { type: String, default: null },

  // Razorpay details
  razorpayOrderId:   { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },

  // Payment info
  amount:   { type: Number, required: true }, // in INR
  currency: { type: String, default: "INR" },
  status:   { type: String, enum: ["success", "failed", "refunded", "manual"], default: "success" },
  method:   { type: String, default: null }, // upi, card, netbanking, wallet

  // Source
  source: { type: String, enum: ["razorpay", "admin"], default: "razorpay" },
  note:   { type: String, default: null }, // admin notes

  createdAt: { type: Date, default: Date.now },
});

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ phone: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);
