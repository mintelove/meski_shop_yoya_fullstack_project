import mongoose from "mongoose";

const editRequestSchema = new mongoose.Schema(
  {
    transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
    salesman_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["cashback", "price_change"], required: true },
    reason: { type: String, required: true },
    newPrice: { type: Number },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    admin_note: { type: String, default: "" },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewed_at: { type: Date }
  },
  { timestamps: true }
);

export const EditRequest = mongoose.model("EditRequest", editRequestSchema);
