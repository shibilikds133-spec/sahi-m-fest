import { useQuery } from '@tanstack/react-query';
import { leaderboardService } from '../../services/leaderboardService';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';

export const usePublicLeaderboard = (tenantId?: string | null, festivalId?: string | null) => {
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboard(tenantId, festivalId),
    queryFn: () => leaderboardService.listPublicLeaderboard(tenantId, festivalId),
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};

export const usePublicPublishedResults = (
  tenantId?: string | null,
  festivalId?: string | null,
  enabled = true,
  includeParticipantDetails = true,
) => {
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicPublishedResults(tenantId, festivalId, includeParticipantDetails),
    queryFn: () => leaderboardService.listPublicPublishedResults(tenantId, festivalId, includeParticipantDetails),
    enabled,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};
