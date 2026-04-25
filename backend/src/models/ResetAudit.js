import mongoose from "mongoose";

const resetAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminEmail: { type: String, required: true },
    clearedCollections: [{ type: String, required: true }]
  },
  { timestamps: true }
);

export const ResetAudit = mongoose.model("ResetAudit", resetAuditSchema);
