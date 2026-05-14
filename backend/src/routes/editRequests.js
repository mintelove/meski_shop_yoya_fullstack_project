import express from "express";
import { EditRequest } from "../models/EditRequest.js";
import { Sale } from "../models/Sale.js";
import { Product } from "../models/Product.js";
import { protect, authorize } from "../middleware/auth.js";
import { emitStockUpdate } from "../utils/socket.js";

const router = express.Router();

// Salesman: submit an edit request (cashback or price_change)
router.post("/", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const { transactionId, type, reason, newPrice } = req.body;

    if (!transactionId || !type || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: "Transaction ID, type, and reason are required." });
    }
    if (!["cashback", "price_change"].includes(type)) {
      return res.status(400).json({ success: false, message: "Type must be 'cashback' or 'price_change'." });
    }
    if (type === "price_change" && (!newPrice || Number(newPrice) <= 0)) {
      return res.status(400).json({ success: false, message: "New price is required for price change requests." });
    }

    const sale = await Sale.findById(transactionId);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }

    // Only the transaction owner can request
    if (String(sale.salesman_id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only request edits for your own transactions." });
    }

    if (sale.status !== "active") {
      return res.status(400).json({ success: false, message: "Transaction is already returned/reversed." });
    }

    // Check if operation already used
    if (sale.operationUsed) {
      return res.status(403).json({ success: false, message: "Action already used for this transaction." });
    }

    // PRICE VALIDATION: newPrice must be >= current selling price
    if (type === "price_change") {
      if (Number(newPrice) < sale.unit_price) {
        return res.status(400).json({
          success: false,
          message: "New price must be greater than or equal to the current selling price"
        });
      }
    }

    // Check for existing pending request of same type
    const existing = await EditRequest.findOne({
      transaction_id: transactionId,
      salesman_id: req.user._id,
      status: "pending"
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "You already have a pending request for this transaction." });
    }

    const editReq = await EditRequest.create({
      transaction_id: transactionId,
      salesman_id: req.user._id,
      type,
      reason: reason.trim(),
      newPrice: type === "price_change" ? Number(newPrice) : undefined
    });

    // Lock the transaction — operationUsed = true on request submission
    sale.operationUsed = true;
    await sale.save();

    emitStockUpdate({ type: "request-created", saleId: sale._id });

    return res.status(201).json({ success: true, editRequest: editReq });
  } catch (error) {
    return next(error);
  }
});

// Admin: get all edit requests
router.get("/", protect, authorize("admin"), async (req, res, next) => {
  try {
    const requests = await EditRequest.find()
      .sort({ createdAt: -1 })
      .populate("salesman_id", "name email")
      .populate("transaction_id", "product_name product_id quantity unit_price purchased_price total_price status createdAt");

    return res.json(requests);
  } catch (error) {
    return next(error);
  }
});

// Salesman: get own requests
router.get("/mine", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const requests = await EditRequest.find({ salesman_id: req.user._id })
      .sort({ createdAt: -1 })
      .populate("transaction_id", "product_name quantity unit_price total_price status createdAt");

    return res.json(requests);
  } catch (error) {
    return next(error);
  }
});

// Admin: approve or reject
router.patch("/:id", protect, authorize("admin"), async (req, res, next) => {
  try {
    const { status, admin_note } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'." });
    }

    const editReq = await EditRequest.findById(req.params.id);
    if (!editReq) {
      return res.status(404).json({ success: false, message: "Edit request not found." });
    }
    if (editReq.status !== "pending") {
      return res.status(400).json({ success: false, message: "This request has already been reviewed." });
    }

    // If approving, apply the action
    if (status === "approved") {
      const sale = await Sale.findById(editReq.transaction_id);
      if (!sale) {
        return res.status(404).json({ success: false, message: "Transaction not found." });
      }

      if (editReq.type === "cashback") {
        // Reverse the transaction: restore stock
        if (sale.status === "active") {
          const product = await Product.findById(sale.product_id);
          if (product) {
            product.quantity += sale.quantity;
            await product.save();
          }
          sale.status = "returned";
          sale.adminMessage = "";
          await sale.save();

          emitStockUpdate({ type: "sale-returned", saleId: sale._id, productId: sale.product_id });
        }
      } else if (editReq.type === "price_change") {
        // Update price
        if (sale.status === "active" && editReq.newPrice) {
          sale.unit_price = editReq.newPrice;
          sale.total_price = Number((sale.unit_price * sale.quantity).toFixed(2));
          sale.adminMessage = "";
          await sale.save();

          emitStockUpdate({ type: "sale-edited", saleId: sale._id });
        }
      }
    } else {
      // REJECTED: set adminMessage on the transaction
      const sale = await Sale.findById(editReq.transaction_id);
      if (sale) {
        sale.adminMessage = "Rejected by admin";
        await sale.save();
        emitStockUpdate({ type: "request-rejected", saleId: sale._id });
      }
    }

    editReq.status = status;
    editReq.admin_note = admin_note || "";
    editReq.reviewed_by = req.user._id;
    editReq.reviewed_at = new Date();
    await editReq.save();

    return res.json({ success: true, editRequest: editReq });
  } catch (error) {
    return next(error);
  }
});

export default router;
