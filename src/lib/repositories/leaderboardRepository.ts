import { databaseProvider } from '../../providers/database';

export const leaderboardRepository = {
  listPublicLeaderboard<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.listPublicLeaderboard<T>(tenantId, festivalId);
  },
  listPublicPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
    includeParticipantDetails = true,
  ) {
    return databaseProvider.listPublicPublishedResults<T>(tenantId, festivalId, includeParticipantDetails);
  },
  getPublicLeaderboardSettings<T>(tenantId?: string | null, festivalId?: string | null) {
    return databaseProvider.getPublicLeaderboardSettings<T>(tenantId, festivalId);
  },
};
