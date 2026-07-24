import { databaseProvider } from '../../providers/database';

export const scheduleRepository = {
  listVenues<T>(tenantId: string) {
    return databaseProvider.listVenues<T>(tenantId);
  },

  createVenue<T>(payload: Record<string, unknown>) {
    return databaseProvider.createVenue<T>(payload);
  },

  updateVenue<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateVenue<T>(id, payload);
  },

  deleteVenue(id: string) {
    return databaseProvider.deleteVenue(id);
  },

  listSchedules<T>(tenantId: string) {
    return databaseProvider.listSchedules<T>(tenantId);
  },

  createSchedule<T>(payload: Record<string, unknown>) {
    return databaseProvider.createSchedule<T>(payload);
  },

  updateSchedule<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateSchedule<T>(id, payload);
  },

  deleteSchedule(id: string) {
    return databaseProvider.deleteSchedule(id);
  },
};
