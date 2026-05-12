import express from "express";
import PDFDocument from "pdfkit";
import { body } from "express-validator";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { protect, authorize } from "../middleware/auth.js";
import { handleValidation } from "../utils/validation.js";
import { emitStockUpdate } from "../utils/socket.js";
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

router.post(
  "/",
  protect,
  authorize("salesman", "admin"),
  [body("productId").isMongoId(), body("quantity").isInt({ min: 1 })],
  handleValidation,
  async (req, res, next) => {
    try {
      const { productId, quantity } = req.body;

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }
      const sourceCurrency = getRecordCurrency(product.currency);
      const productPrice = toAppCurrency(product.price, sourceCurrency);
      if (product.quantity < quantity) {
        return res.status(400).json({ message: "Insufficient stock quantity." });
      }

      product.quantity -= quantity;
      await product.save();

      const totalPrice = Number((productPrice * quantity).toFixed(2));
      const sale = await Sale.create({
        product_id: product._id,
        product_name: product.name,
        quantity,
        unit_price: productPrice,
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
