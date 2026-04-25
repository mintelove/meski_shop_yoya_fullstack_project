import express from "express";
import mongoose from "mongoose";
import { body } from "express-validator";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";
import { User } from "../models/User.js";
import { ResetAudit } from "../models/ResetAudit.js";

const router = express.Router();

const PRESERVED_COLLECTIONS = new Set(["users", "resetaudits"]);

router.post(
  "/reset-database",
  protect,
  authorize("admin"),
  [body("password").isString().notEmpty(), body("confirmation").equals("RESET")],
  handleValidation,
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const admin = await User.findById(req.user._id);

      if (!admin) {
        return res.status(401).json({ message: "Unauthorized. User not found." });
      }

      const isPasswordValid = await admin.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Incorrect password." });
      }

      const collectionNames = Object.keys(mongoose.connection.collections || {});
      const targetCollections = collectionNames.filter((name) => !PRESERVED_COLLECTIONS.has(name));

      await Promise.all(targetCollections.map((name) => mongoose.connection.collections[name].deleteMany({})));

      await ResetAudit.create({
        adminId: admin._id,
        adminEmail: admin.email,
        clearedCollections: targetCollections
      });

      return res.json({
        message: "Database reset completed successfully.",
        clearedCollections: targetCollections
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
