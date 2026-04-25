import express from "express";
import jwt from "jsonwebtoken";
import { body } from "express-validator";
import { User } from "../models/User.js";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d"
  });

router.post(
  "/login",
  [body("email").isEmail(), body("password").isLength({ min: 6 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive. Contact admin." });
      }

      const token = signToken(user);
      return res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user });
});

router.post(
  "/users",
  protect,
  authorize("admin"),
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("role").isIn(["admin", "salesman"])
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password, role } = req.body;
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) {
        return res.status(409).json({ message: "Email already in use." });
      }

      const newUser = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        role,
        isActive: true
      });

      return res.status(201).json({
        message: "User created successfully",
        user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role, isActive: newUser.isActive }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/users", protect, authorize("admin"), async (req, res, next) => {
  try {
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/users/:id/status",
  protect,
  authorize("admin"),
  [body("isActive").isBoolean()],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found." });
      }
      if (targetUser.role === "admin") {
        return res.status(400).json({ message: "Admin account status cannot be changed." });
      }
      targetUser.isActive = isActive;
      targetUser.tokenVersion += 1;
      await targetUser.save();
      return res.json({
        message: "User status updated successfully.",
        user: { id: targetUser._id, name: targetUser.name, email: targetUser.email, role: targetUser.role, isActive: targetUser.isActive }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/users/:id",
  protect,
  authorize("admin"),
  [body("name").optional().notEmpty(), body("email").optional().isEmail(), body("password").optional().isLength({ min: 6 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, email, password } = req.body;
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found." });
      }

      if (email && email.toLowerCase() !== targetUser.email) {
        const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
        if (exists) {
          return res.status(409).json({ message: "Email already in use." });
        }
        targetUser.email = email.toLowerCase();
      }
      if (name) targetUser.name = name;
      if (password) {
        targetUser.password = password;
        targetUser.tokenVersion += 1;
      }

      await targetUser.save();
      return res.json({
        message: "User updated successfully.",
        user: { id: targetUser._id, name: targetUser.name, email: targetUser.email, role: targetUser.role, isActive: targetUser.isActive }
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/me",
  protect,
  [body("name").optional().notEmpty(), body("email").optional().isEmail(), body("password").optional().isLength({ min: 6 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const currentUser = await User.findById(req.user._id);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found." });
      }
      if (email && email.toLowerCase() !== currentUser.email) {
        const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: currentUser._id } });
        if (exists) {
          return res.status(409).json({ message: "Email already in use." });
        }
        currentUser.email = email.toLowerCase();
      }
      if (name) currentUser.name = name;
      if (password) {
        currentUser.password = password;
        currentUser.tokenVersion += 1;
      }
      await currentUser.save();
      return res.json({
        message: "Profile updated successfully.",
        user: { id: currentUser._id, name: currentUser.name, email: currentUser.email, role: currentUser.role, isActive: currentUser.isActive }
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
