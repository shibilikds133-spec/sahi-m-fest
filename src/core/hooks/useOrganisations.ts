import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organisationService } from '../../services/organisationService';
import { useAuthStore } from '../store/authStore';

export const useOrganisations = () => {
  const queryClient = useQueryClient();
  const { tenant_id } = useAuthStore();

  const myOrganisationQuery = useQuery({
    queryKey: ['myOrganisation', tenant_id],
    queryFn: () => organisationService.getMyOrganisation(tenant_id!),
    enabled: !!tenant_id,
  });

  const parentId = myOrganisationQuery.data?.id;

  const childOrganisationsQuery = useQuery({
    queryKey: ['childOrganisations', parentId],
    queryFn: () => organisationService.getChildOrganisations(parentId!),
    enabled: !!parentId,
  });

  const createOrganisationMutation = useMutation({
    mutationFn: ({ orgName, orgType }: { orgName: string; orgType?: string }) => {
      if (!parentId) throw new Error('Parent ID not found');
      return organisationService.createSubOrganisation(parentId, orgName, orgType);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['childOrganisations', parentId] });
    },
  });

  const deleteOrganisationMutation = useMutation({
    mutationFn: (orgId: string) => organisationService.deleteChildOrganisation(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['childOrganisations', parentId] });
    },
  });

  return {
    myOrganisation: myOrganisationQuery.data,
    isLoadingMyOrg: myOrganisationQuery.isLoading,
    childOrganisations: childOrganisationsQuery.data || [],
    isLoadingChildren: childOrganisationsQuery.isLoading || myOrganisationQuery.isLoading,
    createOrganisation: createOrganisationMutation.mutateAsync,
    isCreating: createOrganisationMutation.isPending,
    deleteOrganisation: deleteOrganisationMutation.mutateAsync,
    isDeleting: deleteOrganisationMutation.isPending,
    generateCredentials: organisationService.generateCredentials,
  };
};
