import { organisationRepository } from '../lib/repositories/organisationRepository';

const throwIfError = (error: { message: string } | null, dataError?: string) => {
  if (error) throw new Error(error.message);
  if (dataError) throw new Error(dataError);
};

export const organisationService = {
  async getMyOrganisation(tenantId: string) {
    const { data, error } = await organisationRepository.getOrganisation(tenantId);
    throwIfError(error);
    return data;
  },

  async getChildOrganisations(parentId: string) {
    const { data, error } = await organisationRepository.getChildOrganisations(parentId);
    throwIfError(error);
    return data || [];
  },

  async deleteChildOrganisation(orgId: string) {
    const { data, error } = await organisationRepository.deleteChildOrganisation(orgId);
    throwIfError(error, data && !data.success ? data.error : undefined);
    return data;
  },

  generateCredentials(name: string) {
    if (!name.trim()) return { id: '', pass: '' };
    
    // Turn "Unit Makkaraparamba" into "unit_makkaraparamba"
    const baseId = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    
    // Clean name for password: all lowercase, only alphanumeric
    let cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    // Ensure the password meets Supabase minimum length (6 chars)
    if (cleanName.length < 4) {
      cleanName = cleanName.padEnd(4, 'x'); // Pad if extremely short
    }
    
    const pass = cleanName.substring(0, 4) + '2026';
    return { id: baseId, pass };
  },

  async createSubOrganisation(parentId: string, orgName: string, orgType: string = 'unit') {
    const { id: generatedId, pass: generatedPass } = this.generateCredentials(orgName);

    if (generatedId.length < 3 || generatedPass.length < 6) {
      throw new Error('Name is too short to generate secure credentials.');
    }

    // Add a unique short suffix to avoid email conflicts
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const internalEmail = `${generatedId}_${uniqueSuffix}@sahi.local`;
    
    const { data: authData, error: authErr } = await organisationRepository.signUpNewOrganisationUser(
      internalEmail,
      generatedPass,
      orgName
    );

    if (authErr) throw new Error(authErr.message);
    if (!authData.user) throw new Error('User creation failed.');

    const { data: rpcData, error: rpcErr } = await organisationRepository.setupChildOrganisation({
      parentId,
      newUserId: authData.user.id,
      orgName,
      orgType,
      username: generatedId,
      internalEmail,
      passwordTemp: generatedPass
    });

    if (rpcErr) throw new Error(rpcErr.message);
    if (rpcData && !rpcData.success) throw new Error(rpcData.error);

    return rpcData;
  }
};
