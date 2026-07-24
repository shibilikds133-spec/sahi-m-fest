import { supabase } from '../../core/config/supabase';
import { AuthProfile, AuthProvider, AuthResult } from './AuthProvider';

const normalizeError = (error: any): AuthResult<never>['error'] => {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message || 'Authentication request failed',
  };
};

export class SupabaseAuthProvider implements AuthProvider {
  async lookupEmailByUsername(username: string): Promise<AuthResult<string>> {
    const { data, error } = await supabase.rpc('lookup_email_by_username', {
      p_username: username,
    });

    return { data: data ?? null, error: normalizeError(error) };
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult<{ user: any }>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    return {
      data: data.user ? { user: data.user } : null,
      error: normalizeError(error),
    };
  }

  async signOut(): Promise<AuthResult<void>> {
    const { error } = await supabase.auth.signOut();
    return { data: undefined, error: normalizeError(error) };
  }

  async getSession(): Promise<AuthResult<{ user: any } | null>> {
    const { data, error } = await supabase.auth.getSession();
    return {
      data: data.session?.user ? { user: data.session.user } : null,
      error: normalizeError(error),
    };
  }

  async getProfile(userId: string): Promise<AuthResult<AuthProfile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, tenant_id, is_superadmin')
      .eq('id', userId)
      .single();

    return { data: data ?? null, error: normalizeError(error) };
  }
}
