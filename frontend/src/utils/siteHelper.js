/**
 * siteHelper.js
 * Centralized utility functions for matching structures and devices to sites.
 * Ensures strict null/undefined safety so unassigned devices (or undefined IDs)
 * are never mistakenly matched across all sites.
 */

/**
 * Filter structures that belong to a specific site.
 * @param {Object} site - The site object (with .id and optional .siteId)
 * @param {Array} structures - Array of structure objects
 * @returns {Array} Structures strictly belonging to this site
 */
export function getSiteStructures(site, structures = []) {
  if (!site || !Array.isArray(structures)) return [];
  const targetSiteId = String(site.id || site.siteId || '').trim();
  const altSiteId = site.siteId ? String(site.siteId).trim() : null;

  if (!targetSiteId && !altSiteId) return [];

  return structures.filter(st => {
    if (!st || !st.siteId) return false;
    const stSiteId = String(st.siteId).trim();
    if (targetSiteId && stSiteId === targetSiteId) return true;
    if (altSiteId && stSiteId === altSiteId) return true;
    return false;
  });
}

/**
 * Check if a specific device is assigned to a site.
 * Matches directly via device.siteId, device.Site.id, or indirectly via structureId.
 * @param {Object} device - The device object
 * @param {Object} site - The site object
 * @param {Array} siteStructures - Optional pre-filtered structures belonging to the site
 * @returns {boolean} True if device is strictly assigned to this site
 */
export function isDeviceInSite(device, site, siteStructures = null) {
  if (!device || !site) return false;
  const targetSiteId = String(site.id || site.siteId || '').trim();
  const altSiteId = site.siteId ? String(site.siteId).trim() : null;

  if (!targetSiteId && !altSiteId) return false;

  // 1. Direct device.siteId match (only if device has a non-empty siteId)
  if (device.siteId !== undefined && device.siteId !== null && String(device.siteId).trim() !== '') {
    const devSiteId = String(device.siteId).trim();
    if (targetSiteId && devSiteId === targetSiteId) return true;
    if (altSiteId && devSiteId === altSiteId) return true;
  }

  // 2. Direct device.Site match (only if device.Site object has a real id)
  if (device.Site?.id !== undefined && device.Site?.id !== null && String(device.Site.id).trim() !== '') {
    const devSiteObjId = String(device.Site.id).trim();
    if (targetSiteId && devSiteObjId === targetSiteId) return true;
    if (altSiteId && devSiteObjId === altSiteId) return true;
  }
  if (device.Site?.siteId !== undefined && device.Site?.siteId !== null && String(device.Site.siteId).trim() !== '') {
    const devSiteObjSiteId = String(device.Site.siteId).trim();
    if (targetSiteId && devSiteObjSiteId === targetSiteId) return true;
    if (altSiteId && devSiteObjSiteId === altSiteId) return true;
  }

  // 3. Match via structure (only if device has a non-empty structureId)
  if (device.structureId !== undefined && device.structureId !== null && String(device.structureId).trim() !== '') {
    const devStructId = String(device.structureId).trim();
    if (Array.isArray(siteStructures) && siteStructures.length > 0) {
      if (siteStructures.some(st => st?.id && String(st.id).trim() === devStructId)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter all devices that belong to a given site.
 * @param {Object} site - The site object
 * @param {Array} devices - Array of all devices
 * @param {Array} structures - Array of all structures (or pre-filtered site structures)
 * @returns {Array} Devices strictly assigned to this site
 */
export function getSiteDevices(site, devices = [], structures = []) {
  if (!site || !Array.isArray(devices)) return [];
  // If structures is already filtered, getSiteStructures will return it or filter properly
  const siteStructures = getSiteStructures(site, structures);
  return devices.filter(d => isDeviceInSite(d, site, siteStructures));
}

