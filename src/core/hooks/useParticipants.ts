import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { participantService, ParticipantStatus } from '../../services/participantService';
import { useAuthStore } from '../store/authStore';

export const usePublicCandidateProfile = (slug?: string | null) =>
  useQuery({
    queryKey: ['publicCandidateProfile', slug],
    queryFn: () => participantService.getPublicCandidateProfile(slug!),
    enabled: !!slug,
    staleTime: 1000 * 60 * 5,
  });

export const useParticipants = (participantId?: string) => {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['participants'],
    queryFn: () => participantService.listParticipants<any>(),
  });

  const detailQuery = useQuery({
    queryKey: ['participant', participantId],
    queryFn: () => participantService.getParticipant<any>(participantId!),
    enabled: !!participantId,
  });

  const registrationsQuery = useQuery({
    queryKey: ['participantRegistrations', participantId],
    queryFn: () => participantService.getParticipantRegistrations<any>(participantId!),
    enabled: !!participantId,
  });

  const useItemRegistrations = (itemId: string | undefined) => {
    const { tenant_id } = useAuthStore();
    return useQuery({
      queryKey: ['itemRegistrations', itemId, tenant_id],
      queryFn: () => participantService.getRegistrationsByItem<any>(itemId!, tenant_id!),
      enabled: !!itemId && !!tenant_id,
    });
  };

  const useFestivalRegistrations = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['festivalRegistrations', festivalId],
      queryFn: () => participantService.listRegistrationsByFestival<any>(festivalId!),
      enabled: !!festivalId,
    });
  };

  const useParticipantConflicts = (participantIds: string[], scheduleId: string | undefined) => {
    return useQuery({
      queryKey: ['participantConflicts', participantIds, scheduleId],
      queryFn: async () => {
        const { data, error } = await (await import('../../lib/repositories/participantRepository')).participantRepository.getParticipantConflicts(participantIds, scheduleId!);
        if (error) throw error;
        return data || {};
      },
      enabled: !!scheduleId && participantIds.length > 0,
    });
  };

  const generateCodeLettersMutation = useMutation({
    mutationFn: ({ scheduleId, itemId, overwrite }: { scheduleId: string; itemId: string; overwrite?: boolean }) => {
      const tenantId = useAuthStore.getState().tenant_id;
      return participantService.generateCodeLetters(scheduleId, itemId, tenantId!, overwrite);
    },
    onSuccess: (data, variables) => {
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.itemId, tenantId] });
    },
  });

  const updateCodeLetterMutation = useMutation({
    mutationFn: ({ registrationId, codeLetter, itemId }: { registrationId: string; codeLetter: string; itemId: string }) => {
      const tenantId = useAuthStore.getState().tenant_id;
      return (async () => {
         const { error } = await (await import('../../lib/repositories/participantRepository')).participantRepository.updateCodeLetter(registrationId, codeLetter);
         if (error) throw error;
      })();
    },
    onSuccess: (data, variables) => {
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.itemId, tenantId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: ParticipantStatus; reason?: string | null }) => 
      participantService.updateStatus<any>(id, status, reason),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
    },
  });

  const updateParticipantMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) => 
      participantService.updateParticipant<any>(id, updates),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
    },
  });

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: ({
      id,
      file,
      tenantId,
      festivalId,
      onProgress,
    }: {
      id: string;
      file: Blob | File;
      tenantId?: string | null;
      festivalId?: string | null;
      onProgress?: (progress: number) => void;
    }) => participantService.uploadProfilePhoto<any>(id, file, { tenantId, festivalId }, onProgress),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
    },
  });

  const removeProfilePhotoMutation = useMutation({
    mutationFn: (id: string) => participantService.removeProfilePhoto<any>(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['participant', id] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
    },
  });

  const deleteParticipantMutation = useMutation({
    mutationFn: (id: string) => participantService.deleteParticipant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const deleteMultipleMutation = useMutation({
    mutationFn: (ids: string[]) => participantService.deleteParticipants(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const approveMultipleMutation = useMutation({
    mutationFn: (ids: string[]) => participantService.approveParticipants(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const generateChestNumberMutation = useMutation({
    mutationFn: (categoryCode: string) => participantService.generateChestNumber(categoryCode),
  });

  const createParticipantMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => participantService.createParticipant<any>(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  const registerParticipantMutation = useMutation({
    mutationFn: ({ participant, item, festivalConfig }: { participant: any, item: any, festivalConfig: any }) => 
      participantService.registerParticipantForItem<any>(participant, item, festivalConfig),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['participantRegistrations', variables.participant.id] });
      const tenantId = useAuthStore.getState().tenant_id;
      queryClient.invalidateQueries({ queryKey: ['itemRegistrations', variables.item.id, tenantId] });
    },
  });

  return {
    participants: listQuery.data || [],
    isLoadingList: listQuery.isLoading,
    
    participant: detailQuery.data,
    isLoadingDetail: detailQuery.isLoading,
    
    registrations: registrationsQuery.data || [],
    isLoadingRegistrations: registrationsQuery.isLoading,
    
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    
    updateParticipant: updateParticipantMutation.mutateAsync,
    isUpdatingParticipant: updateParticipantMutation.isPending,
    uploadProfilePhoto: uploadProfilePhotoMutation.mutateAsync,
    removeProfilePhoto: removeProfilePhotoMutation.mutateAsync,
    isUploadingProfilePhoto: uploadProfilePhotoMutation.isPending,
    isRemovingProfilePhoto: removeProfilePhotoMutation.isPending,
    
    deleteParticipant: deleteParticipantMutation.mutateAsync,
    deleteMultiple: deleteMultipleMutation.mutateAsync,
    approveMultiple: approveMultipleMutation.mutateAsync,
    
    isDeleting: deleteParticipantMutation.isPending || deleteMultipleMutation.isPending,
    isApprovingMultiple: approveMultipleMutation.isPending,
    
    generateChestNumber: generateChestNumberMutation.mutateAsync,
    createParticipant: createParticipantMutation.mutateAsync,
    isCreating: createParticipantMutation.isPending,

    registerParticipant: registerParticipantMutation.mutateAsync,
    isRegistering: registerParticipantMutation.isPending,

    useItemRegistrations,
    useFestivalRegistrations,
    useParticipantConflicts,
    generateCodeLetters: generateCodeLettersMutation.mutateAsync,
    isGeneratingCodeLetters: generateCodeLettersMutation.isPending,
    updateCodeLetter: updateCodeLetterMutation.mutateAsync,
    isUpdatingCodeLetter: updateCodeLetterMutation.isPending,
  };
};
