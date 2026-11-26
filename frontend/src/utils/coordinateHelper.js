const STORAGE_KEY = 'inclinox_coord_format';

/**
 * Get persisted coordinate display format ('DD' | 'DMS')
 */
export function getStoredCoordFormat() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === 'DMS' ? 'DMS' : 'DD';
  } catch {
    return 'DD';
  }
}

/**
 * Persist coordinate display format ('DD' | 'DMS')
 */
export function setStoredCoordFormat(fmt) {
  try {
    localStorage.setItem(STORAGE_KEY, fmt === 'DMS' ? 'DMS' : 'DD');
  } catch {
    // ignore storage errors
  }
}

/**
 * Convert Decimal Degrees (DD) to Degrees, Minutes, Seconds (DMS) object.
 * @param {number|string} decimal
 * @param {boolean} isLat - true for Latitude (N/S), false for Longitude (E/W)
 * @returns {{ deg: string, min: string, sec: string, dir: string }}
 */
export function ddToDms(decimal, isLat = true) {
  const num = parseFloat(decimal);
  if (isNaN(num)) {
    return { deg: '', min: '', sec: '', dir: isLat ? 'N' : 'E' };
  }

  const dir = isLat ? (num >= 0 ? 'N' : 'S') : (num >= 0 ? 'E' : 'W');
  const abs = Math.abs(num);
  let deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  let min = Math.floor(minFloat);
  let sec = (minFloat - min) * 60;

  // Handle rounding overflow (e.g. 59.9999" -> 60.00")
  if (sec >= 59.995) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min = 0;
    deg += 1;
  }

  return {
    deg: String(deg),
    min: String(min),
    sec: sec.toFixed(2),
    dir,
  };
}

/**
 * Convert Degrees, Minutes, Seconds (DMS) object to Decimal Degrees (DD).
 * Returns '' if all numeric fields are empty, otherwise a number rounded to 6 decimals.
 * @param {{ deg: string|number, min: string|number, sec: string|number, dir: string }} dms
 * @returns {number|string}
 */
export function dmsToDd({ deg, min, sec, dir }) {
  const hasAny =
    (deg !== '' && deg !== null && deg !== undefined) ||
    (min !== '' && min !== null && min !== undefined) ||
    (sec !== '' && sec !== null && sec !== undefined);

  if (!hasAny) return '';

  const d = parseFloat(deg) || 0;
  const m = parseFloat(min) || 0;
  const s = parseFloat(sec) || 0;

  const absVal = Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600;
  const sign = dir === 'S' || dir === 'W' ? -1 : 1;
  return parseFloat((sign * absVal).toFixed(6));
}

/**
 * Format a single coordinate value in DD or DMS.
 */
export function formatCoordinate(val, isLat = true, format = 'DD', decimals = 4) {
  const num = parseFloat(val);
  if (isNaN(num)) return '--';

  if (format === 'DMS') {
    const { deg, min, sec, dir } = ddToDms(num, isLat);
    return `${deg}° ${min}' ${sec}" ${dir}`;
  }

  return `${num.toFixed(decimals)}°`;
}

/**
 * Format a latitude/longitude pair in DD or DMS.
 */
export function formatLatLngPair(lat, lng, format = 'DD', decimals = 4) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return '--';

  if (format === 'DMS') {
    return `${formatCoordinate(latNum, true, 'DMS')}, ${formatCoordinate(lngNum, false, 'DMS')}`;
  }

  return `${latNum.toFixed(decimals)}°, ${lngNum.toFixed(decimals)}°`;
}
