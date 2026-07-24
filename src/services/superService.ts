import { createClient } from '@supabase/supabase-js';
import { superRepository } from '../lib/repositories/superRepository';

const throwIfError = (error: { message: string } | null) => {
  if (error) {
    throw new Error(error.message);
  }
};

export const superService = {
  async getSuperAdminStats() {
    const { data, error } = await superRepository.getSuperAdminStats();
    throwIfError(error);
    return data;
  },

  async listGlobalOrganisations<T>() {
    const { data, error } = await superRepository.listGlobalOrganisations<T>();
    throwIfError(error);
    return data;
  },

  async createGlobalOrganisation<T>(payload: Record<string, unknown>) {
    const { data, error } = await superRepository.createGlobalOrganisation<T>(payload);
    throwIfError(error);
    return data;
  },

  async deleteGlobalOrganisation(id: string) {
    const { error } = await superRepository.deleteGlobalOrganisation(id);
    throwIfError(error);
  },

  async listTenantAccounts<T>() {
    const { data, error } = await superRepository.listTenantAccounts<T>();
    throwIfError(error);
    return data;
  },

  async revokeTenantAccess(orgId: string) {
    const { error } = await superRepository.revokeTenantAccess(orgId);
    throwIfError(error);
  },

  async setupTenantRecords(payload: Record<string, unknown>) {
    // 1. Create isolated auth account so we don't log out the active superadmin session
    const dummyClient = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    
    const { data: signUpData, error: signUpError } = await dummyClient.auth.signUp({
      email: payload.p_admin_email as string,
      password: payload.p_admin_pass as string,
      options: { data: { full_name: `${payload.p_org_name} Admin` } },
    });

    if (signUpError || !signUpData?.user) {
      throw new Error(`Auth Error: ${signUpError?.message || 'Unknown sign up error'}`);
    }

    // 2. Link the records via RPC
    const finalPayload = {
      ...payload,
      p_user_id: signUpData.user.id
    };

    const { error } = await superRepository.setupTenantRecords(finalPayload);
    throwIfError(error);
  }
};
