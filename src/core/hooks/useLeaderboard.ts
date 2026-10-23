import { useQuery } from '@tanstack/react-query';
import { leaderboardService } from '../../services/leaderboardService';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { useParticipantProfileUpdates } from './useParticipantProfileUpdates';

export const usePublicLeaderboard = (
  tenantId?: string | null,
  festivalId?: string | null,
  enabled = true,
) => {
  useParticipantProfileUpdates(enabled ? festivalId : null);
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, festivalId),
    queryFn: () => leaderboardService.listPublicLeaderboard(tenantId, festivalId),
    enabled: enabled && !!tenantId && !!festivalId,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};

export const useLeaderboardPreview = (
  tenantId?: string | null,
  festivalId?: string | null,
  rankingMode?: string,
  itemLimit?: number | null,
  enabled = true,
) => {
  useParticipantProfileUpdates(enabled ? festivalId : null);
  return useQuery({
    queryKey: ['leaderboard-preview', tenantId, festivalId, rankingMode, itemLimit],
    queryFn: () => leaderboardService.getLeaderboardPreview(tenantId, festivalId, rankingMode, itemLimit, true),
    enabled: enabled && !!tenantId && !!festivalId,
  });
};

export const usePublicPublishedResults = (
  tenantId?: string | null,
  festivalId?: string | null,
  enabled = true,
  includeParticipantDetails = true,
) => {
  useParticipantProfileUpdates(enabled ? festivalId : null);
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, festivalId, includeParticipantDetails),
    queryFn: () => leaderboardService.listPublicPublishedResults(tenantId, festivalId, includeParticipantDetails),
    enabled,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};
