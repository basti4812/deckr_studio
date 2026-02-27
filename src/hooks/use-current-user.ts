import { useTenantContext } from '@/providers/tenant-provider'

/**
 * Hook to access the current user and tenant data.
 * Must be used inside a TenantProvider.
 *
 * Exposes all fields from the TenantProvider context:
 * - tenantId, tenantName, logoUrl, primaryColor, defaultLanguage
 * - userId, role, displayName, preferredLanguage, isAdmin
 * - loading, error, refresh
 */
export function useCurrentUser() {
  return useTenantContext()
}
