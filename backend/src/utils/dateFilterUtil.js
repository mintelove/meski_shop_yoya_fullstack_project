/**
 * Date filter utilities for MongoDB query construction.
 * Provides consistent date parsing and filtering across all endpoints.
 */

/**
 * Parse a date string and return a Date object, or null if invalid.
 */
export const parseDateInput = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

/**
 * Validate date query parameters and return an array of error messages.
 * Returns null if all params are valid.
 */
export const validateDateParams = (query) => {
  const errors = [];
  const { date, startDate, endDate } = query;

  if (date) {
    const parsed = parseDateInput(date);
    if (!parsed) errors.push("Invalid date parameter. Use YYYY-MM-DD format.");
  }

  if (startDate) {
    const parsed = parseDateInput(startDate);
    if (!parsed) errors.push("Invalid startDate parameter. Use YYYY-MM-DD format.");
  }

  if (endDate) {
    const parsed = parseDateInput(endDate);
    if (!parsed) errors.push("Invalid endDate parameter. Use YYYY-MM-DD format.");
  }

  if (startDate && endDate) {
    const start = parseDateInput(startDate);
    const end = parseDateInput(endDate);
    if (start && end && end < start) {
      errors.push("endDate cannot be earlier than startDate.");
    }
  }

  return errors.length > 0 ? errors : null;
};

/**
 * Build a MongoDB createdAt filter from query parameters.
 *
 * Supports:
 *   - Single date: ?date=YYYY-MM-DD
 *   - Date range:  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   - Legacy range: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns an object like { createdAt: { $gte: ..., $lte: ... } }
 * or {} if no date filters are provided.
 */
export const buildDateFilter = (query) => {
  const { date, startDate, endDate, from, to } = query;

  // Single date mode
  if (date) {
    const parsed = parseDateInput(date);
    if (parsed) {
      const dayStart = new Date(parsed);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(parsed);
      dayEnd.setHours(23, 59, 59, 999);
      return { createdAt: { $gte: dayStart, $lte: dayEnd } };
    }
  }

  // Range mode (new-style params)
  if (startDate || endDate) {
    const filter = {};
    if (startDate) {
      const start = parseDateInput(startDate);
      if (start) {
        start.setHours(0, 0, 0, 0);
        filter.$gte = start;
      }
    }
    if (endDate) {
      const end = parseDateInput(endDate);
      if (end) {
        end.setHours(23, 59, 59, 999);
        filter.$lte = end;
      }
    }
    if (Object.keys(filter).length > 0) {
      return { createdAt: filter };
    }
  }

  // Legacy range mode (from/to)
  if (from || to) {
    const filter = {};
    if (from) {
      const start = parseDateInput(from);
      if (start) {
        start.setHours(0, 0, 0, 0);
        filter.$gte = start;
      }
    }
    if (to) {
      const end = parseDateInput(to);
      if (end) {
        end.setHours(23, 59, 59, 999);
        filter.$lte = end;
      }
    }
    if (Object.keys(filter).length > 0) {
      return { createdAt: filter };
    }
  }

  return {};
};

/**
 * Build a date range object for internal use (start/end dates).
 * Used by the dashboard trend data function.
 */
export const toDateRange = ({ singleDate, startDate, endDate }) => {
  if (singleDate) {
    const start = new Date(singleDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (!startDate && !endDate) return null;

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (start) start.setHours(0, 0, 0, 0);
  if (end) {
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
};

/**
 * Get a human-readable label for the active date filter.
 */
export const getDateLabel = (query) => {
  const { date, startDate, endDate, from, to } = query;
  if (date) return date;
  const effectiveStart = startDate || from;
  const effectiveEnd = endDate || to;
  if (effectiveStart && effectiveEnd) return `${effectiveStart} to ${effectiveEnd}`;
  if (effectiveStart) return `From ${effectiveStart}`;
  if (effectiveEnd) return `Until ${effectiveEnd}`;
  return "All Time";
};
