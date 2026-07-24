import { supabase } from '../../core/config/supabase';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://szhwkngspodujiqzblab.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const organisationRepository = {
  async getOrganisation(tenantId: string) {
    return await supabase
      .from('organisations')
      .select('id, org_type')
      .eq('tenant_id', tenantId)
      .single();
  },

  async getChildOrganisations(parentId: string) {
    return await supabase
      .from('organisations')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false });
  },

  async deleteChildOrganisation(orgId: string) {
    return await supabase.rpc('delete_child_organisation', {
      p_org_id: orgId
    });
  },

  async signUpNewOrganisationUser(email: string, password: string, fullName: string) {
    const isolatedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return await isolatedSupabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
  },

  async setupChildOrganisation(payload: {
    parentId: string;
    newUserId: string;
    orgName: string;
    orgType: string;
    username: string;
    internalEmail: string;
    passwordTemp: string;
  }) {
    return await supabase.rpc('setup_child_organisation', {
      p_parent_id: payload.parentId,
      p_new_user_id: payload.newUserId,
      p_org_name: payload.orgName,
      p_org_type: payload.orgType,
      p_username: payload.username,
      p_internal_email: payload.internalEmail,
      p_password_temp: payload.passwordTemp
    });
  }
};
