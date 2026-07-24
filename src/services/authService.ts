import { authProvider } from '../providers/auth';

export type LoginResult = {
  user: any;
  tenant_id: string | null;
  role: any;
  is_superadmin: boolean;
};

export type SessionResult = LoginResult | null;

const friendlyError = (msg: string): string => {
  if (!msg) return 'An unexpected error occurred.';
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (m.includes('email not confirmed')) return 'Your email is not verified. Please check your inbox.';
  if (m.includes('too many requests')) {
    return 'Too many failed attempts. Please wait a moment before trying again.';
  }
  if (m.includes('profile not found')) {
    return 'Account setup incomplete. Please contact your administrator.';
  }
  return msg;
};

const resolveLoginEmail = async (input: string): Promise<string> => {
  const loginEmail = input.trim().toLowerCase();
  if (loginEmail.includes('@')) return loginEmail;

  const { data, error } = await authProvider.lookupEmailByUsername(loginEmail);
  if (error) throw new Error(error.message);
  return data || `${loginEmail}@sahi.local`;
};

const getRequiredProfile = async (userId: string) => {
  const { data, error } = await authProvider.getProfile(userId);
  if (error || !data) throw new Error('Profile not found. Please contact an administrator.');
  return data;
};

export const authService = {
  friendlyError,

  async login(identifier: string, password: string): Promise<LoginResult> {
    const loginEmail = await resolveLoginEmail(identifier);
    const { data, error } = await authProvider.signInWithPassword(loginEmail, password);
    if (error) throw new Error(error.message);
    if (!data?.user) throw new Error('Login failed. Please try again.');

    const profile = await getRequiredProfile(data.user.id);
    return {
      user: data.user,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_superadmin: profile.is_superadmin || false,
    };
  },

  async logout(): Promise<void> {
    const { error } = await authProvider.signOut();
    if (error) throw new Error(error.message);
  },

  async getCurrentSession(): Promise<SessionResult> {
    const { data, error } = await authProvider.getSession();
    if (error) throw new Error(error.message);
    if (!data?.user) return null;

    const profile = await getRequiredProfile(data.user.id);
    return {
      user: data.user,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_superadmin: profile.is_superadmin || false,
    };
  },
};
