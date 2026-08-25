// Multi-Tenant Isolation & Security Scope Guard Middleware
export function tenantScopeGuard() {
  return async (req, reply) => {
    const user = req.user;
    if (!user) return; // If unauthenticated route, let authMiddleware handle it

    // Super Admin has full platform clearance across all tenants
    if (user.role === 'SUPER_ADMIN') {
      req.tenantFilter = {};
      return;
    }

    // Tenant boundary scope
    const filter = {};
    if (user.partnerId) {
      filter.partnerId = user.partnerId;
    }
    if (user.organizationId) {
      filter.organizationId = user.organizationId;
    }

    // Site / Device level permission scoping
    if (user.scopeType === 'SELECTED_SITES' && Array.isArray(user.allowedSiteIds) && user.allowedSiteIds.length > 0) {
      filter.siteId = user.allowedSiteIds;
    } else if (user.siteId && (user.role === 'SITE_ADMIN' || user.role === 'SITE_USER')) {
      filter.siteId = user.siteId;
    }

    req.tenantFilter = filter;
  };
}
