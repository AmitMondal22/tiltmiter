// Multi-Tenant Isolation & Security Scope Guard Middleware
export function tenantScopeGuard() {
  return async (req, reply) => {
    const user = req.user;
    if (!user) return;

    // Super Admin has full platform clearance across all tenants
    if (user.role === 'SUPER_ADMIN') {
      req.tenantFilter = {};
      return;
    }

    // Organization boundary scope for ORG_ADMIN and subordinate roles
    const filter = {};
    if (user.organizationId) {
      filter.organizationId = user.organizationId;
    }

    // Project boundary scope for PROJECT_ADMIN / PROJECT_MANAGER
    if (user.projectId && (user.role === 'PROJECT_ADMIN' || user.role === 'PROJECT_MANAGER')) {
      filter.projectId = user.projectId;
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

