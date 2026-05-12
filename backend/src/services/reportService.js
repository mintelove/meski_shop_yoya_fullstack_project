/**
 * Report generation service — PDF and CSV export logic.
 * PDF styled with Red header + Green summary sections.
 */
import PDFDocument from "pdfkit";
import { APP_CURRENCY } from "../utils/currency.js";

// ─── Color constants ───
const RED_BG = "#C0392B";
const RED_DARK = "#922B21";
const GREEN_BG = "#27AE60";
const GREEN_LIGHT = "#E8F8F0";
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const DARK_GRAY = "#333333";
const LIGHT_GRAY = "#CCCCCC";

/**
 * Generate a PDF report as a Buffer.
 * @param {Object} options
 * @param {string} options.dateLabel - e.g. "2026-05-12" or "2026-05-01 to 2026-05-12"
 * @param {Object} options.metrics - { totalItemsSold, totalRevenue, totalTransactions }
 * @param {Array} options.salesData - [{ productName, itemsSold, totalRevenue }]
 * @param {string} options.salesmanName - logged-in user name
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generatePdfReport = ({ dateLabel, metrics, salesData, salesmanName }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks = [];
      const pageWidth = doc.page.width;
      const marginLeft = doc.page.margins.left;
      const contentWidth = pageWidth - marginLeft - doc.page.margins.right;

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ─── RED HEADER BAR ───
      const headerHeight = 80;
      doc
        .save()
        .rect(0, 0, pageWidth, headerHeight)
        .fill(RED_BG);

      // Accent stripe at the bottom of header
      doc
        .rect(0, headerHeight - 4, pageWidth, 4)
        .fill(RED_DARK);

      // Shop name in header
      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .fillColor(WHITE)
        .text("Yoya Kids Collection By Meski", marginLeft, 18, {
          width: contentWidth,
          align: "center"
        });

      // Salesman name in header
      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor(WHITE)
        .text(`Salesman: ${salesmanName || "N/A"}`, marginLeft, 48, {
          width: contentWidth,
          align: "center"
        });

      doc.restore();

      // Move cursor below header
      doc.y = headerHeight + 20;

      // ─── Report Title ───
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor(BLACK)
        .text("Sales Report", { align: "center" });

      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#666666")
        .text(`Period: ${dateLabel}`, { align: "center" });

      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: "center" });

      doc.moveDown(1);

      // ─── GREEN SUMMARY BOX ───
      const summaryBoxY = doc.y;
      const summaryBoxHeight = 80;
      doc
        .save()
        .roundedRect(marginLeft, summaryBoxY, contentWidth, summaryBoxHeight, 6)
        .fill(GREEN_LIGHT);

      // Green accent bar on the left
      doc
        .rect(marginLeft, summaryBoxY, 5, summaryBoxHeight)
        .fill(GREEN_BG);

      doc.restore();

      // Summary title
      doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .fillColor(GREEN_BG)
        .text("Summary", marginLeft + 20, summaryBoxY + 10);

      // Summary metrics inside the green box
      const summaryItems = [
        ["Total Items Sold", String(metrics.totalItemsSold || 0)],
        ["Total Revenue", `${(metrics.totalRevenue || 0).toFixed(2)} ${APP_CURRENCY}`],
        ["Total Transactions", String(metrics.totalTransactions || 0)]
      ];

      doc.fontSize(10).font("Helvetica").fillColor(DARK_GRAY);
      let summaryY = summaryBoxY + 30;
      for (const [label, value] of summaryItems) {
        doc.text(`${label}: ${value}`, marginLeft + 20, summaryY);
        summaryY += 15;
      }

      // Move below green box
      doc.y = summaryBoxY + summaryBoxHeight + 20;

      // ─── Sales Table ───
      if (salesData && salesData.length > 0) {
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .fillColor(BLACK)
          .text("Sales by Product");

        doc.moveDown(0.5);

        // Table header row with RED background
        const tableHeaderY = doc.y;
        const tableHeaderHeight = 18;
        const colWidths = [30, 200, 80, 100];
        const headers = ["#", "Product", "Qty Sold", `Revenue (${APP_CURRENCY})`];

        doc
          .save()
          .rect(marginLeft, tableHeaderY, contentWidth, tableHeaderHeight)
          .fill(RED_BG);

        doc.fontSize(9).font("Helvetica-Bold").fillColor(WHITE);
        let xPos = marginLeft + 5;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], xPos, tableHeaderY + 4, {
            width: colWidths[i],
            align: i >= 2 ? "right" : "left"
          });
          xPos += colWidths[i] + 10;
        }
        doc.restore();

        // Table rows
        doc.fontSize(9).font("Helvetica").fillColor(DARK_GRAY);
        let rowY = tableHeaderY + tableHeaderHeight + 6;

        for (let i = 0; i < salesData.length; i++) {
          const row = salesData[i];

          // Check for page overflow
          if (rowY > doc.page.height - 60) {
            doc.addPage();
            rowY = doc.page.margins.top;
          }

          // Alternating row background
          if (i % 2 === 0) {
            doc
              .save()
              .rect(marginLeft, rowY - 2, contentWidth, 16)
              .fill("#F9F9F9")
              .restore();
          }

          doc.fillColor(DARK_GRAY);
          xPos = marginLeft + 5;
          const rowData = [
            String(i + 1),
            row.productName || "Unknown",
            String(row.itemsSold || 0),
            (row.totalRevenue || 0).toFixed(2)
          ];

          for (let j = 0; j < rowData.length; j++) {
            doc.text(rowData[j], xPos, rowY, {
              width: colWidths[j],
              align: j >= 2 ? "right" : "left"
            });
            xPos += colWidths[j] + 10;
          }

          rowY += 16;
        }

        // Bottom separator
        doc
          .moveTo(marginLeft, rowY + 4)
          .lineTo(marginLeft + contentWidth, rowY + 4)
          .strokeColor(LIGHT_GRAY)
          .stroke();
      } else {
        doc.fontSize(10).font("Helvetica").fillColor(DARK_GRAY).text("No sales data available for this period.");
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a CSV report string.
 * @param {Object} options
 * @param {Array} options.salesData - full Sale documents (populated)
 * @param {string} options.dateLabel - date range label
 * @param {string} options.salesmanName - logged-in user name
 * @returns {string} CSV content
 */
export const generateCsvReport = ({ salesData, dateLabel, salesmanName }) => {
  const header = "Date,Product,Quantity,Unit Price,Total Price,Currency,Salesman";
  const rows = (salesData || []).map((sale) => {
    const date = new Date(sale.createdAt).toISOString().slice(0, 10);
    const productName = `"${(sale.product_name || "").replace(/"/g, '""')}"`;
    const salesman = `"${(sale.salesman_id?.name || "N/A").replace(/"/g, '""')}"`;
    const unitPrice = Number(sale.unit_price || 0).toFixed(2);
    const totalPrice = Number(sale.total_price || 0).toFixed(2);
    return `${date},${productName},${sale.quantity},${unitPrice},${totalPrice},${APP_CURRENCY},${salesman}`;
  });

  const metadata = [
    `Shop Name,Yoya Kids Collection By Meski`,
    `Salesman Name,${salesmanName || "N/A"}`,
    `Date Range,${dateLabel || "All Time"}`
  ].join("\n");

  // Add BOM for Excel compatibility
  const bom = "\uFEFF";
  return bom + metadata + "\n\n" + [header, ...rows].join("\n");
};
