/**
 * Centralized Date & Time Utility Functions for Indian Standard Time (IST - UTC+05:30)
 * Ensures device data stored in UTC is consistently filtered, converted, and displayed in IST across all tables, charts, and pickers.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

// Safe Date parser
const toValidDate = (d) => {
  if (!d) return new Date();
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return isNaN(dateObj?.getTime?.()) ? new Date() : dateObj;
};

/**
 * Format timestamp into localized IST readable string: "09 Sep 2026, 10:15:30 AM"
 */
export const formatFullDateTime = (ts) => {
  if (!ts) {
    return new Date().toLocaleString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
  try {
    const dateObj = new Date(ts);
    if (isNaN(dateObj.getTime())) return String(ts);
    return dateObj.toLocaleString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return String(ts);
  }
};

/**
 * Format timestamp into clean IST time string: "10:15:30 AM"
 */
export const formatTimeString = (ts) => {
  if (!ts) {
    return new Date().toLocaleTimeString('en-IN', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
  try {
    const dateObj = new Date(ts);
    if (isNaN(dateObj.getTime())) return String(ts);
    return dateObj.toLocaleTimeString('en-IN', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return String(ts);
  }
};

/**
 * Format timestamp into clean IST date string: "09 Sep 2026"
 */
export const formatISTDate = (ts) => {
  if (!ts) {
    return new Date().toLocaleDateString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  try {
    const dateObj = new Date(ts);
    if (isNaN(dateObj.getTime())) return String(ts);
    return dateObj.toLocaleDateString('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return String(ts);
  }
};

/**
 * Format Date object / UTC ISO to `YYYY-MM-DDTHH:mm` in IST for `<input type="datetime-local">` fields
 */
export const formatISTDatetimeLocal = (d) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (!dateObj || isNaN(dateObj.getTime?.())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(dateObj);
    const getVal = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${getVal('year')}-${getVal('month')}-${getVal('day')}T${getVal('hour')}:${getVal('minute')}`;
  } catch (e) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  }
};

// Backwards-compatible alias
export const formatLocalDatetime = formatISTDatetimeLocal;

/**
 * Format Date object / UTC ISO to `YYYY-MM-DD` in IST for `<input type="date">` fields
 */
export const formatISTDateInput = (d) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (!dateObj || isNaN(dateObj.getTime?.())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(dateObj);
    const getVal = (type) => parts.find((p) => p.type === type)?.value || '00';
    return `${getVal('year')}-${getVal('month')}-${getVal('day')}`;
  } catch (e) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
  }
};

/**
 * Convert an IST user input datetime string from frontend picker to standard UTC ISO string for backend query
 * Handles:
 *  - "YYYY-MM-DDTHH:mm" -> interpreted as IST, converted to UTC ISO
 *  - "YYYY-MM-DD" (start of day) -> "YYYY-MM-DD 00:00:00 IST", converted to UTC ISO
 *  - "YYYY-MM-DD" (end of day) -> "YYYY-MM-DD 23:59:59.999 IST", converted to UTC ISO
 */
export const istDatetimeToUTC = (istStr, isEndOfDay = false) => {
  if (!istStr) return null;
  const str = String(istStr).trim();

  try {
    // If it is already an ISO string with Z or explicit offset (+05:30), parse directly
    if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
      return new Date(str).toISOString();
    }

    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const timePart = isEndOfDay ? '23:59:59.999' : '00:00:00.000';
      return new Date(`${str}T${timePart}+05:30`).toISOString();
    }

    // YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
      const fullStr = str.length === 16 ? `${str}:00` : str;
      return new Date(`${fullStr}+05:30`).toISOString();
    }

    // Fallback
    return new Date(str).toISOString();
  } catch (e) {
    return null;
  }
};
