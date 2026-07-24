import { databaseProvider } from '../../providers/database';

export const judgeRepository = {
  async listJudges<T>(tenantId: string) {
    return databaseProvider.listJudges<T>(tenantId);
  },
  async createJudge<T>(payload: Record<string, unknown>) {
    return databaseProvider.createJudge<T>(payload);
  },
  async updateJudge<T>(id: string, payload: Record<string, unknown>) {
    return databaseProvider.updateJudge<T>(id, payload);
  },
  async deleteJudge(id: string) {
    return databaseProvider.deleteJudge(id);
  },
  async assignJudgesToSchedule(scheduleId: string, judgeIds: string[]) {
    return databaseProvider.assignJudgesToSchedule(scheduleId, judgeIds);
  },
  async getScheduleJudges<T>(scheduleId: string) {
    return databaseProvider.getScheduleJudges<T>(scheduleId);
  },
  async getRegistrationsBySchedule<T>(scheduleId: string) {
    return databaseProvider.getRegistrationsBySchedule<T>(scheduleId);
  },
  async listMarkEntries<T>(scheduleId: string) {
    return databaseProvider.listMarkEntries<T>(scheduleId);
  },
  async upsertMarkEntry<T>(payload: Record<string, unknown>) {
    return databaseProvider.upsertMarkEntry<T>(payload);
  },
  async finalizeMarkEntry(markEntryId: string) {
    return databaseProvider.finalizeMarkEntry(markEntryId);
  },
  async listResults<T>(scheduleId: string) {
    return databaseProvider.listResults<T>(scheduleId);
  },
  async publishResults(payloads: Record<string, unknown>[]) {
    return databaseProvider.publishResults(payloads);
  },
  async getJudgeSubmissionSummary<T>(scheduleId: string) {
    return databaseProvider.getJudgeSubmissionSummary<T>(scheduleId);
  },
  async getScheduleReadiness<T>(scheduleId: string) {
    return databaseProvider.getScheduleReadiness<T>(scheduleId);
  },
};
