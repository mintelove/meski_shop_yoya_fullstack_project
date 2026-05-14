import express from "express";
import PDFDocument from "pdfkit";
import { body } from "express-validator";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";
import { emitStockUpdate } from "../utils/socket.js";
import { EditRequest } from "../models/EditRequest.js";
import { APP_CURRENCY, getRecordCurrency, toAppCurrency } from "../utils/currency.js";
import { buildDateFilter, getDateLabel } from "../utils/dateFilterUtil.js";

const router = express.Router();

router.get("/", protect, async (req, res, next) => {
  try {
    const roleQuery = req.user.role === "admin" ? {} : { salesman_id: req.user._id };
    const dateFilter = buildDateFilter(req.query);
    const query = { ...roleQuery, ...dateFilter };

    const sales = await Sale.find(query).sort({ createdAt: -1 }).populate("salesman_id", "name email");
    const normalizedSales = sales.map((sale) => {
      const sourceCurrency = getRecordCurrency(sale.currency);
      if (sourceCurrency === APP_CURRENCY) return sale;
      const data = sale.toObject();
      data.unit_price = toAppCurrency(data.unit_price, sourceCurrency);
      data.total_price = toAppCurrency(data.total_price, sourceCurrency);
      data.currency = APP_CURRENCY;
      return data;
    });

    // Compute summary metrics from the normalized (currency-converted) sales
    let totalItemsSold = 0;
    let totalSalesAmount = 0;
    for (const sale of normalizedSales) {
      totalItemsSold += sale.quantity || 0;
      totalSalesAmount += (sale.total_price ?? sale.toObject?.()?.total_price) || 0;
    }
    // Handle both Mongoose docs and plain objects for total_price
    totalSalesAmount = normalizedSales.reduce((sum, s) => {
      const price = typeof s.total_price === "number" ? s.total_price : (s.toObject?.()?.total_price || 0);
      return sum + price;
    }, 0);

    return res.json({
      sales: normalizedSales,
      summary: {
        totalItemsSold,
        totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
        totalTransactions: normalizedSales.length
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/export/csv", protect, async (req, res, next) => {
  try {
    const roleQuery = req.user.role === "admin" ? {} : { salesman_id: req.user._id };
    const dateFilter = buildDateFilter(req.query);
    const query = { ...roleQuery, ...dateFilter };

    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .populate("salesman_id", "name email");

    const dateLabel = getDateLabel(req.query);
    const shopName = "Yoya Kids Collection By Meski";
    const salesmanName = req.user.name;

    const metadata = [
      `Shop Name,${shopName}`,
      `Salesman,${salesmanName}`,
      `Filter Range,${dateLabel}`,
      ""
    ];

    const header = "Date,Product,Quantity,Unit Price,Total Price,Currency,Salesman";
    const rows = sales.map((sale) => {
      const sourceCurrency = getRecordCurrency(sale.currency);
      const unitPrice = sourceCurrency === APP_CURRENCY ? sale.unit_price : toAppCurrency(sale.unit_price, sourceCurrency);
      const totalPrice = sourceCurrency === APP_CURRENCY ? sale.total_price : toAppCurrency(sale.total_price, sourceCurrency);
      const date = new Date(sale.createdAt).toISOString().slice(0, 10);
      const productName = `"${(sale.product_name || "").replace(/"/g, '""')}"`;
      const salesman = `"${(sale.salesman_id?.name || "N/A").replace(/"/g, '""')}"`;
      return `${date},${productName},${sale.quantity},${unitPrice.toFixed(2)},${totalPrice.toFixed(2)},${APP_CURRENCY},${salesman}`;
    });

    const csv = [...metadata, header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

router.get("/export/pdf", protect, async (req, res, next) => {
  try {
    const roleQuery = req.user.role === "admin" ? {} : { salesman_id: req.user._id };
    const dateFilter = buildDateFilter(req.query);
    const query = { ...roleQuery, ...dateFilter };

    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .populate("salesman_id", "name email");

    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const filename = `sales_report_${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).text("Yoya Kids Collection By Meski", { align: "center" });
    doc.fontSize(12).moveDown();
    doc.text(`Salesman: ${req.user.name}`);
    doc.text(`Report Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Filter Period: ${getDateLabel(req.query)}`);
    doc.moveDown();

    // Summary (Calculated from filtered data)
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total_price || 0), 0);
    const totalItems = sales.reduce((sum, s) => sum + (s.quantity || 0), 0);
    doc.fontSize(14).text("Summary", { underline: true });
    doc.fontSize(12).text(`Total Transactions: ${sales.length}`);
    doc.text(`Total Items Sold: ${totalItems}`);
    doc.text(`Total Revenue: ${formatCurrencyManual(totalRevenue)}`);
    doc.moveDown();

    // Table
    doc.fontSize(14).text("Transaction History", { underline: true });
    doc.moveDown(0.5);

    // Table Headers
    const tableTop = doc.y;
    const itemX = 30;
    const qtyX = 250;
    const priceX = 320;
    const totalX = 400;
    const salesmanX = 480;

    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Date", itemX, tableTop);
    doc.text("Product", itemX + 60, tableTop);
    doc.text("Qty", qtyX, tableTop);
    doc.text("Price", priceX, tableTop);
    doc.text("Total", totalX, tableTop);
    doc.text("Salesman", salesmanX, tableTop);

    doc.moveTo(30, tableTop + 15).lineTo(565, tableTop + 15).stroke();
    doc.font("Helvetica").fontSize(9);

    let currentY = tableTop + 25;
    sales.forEach((sale) => {
      if (currentY > 750) {
        doc.addPage();
        currentY = 50;
      }
      const dateStr = new Date(sale.createdAt).toISOString().slice(0, 10);
      doc.text(dateStr, itemX, currentY);
      doc.text(sale.product_name, itemX + 60, currentY, { width: 150 });
      doc.text(sale.quantity.toString(), qtyX, currentY);
      doc.text(sale.unit_price.toFixed(2), priceX, currentY);
      doc.text(sale.total_price.toFixed(2), totalX, currentY);
      doc.text(sale.salesman_id?.name || "N/A", salesmanX, currentY, { width: 80 });
      currentY += 20;
    });

    doc.end();
  } catch (error) {
    return next(error);
  }
});

function formatCurrencyManual(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ETB"
  }).format(amount);
}

router.get("/export-csv", protect, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const query = req.user.role === "admin" ? {} : { salesman_id: req.user._id };

    if (from || to) {
      query.createdAt = {};
      if (from) {
        const startDate = new Date(from);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .populate("salesman_id", "name email");

    const header = "Date,Product,Quantity,Unit Price,Total Price,Currency,Salesman";
    const rows = sales.map((sale) => {
      const sourceCurrency = getRecordCurrency(sale.currency);
      const unitPrice = sourceCurrency === APP_CURRENCY ? sale.unit_price : toAppCurrency(sale.unit_price, sourceCurrency);
      const totalPrice = sourceCurrency === APP_CURRENCY ? sale.total_price : toAppCurrency(sale.total_price, sourceCurrency);
      const date = new Date(sale.createdAt).toISOString().slice(0, 10);
      const productName = `"${(sale.product_name || "").replace(/"/g, '""')}"`;
      const salesman = `"${(sale.salesman_id?.name || "N/A").replace(/"/g, '""')}"`;
      return `${date},${productName},${sale.quantity},${unitPrice.toFixed(2)},${totalPrice.toFixed(2)},${APP_CURRENCY},${salesman}`;
    });

    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=sales_export.csv");
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

// ─── Profit Tracking ──────────────────────────────────────────────────────────
// Shared helper: build profit data from sales (role-based)
async function buildProfitData(query, user) {
  // Role-based filtering: salesman sees only own transactions
  if (user && user.role === "salesman") {
    query.salesman_id = user._id;
  }

  const sales = await Sale.find(query)
    .sort({ createdAt: -1 })
    .populate("salesman_id", "name email");

  const transactions = sales.map((sale) => {
    const s = sale.toObject ? sale.toObject() : sale;
    const purchasedPrice = s.purchased_price || 0;
    const sellingPrice = s.unit_price || 0;
    const qty = s.quantity || 0;
    const txStatus = s.status || "active";
    // Only calculate profit for active transactions
    const profit = txStatus === "active"
      ? Number(((sellingPrice - purchasedPrice) * qty).toFixed(2))
      : 0;
    return {
      _id: s._id,
      product_name: s.product_name,
      product_id: s.product_id,
      quantity: qty,
      sellingPrice,
      purchasedPrice,
      profit,
      total_price: s.total_price,
      salesman: s.salesman_id?.name || "N/A",
      salesman_id: s.salesman_id?._id || s.salesman_id,
      date: s.createdAt,
      editedOnce: !!s.editedOnce,
      status: txStatus,
      adminMessage: s.adminMessage || ""
    };
  });

  const productMap = {};
  for (const tx of transactions) {
    const key = String(tx.product_id);
    if (!productMap[key]) {
      productMap[key] = { product_name: tx.product_name, totalQuantity: 0, totalProfit: 0 };
    }
    productMap[key].totalQuantity += tx.quantity;
    productMap[key].totalProfit += tx.profit;
  }
  const byProduct = Object.values(productMap).map((p) => ({
    ...p,
    totalProfit: Number(p.totalProfit.toFixed(2))
  }));

  const totalProfit = Number(
    transactions.reduce((sum, tx) => sum + tx.profit, 0).toFixed(2)
  );

  return { transactions, byProduct, totalProfit };
}

// Profit CSV Export
router.get("/purchases/export/csv", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const profitData = await buildProfitData({ ...dateFilter }, req.user);
    const dateLabel = getDateLabel(req.query);
    const shopName = "Yoya Kids Collection By Meski";

    const metadata = [
      `Shop Name,${shopName}`,
      `Salesman,${req.user.name}`,
      `Filter Range,${dateLabel}`,
      `Total Profit,${profitData.totalProfit.toFixed(2)}`,
      ""
    ];

    const productHeader = "--- Profit Per Product ---";
    const productColHeader = "Product Name,Total Qty Sold,Total Profit";
    const productRows = profitData.byProduct.map((p) =>
      `"${p.product_name.replace(/"/g, '""')}",${p.totalQuantity},${p.totalProfit.toFixed(2)}`
    );

    const txHeader = "--- All Transactions ---";
    const txColHeader = "Date,Product Name,Quantity,Selling Price,Purchased Price,Profit,Salesman";
    const txRows = profitData.transactions.map((tx) => {
      const date = new Date(tx.date).toISOString().slice(0, 10);
      const productName = `"${(tx.product_name || "").replace(/"/g, '""')}"`;
      const salesman = `"${(tx.salesman || "N/A").replace(/"/g, '""')}"`;
      return `${date},${productName},${tx.quantity},${tx.sellingPrice.toFixed(2)},${tx.purchasedPrice.toFixed(2)},${tx.profit.toFixed(2)},${salesman}`;
    });

    const csv = [
      ...metadata,
      productHeader, productColHeader, ...productRows,
      "",
      txHeader, txColHeader, ...txRows
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=profit_report_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

// Profit PDF Export
router.get("/purchases/export/pdf", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const profitData = await buildProfitData({ ...dateFilter }, req.user);
    const dateLabel = getDateLabel(req.query);
    const shopName = "Yoya Kids Collection By Meski";

    const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });
    const filename = `profit_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    const PAGE_W = 565;     // usable width (612 - 2*margin ~30)
    const LEFT = 30;
    const MAX_Y = 760;

    // ── Helper: draw one row of cells ──
    // cols = [{ x, w, align }], vals = [string, ...], rowY, rowH
    function drawRow(cols, vals, rowY) {
      cols.forEach((col, idx) => {
        doc.text(
          vals[idx] || "",
          col.x + 4,
          rowY + 4,
          { width: col.w - 8, align: col.align || "left", lineBreak: false }
        );
      });
    }

    // ── Helper: calculate row height based on content wrapping ──
    function calcRowHeight(cols, vals, fontSize) {
      doc.fontSize(fontSize);
      let maxH = 18;
      cols.forEach((col, idx) => {
        const h = doc.heightOfString(vals[idx] || "", { width: col.w - 8 });
        if (h + 8 > maxH) maxH = h + 8;
      });
      return maxH;
    }

    // ══════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════
    doc.rect(0, 0, 612, 80).fill("#11998e");
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
      .text(shopName, 0, 28, { align: "center", lineBreak: false });
    doc.fontSize(10).text("Profit Report", 0, 54, { align: "center", lineBreak: false });

    // Report Details
    doc.fillColor("#334155").font("Helvetica").fontSize(9)
      .text(`Generated: ${new Date().toLocaleString()}`, LEFT, 90, { align: "right", width: PAGE_W, lineBreak: false });

    let y = 110;
    doc.fillColor("#1e293b").fontSize(11).font("Helvetica-Bold")
      .text("REPORT DETAILS", LEFT, y, { lineBreak: false });
    y += 18;
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(`Salesman: ${req.user.name}`, LEFT, y, { lineBreak: false });
    y += 15;
    doc.text(`Filter Period: ${dateLabel}`, LEFT, y, { lineBreak: false });
    y += 25;

    // ── Overall Profit Box ──
    doc.rect(LEFT, y, PAGE_W, 36).fill("#f0fdf4");
    doc.rect(LEFT, y, PAGE_W, 36).strokeColor("#bbf7d0").lineWidth(1).stroke();
    doc.fillColor("#065f46").fontSize(11).font("Helvetica-Bold")
      .text("TOTAL PROFIT", LEFT + 12, y + 11, { lineBreak: false });
    doc.fillColor("#059669").fontSize(16).font("Helvetica-Bold")
      .text(formatCurrencyManual(profitData.totalProfit), LEFT + 12, y + 9, { width: PAGE_W - 24, align: "right", lineBreak: false });
    y += 50;

    // ══════════════════════════════════════════════════════════════
    // TABLE 1: Profit Per Product
    // ══════════════════════════════════════════════════════════════
    doc.fillColor("#1e293b").fontSize(12).font("Helvetica-Bold")
      .text("Profit Per Product", LEFT, y, { lineBreak: false });
    y += 20;

    const pCols = [
      { x: LEFT,       w: 280, align: "left" },
      { x: LEFT + 280, w: 120, align: "center" },
      { x: LEFT + 400, w: 165, align: "right" }
    ];
    const pHeaders = ["Product Name", "Total Qty Sold", "Total Profit"];

    // Header row
    doc.rect(LEFT, y, PAGE_W, 22).fill("#047857");
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    drawRow(pCols, pHeaders, y);
    y += 22;

    // Data rows
    doc.font("Helvetica").fontSize(9);
    profitData.byProduct.forEach((p, i) => {
      const vals = [p.product_name, p.totalQuantity.toString(), p.totalProfit.toFixed(2)];
      const rh = calcRowHeight(pCols, vals, 9);

      if (y + rh > MAX_Y) { doc.addPage(); y = 40; }

      // Striped background
      if (i % 2 === 0) doc.rect(LEFT, y, PAGE_W, rh).fill("#f1f5f9");
      else doc.rect(LEFT, y, PAGE_W, rh).fill("#ffffff");

      doc.fillColor("#334155").fontSize(9).font("Helvetica");
      drawRow(pCols, vals, y, rh);
      y += rh;
    });

    if (profitData.byProduct.length === 0) {
      doc.fillColor("#94a3b8").text("No data available.", LEFT + 10, y + 5, { lineBreak: false });
      y += 22;
    }

    // Bottom line
    doc.moveTo(LEFT, y).lineTo(LEFT + PAGE_W, y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
    y += 30;

    // ══════════════════════════════════════════════════════════════
    // TABLE 2: All Transactions
    // ══════════════════════════════════════════════════════════════
    if (y + 60 > MAX_Y) { doc.addPage(); y = 40; }

    doc.fillColor("#1e293b").fontSize(12).font("Helvetica-Bold")
      .text("Transaction Details", LEFT, y, { lineBreak: false });
    y += 20;

    const tCols = [
      { x: LEFT,       w: 68,  align: "left" },   // Date
      { x: LEFT + 68,  w: 130, align: "left" },   // Product
      { x: LEFT + 198, w: 38,  align: "center" }, // Qty
      { x: LEFT + 236, w: 72,  align: "right" },  // Sell Price
      { x: LEFT + 308, w: 72,  align: "right" },  // Purch Price
      { x: LEFT + 380, w: 72,  align: "right" },  // Profit
      { x: LEFT + 452, w: 113, align: "right" }   // Salesman
    ];
    const tHeaders = ["Date", "Product", "Qty", "Sell Price", "Purch Price", "Profit", "Salesman"];

    // Helper to draw the transaction table header
    function drawTxHeader(atY) {
      doc.rect(LEFT, atY, PAGE_W, 22).fill("#1e293b");
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
      drawRow(tCols, tHeaders, atY, 22);
      return atY + 22;
    }

    y = drawTxHeader(y);

    // Data rows
    doc.font("Helvetica").fontSize(8);
    profitData.transactions.forEach((tx, i) => {
      const dateStr = new Date(tx.date).toISOString().slice(0, 10);
      const vals = [
        dateStr,
        tx.product_name,
        tx.quantity.toString(),
        tx.sellingPrice.toFixed(2),
        tx.purchasedPrice.toFixed(2),
        tx.profit.toFixed(2),
        tx.salesman
      ];
      const rh = calcRowHeight(tCols, vals, 8);

      if (y + rh > MAX_Y) {
        doc.addPage();
        y = 40;
        y = drawTxHeader(y);
        doc.font("Helvetica").fontSize(8);
      }

      // Striped background
      if (i % 2 === 0) doc.rect(LEFT, y, PAGE_W, rh).fill("#f8fafc");
      else doc.rect(LEFT, y, PAGE_W, rh).fill("#ffffff");

      doc.fillColor("#334155").fontSize(8).font("Helvetica");
      drawRow(tCols, vals, y, rh);
      y += rh;
    });

    if (profitData.transactions.length === 0) {
      doc.fillColor("#94a3b8").text("No transactions found.", LEFT + 10, y + 5, { lineBreak: false });
    }

    // ── Footer on every page ──
    const range = doc.bufferedPageRange();
    for (let pg = 0; pg < range.count; pg++) {
      doc.switchToPage(pg);
      doc.fillColor("#94a3b8").fontSize(8).font("Helvetica")
        .text(
          `Generated by Shop Management System  •  Page ${pg + 1} of ${range.count}`,
          0, 810, { align: "center", lineBreak: false }
        );
    }

    doc.end();
  } catch (error) {
    return next(error);
  }
});

// Profit JSON endpoint (main data for frontend)
router.get("/purchases", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const profitData = await buildProfitData({ ...dateFilter }, req.user);
    return res.json(profitData);
  } catch (error) {
    return next(error);
  }
});

// ─── Return Items to Stock (1-hour limit for salesman) ────────────────────────
router.post("/:id/return", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }
    if (sale.status !== "active") {
      return res.status(400).json({ success: false, message: "Transaction is already returned/reversed." });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = String(sale.salesman_id) === String(req.user._id);

    if (!isAdmin) {
      if (!isOwner) {
        return res.status(403).json({ success: false, message: "You can only return your own transactions." });
      }
      if (sale.editedOnce) {
        return res.status(403).json({ success: false, message: "You have already edited this transaction." });
      }
      const diffMs = Date.now() - new Date(sale.createdAt).getTime();
      if (diffMs > 60 * 60 * 1000) {
        return res.status(403).json({ success: false, message: "Return time expired. Submit a cashback request instead.", editExpired: true });
      }
    }

    // Restore stock
    const product = await Product.findById(sale.product_id);
    if (product) {
      product.quantity += sale.quantity;
      await product.save();
    }

    sale.status = "returned";
    sale.editedOnce = true;
    await sale.save();

    emitStockUpdate({ type: "sale-returned", saleId: sale._id, productId: sale.product_id });

    return res.json({ success: true, message: "Items returned to stock.", sale });
  } catch (error) {
    return next(error);
  }
});

// ─── Edit Transaction Price (1-hour, once, salesman) ──────────────────────────
router.put("/:id", protect, authorize("salesman", "admin"), async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Transaction not found." });
    }

    if (sale.status !== "active") {
      return res.status(400).json({ success: false, message: "Cannot edit a returned/reversed transaction." });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = String(sale.salesman_id) === String(req.user._id);

    if (!isAdmin) {
      // Salesman: must own the transaction
      if (!isOwner) {
        return res.status(403).json({ success: false, message: "You can only edit your own transactions." });
      }

      // Salesman: check if already edited once
      if (sale.editedOnce) {
        return res.status(403).json({
          success: false,
          message: "You have already edited this transaction once.",
          editedOnce: true
        });
      }

      // Salesman: check 1-hour window
      const diffMs = Date.now() - new Date(sale.createdAt).getTime();
      const ONE_HOUR = 60 * 60 * 1000;

      if (diffMs > ONE_HOUR) {
        // Check if there's an approved edit request
        const approved = await EditRequest.findOne({
          transaction_id: sale._id,
          salesman_id: req.user._id,
          status: "approved"
        });

        if (!approved) {
          return res.status(403).json({
            success: false,
            message: "Edit time expired. Only admin can edit this transaction.",
            editExpired: true
          });
        }

        // Consume the approval (mark as used)
        approved.status = "rejected";
        approved.admin_note = (approved.admin_note || "") + " [Used]";
        await approved.save();
      }
    }

    // Apply edits
    const { quantity, sellingPrice } = req.body;
    const oldQuantity = sale.quantity;

    if (quantity !== undefined) {
      const newQty = Number(quantity);
      if (isNaN(newQty) || newQty < 1) {
        return res.status(400).json({ success: false, message: "Quantity must be at least 1." });
      }
      // Adjust product stock
      const product = await Product.findById(sale.product_id);
      if (product) {
        const diff = newQty - oldQuantity;
        if (diff > 0 && product.quantity < diff) {
          return res.status(400).json({ success: false, message: "Insufficient stock for this edit." });
        }
        product.quantity -= diff;
        await product.save();
      }
      sale.quantity = newQty;
    }

    if (sellingPrice !== undefined) {
      const newPrice = Number(sellingPrice);
      if (isNaN(newPrice) || newPrice <= 0) {
        return res.status(400).json({ success: false, message: "Selling price must be a positive number." });
      }
      // Price must be >= current selling price
      if (newPrice < sale.unit_price) {
        return res.status(400).json({ success: false, message: "Invalid price" });
      }
      sale.unit_price = newPrice;
    }

    sale.total_price = Number((sale.unit_price * sale.quantity).toFixed(2));

    // Mark as edited for salesman (one-time edit rule)
    if (!isAdmin) {
      sale.editedOnce = true;
    }

    await sale.save();

    emitStockUpdate({ type: "sale-edited", saleId: sale._id });

    return res.json({ success: true, sale });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/",
  protect,
  authorize("salesman", "admin"),
  [
    body("productId").isMongoId(),
    body("quantity").isInt({ min: 1 }),
    body("sellingPrice").isFloat({ min: 0.01 }).withMessage("Selling price is required and must be a valid positive number")
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId, quantity, sellingPrice } = req.body;

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: "Product not found." });
      }

      const sourceCurrency = getRecordCurrency(product.currency);
      const minSellingPrice = product.minSellingPrice
        ? toAppCurrency(product.minSellingPrice, sourceCurrency)
        : 0;

      const parsedSellingPrice = Number(sellingPrice);
      if (isNaN(parsedSellingPrice) || parsedSellingPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Selling price must be a valid positive number"
        });
      }
      // SECURITY: Enforce selling price >= minimum selling price set by admin
      if (minSellingPrice > 0 && parsedSellingPrice < minSellingPrice) {
        return res.status(400).json({
          success: false,
          message: "Selling price cannot be lower than minimum selling price"
        });
      }

      if (product.quantity < quantity) {
        return res.status(400).json({ success: false, message: "Insufficient stock quantity." });
      }

      product.quantity -= quantity;
      await product.save();

      const totalPrice = Number((parsedSellingPrice * quantity).toFixed(2));
      // Snapshot the purchased price from the product for profit tracking
      const purchasedPriceSnapshot = product.purchasedPrice
        ? toAppCurrency(product.purchasedPrice, sourceCurrency)
        : 0;
      const sale = await Sale.create({
        product_id: product._id,
        product_name: product.name,
        quantity,
        unit_price: parsedSellingPrice,
        purchased_price: purchasedPriceSnapshot,
        total_price: totalPrice,
        currency: APP_CURRENCY,
        salesman_id: req.user._id
      });

      emitStockUpdate({
        type: "sale-created",
        productId: product._id,
        remainingQuantity: product.quantity,
        sale
      });

      return res.status(201).json(sale);
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
