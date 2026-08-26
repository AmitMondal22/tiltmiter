/**
 * Centralized Date & Time Utility Functions for Performance and Consistent Display
 */

// Format Date object to `YYYY-MM-DDTHH:mm` for datetime-local input fields
export const formatLocalDatetime = (d) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
};

// Format timestamp into localized readable string: "25 Aug 2026, 03:45:12 PM"
export const formatFullDateTime = (ts) => {
  if (!ts) return new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  try {
    const dateObj = new Date(ts);
    return isNaN(dateObj.getTime())
      ? String(ts)
      : dateObj.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch (e) {
    return String(ts);
  }
};

// Format timestamp into clean local time string: "03:45:12 PM"
export const formatTimeString = (ts) => {
  if (!ts) return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  try {
    const dateObj = new Date(ts);
    return isNaN(dateObj.getTime())
      ? String(ts)
      : dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch (e) {
    return String(ts);
  }
};
