import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superService } from '../../services/superService';

export function useSuperAdmin() {
  const queryClient = useQueryClient();

  const useStats = () => useQuery({
    queryKey: ['superadmin', 'stats'],
    queryFn: () => superService.getSuperAdminStats(),
  });

  const useGlobalOrganisations = <T>() => useQuery({
    queryKey: ['superadmin', 'organisations'],
    queryFn: () => superService.listGlobalOrganisations<T>(),
  });

  const useCreateGlobalOrganisation = <T>() => useMutation({
    mutationFn: (payload: Record<string, unknown>) => superService.createGlobalOrganisation<T>(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'stats'] });
    },
  });

  const useDeleteGlobalOrganisation = () => useMutation({
    mutationFn: (id: string) => superService.deleteGlobalOrganisation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'organisations'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'stats'] });
    },
  });

  const useTenantAccounts = <T>() => useQuery({
    queryKey: ['superadmin', 'tenants'],
    queryFn: () => superService.listTenantAccounts<T>(),
  });

  const useRevokeTenantAccess = () => useMutation({
    mutationFn: (orgId: string) => superService.revokeTenantAccess(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  const useSetupTenantRecords = () => useMutation({
    mutationFn: (payload: Record<string, unknown>) => superService.setupTenantRecords(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
    },
  });

  return {
    useStats,
    useGlobalOrganisations,
    useCreateGlobalOrganisation,
    useDeleteGlobalOrganisation,
    useTenantAccounts,
    useRevokeTenantAccess,
    useSetupTenantRecords,
  };
}
