import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { festivalSettingsService } from '../../services/festivalSettingsService';
import { useAuthStore } from '../store/authStore';

type FestivalCalendarRecord = {
  id: string;
  tenant_id: string;
  festival_year: number;
  level: string;
  custom_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_open?: string | null;
  registration_close?: string | null;
  is_active: boolean;
};

type PointsConfigRecord = {
  id: string;
  tenant_id: string;
  festival_id: string;
  rank_1_points: number;
  rank_2_points: number;
  rank_3_points: number;
  ind_a_plus_points: number;
  ind_a_points: number;
  ind_b_points: number;
  ind_c_points: number;
  grp_a_plus_points: number;
  grp_a_points: number;
  grp_b_points: number;
  grp_c_points: number;
  less_than_3_teams_rule: boolean;
};

export const useFestival = () => {
  const { tenant_id } = useAuthStore();
  const queryClient = useQueryClient();

  // 1. Fetch active festival for the current tenant
  const useActiveFestival = () => {
    return useQuery({
      queryKey: ['active-festival', tenant_id],
      queryFn: async () => {
        if (!tenant_id) return null;
        return festivalSettingsService.getActiveFestival<FestivalCalendarRecord>(tenant_id);
      },
      enabled: !!tenant_id,
    });
  };

  // 2. Fetch Points Configuration
  const usePointsConfig = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['points-config', festivalId],
      queryFn: async () => {
        if (!festivalId) return null;
        return festivalSettingsService.getPointsConfig<PointsConfigRecord>(festivalId);
      },
      enabled: !!festivalId,
    });
  };

  // 3. Mutation: Upsert Points Config
  const useUpdatePoints = () => {
    return useMutation({
      mutationFn: async (payload: any) => {
        if (!tenant_id) throw new Error('Tenant is required to update points configuration');
        return festivalSettingsService.updatePointsConfig<PointsConfigRecord>(tenant_id, payload);
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['points-config', data.festival_id] });
      },
    });
  };

  // 4. Mutation: Update Festival Dates
  const useUpdateFestival = () => {
    return useMutation({
      mutationFn: async (payload: any) => {
        if (!tenant_id) throw new Error('Tenant is required to update festival configuration');
        return festivalSettingsService.updateFestival<FestivalCalendarRecord>(tenant_id, payload);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['active-festival', tenant_id] });
      },
    });
  };

  // 5. Fetch Active Items from DB
  const useActiveItems = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['active-items', festivalId],
      queryFn: async () => {
        if (!festivalId) return [];
        return festivalSettingsService.getActiveItemCodes(festivalId);
      },
      enabled: !!festivalId,
    });
  };

  // 6. Fetch Items from DB
  const useItems = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['items', festivalId],
      queryFn: async () => {
        if (!festivalId) return [];
        return festivalSettingsService.getItems<any>(festivalId);
      },
      enabled: !!festivalId,
    });
  };

  // 7. Mutation: Sync Active Items
  const useUpdateActiveItems = (festivalId: string | undefined) => {
    return useMutation({
      mutationFn: async ({ selectedCodes, itemRecords }: { selectedCodes: string[], itemRecords?: any[] }) => {
        if (!festivalId || !tenant_id) return;
        await festivalSettingsService.updateActiveItemCodes(festivalId, tenant_id, selectedCodes, itemRecords);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['active-items', festivalId] });
      },
    });
  };

  return {
    useActiveFestival,
    usePointsConfig,
    useUpdatePoints,
    useUpdateFestival,
    useActiveItems,
    useItems,
    useUpdateActiveItems,
  };
};
