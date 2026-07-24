import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleService } from '../../services/scheduleService';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../config/supabase';

export const useSchedule = () => {
  const { tenant_id } = useAuthStore();
  const queryClient = useQueryClient();

  // Venues
  const venuesQuery = useQuery({
    queryKey: ['venues', tenant_id],
    queryFn: () => scheduleService.listVenues<any>(tenant_id!),
    enabled: !!tenant_id,
  });

  const createVenueMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => scheduleService.createVenue<any>(tenant_id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  const updateVenueMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => scheduleService.updateVenue<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  const deleteVenueMutation = useMutation({
    mutationFn: (id: string) => scheduleService.deleteVenue(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues', tenant_id] }),
  });

  // Schedules
  const schedulesQuery = useQuery({
    queryKey: ['schedules', tenant_id],
    queryFn: () => scheduleService.listSchedules<any>(tenant_id!),
    enabled: !!tenant_id,
  });

  const createScheduleMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => scheduleService.createSchedule<any>(tenant_id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => scheduleService.updateSchedule<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => scheduleService.deleteSchedule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules', tenant_id] }),
  });

  return {
    venues: venuesQuery.data || [],
    isLoadingVenues: venuesQuery.isLoading,
    createVenue: createVenueMutation.mutateAsync,
    isCreatingVenue: createVenueMutation.isPending,
    updateVenue: updateVenueMutation.mutateAsync,
    isUpdatingVenue: updateVenueMutation.isPending,
    deleteVenue: deleteVenueMutation.mutateAsync,
    isDeletingVenue: deleteVenueMutation.isPending,

    schedules: schedulesQuery.data || [],
    isLoadingSchedules: schedulesQuery.isLoading,
    createSchedule: createScheduleMutation.mutateAsync,
    isCreatingSchedule: createScheduleMutation.isPending,
    updateSchedule: updateScheduleMutation.mutateAsync,
    isUpdatingSchedule: updateScheduleMutation.isPending,
    deleteSchedule: deleteScheduleMutation.mutateAsync,
    isDeletingSchedule: deleteScheduleMutation.isPending,
  };
};

export const usePublicSchedule = (festivalId?: string | null) => {
  return useQuery({
    queryKey: ['public-schedules', festivalId],
    queryFn: async () => {
      if (!festivalId) return [];
      const { data, error } = await supabase
        .from('schedules')
        .select('*, venues(*), items(*)')
        .eq('festival_id', festivalId)
        .order('start_time');
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!festivalId,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};

export const usePublicRegistrations = (festivalId?: string | null) => {
  return useQuery({
    queryKey: ['public-registrations', festivalId],
    queryFn: async () => {
      if (!festivalId) return [];
      const { data, error } = await supabase
        .from('registrations')
        .select('id, item_id, status, is_verified, code_letter')
        .eq('festival_id', festivalId);
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!festivalId,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
};

