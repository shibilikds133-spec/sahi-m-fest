import { databaseProvider } from '../../providers/database';

export const superRepository = {
  getSuperAdminStats() {
    return databaseProvider.getSuperAdminStats();
  },

  listGlobalOrganisations<T>() {
    return databaseProvider.listGlobalOrganisations<T>();
  },

  createGlobalOrganisation<T>(payload: Record<string, unknown>) {
    return databaseProvider.createGlobalOrganisation<T>(payload);
  },

  deleteGlobalOrganisation(id: string) {
    return databaseProvider.deleteGlobalOrganisation(id);
  },

  listTenantAccounts<T>() {
    return databaseProvider.listTenantAccounts<T>();
  },

  revokeTenantAccess(orgId: string) {
    return databaseProvider.revokeTenantAccess(orgId);
  },

  setupTenantRecords(payload: Record<string, unknown>) {
    return databaseProvider.setupTenantRecords(payload);
  }
};
