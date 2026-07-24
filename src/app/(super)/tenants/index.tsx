import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  Clipboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSuperAdmin } from '../../../core/hooks/useSuperAdmin';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft, Users, ShieldCheck, ShieldAlert, X, RefreshCw,
  Building2, Map, GitBranch, Landmark, Flag, Eye, EyeOff,
  Mail, KeyRound, Info, ChevronRight, Copy, ExternalLink, Trash2,
} from 'lucide-react-native';

const C = {
  bg: '#0B1524', surface: '#111E35', border: '#1E3A5F',
  accent: '#FBBF24', accentBg: 'rgba(251,191,36,0.10)',
  text: '#E2E8F0', muted: '#475569', danger: '#F87171',
  dangerBg: 'rgba(239,68,68,0.10)', green: '#34D399',
  greenBg: 'rgba(52,211,153,0.10)', purple: '#818CF8',
  purpleBg: 'rgba(129,140,248,0.10)',
};

type OrgType = 'unit' | 'sector' | 'division' | 'district' | 'state';

interface Org {
  id: string;
  name: string;
  org_type: OrgType;
  tenant_id: string | null;
  admin_email?: string | null;
  admin_password_temp?: string | null;
}

const ORG_TYPE_CONFIG: Record<OrgType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  unit:     { label: 'Unit',     icon: <Building2 size={16} color="#FBBF24" />, color: '#FBBF24', bg: 'rgba(251,191,36,0.10)' },
  sector:   { label: 'Sector',   icon: <Map       size={16} color="#34D399" />, color: '#34D399', bg: 'rgba(52,211,153,0.10)' },
  division: { label: 'Division', icon: <GitBranch size={16} color="#818CF8" />, color: '#818CF8', bg: 'rgba(129,140,248,0.10)' },
  district: { label: 'District', icon: <Landmark  size={16} color="#EC4899" />, color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
  state:    { label: 'State',    icon: <Flag      size={16} color="#A855F7" />, color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
};

// ─── Detail Modal (for active tenants) ───────────────────────────────
function DetailModal({ visible, onClose, onComplete, org }: { 
  visible: boolean; 
  onClose: () => void; 
  onComplete: () => void; 
  org: Org | null 
}) {
  const [showPass, setShowPass]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [copiedTenantId, setCopiedTenantId] = useState(false);
  const [revoking, setRevoking]       = useState(false);
  const { useRevokeTenantAccess } = useSuperAdmin();
  const revokeMutation = useRevokeTenantAccess();

  if (!org) return null;
  const cfg = ORG_TYPE_CONFIG[org.org_type];

  const handleCopy = () => {
    const text = `Email: ${org.admin_email ?? '—'}\nPassword: ${org.admin_password_temp ?? '—'}\nTenant ID: ${org.tenant_id ?? '—'}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      Clipboard.setString(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyTenantId = () => {
    const text = org.tenant_id ?? '';
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(text).then(() => {
        setCopiedTenantId(true);
        setTimeout(() => setCopiedTenantId(false), 2000);
      });
    } else {
      Clipboard.setString(text);
      setCopiedTenantId(true);
      setTimeout(() => setCopiedTenantId(false), 2000);
    }
  };

  const handleOpenLogin = () => {
    if (Platform.OS === 'web') {
      const url = `${window.location.origin}`;
      window.open(url, '_blank');
    }
  };

  const handleRevoke = async () => {
    const performRevoke = async () => {
      try {
        setRevoking(true);
        await revokeMutation.mutateAsync(org.id);
        Platform.OS === 'web' ? window.alert('Access revoked successfully.') : Alert.alert('Success', 'Access revoked successfully.');
        onComplete();
        onClose();
      } catch (error: any) {
        Platform.OS === 'web' ? window.alert(`Error: ${error.message}`) : Alert.alert('Error', error.message);
      } finally {
        setRevoking(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to REVOKE access for ${org.name}? This will delete their login account and all associated tenant data permanently.`)) {
        await performRevoke();
      }
    } else {
      Alert.alert(
        'Confirm Revocation',
        `Are you sure you want to REVOKE access for ${org.name}? This will delete their login account permanently.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revoke Access', style: 'destructive', onPress: performRevoke },
        ]
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInUp.duration(300)} style={{
          backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 24, borderTopWidth: 1, borderColor: C.border,
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ backgroundColor: cfg.bg, padding: 10, borderRadius: 12 }}>
                {cfg.icon}
              </View>
              <View>
                <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 18 }}>{org.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <ShieldCheck size={12} color={C.green} />
                  <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>Active Tenant</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <X size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Type badge */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <View style={{ backgroundColor: cfg.bg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: cfg.color + '40' }}>
              <Text style={{ color: cfg.color, fontFamily: 'Poppins_700Bold', fontSize: 12 }}>{cfg.label}</Text>
            </View>
          </View>

          {/* Tenant ID */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Tenant ID</Text>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: C.accent, fontFamily: 'Poppins_400Regular', fontSize: 13, flex: 1, letterSpacing: 0.5 }}>
              {org.tenant_id ?? '—'}
            </Text>
            {org.tenant_id && (
              <TouchableOpacity onPress={handleCopyTenantId} style={{ padding: 4 }}>
                <Copy size={16} color={copiedTenantId ? C.green : C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Email */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Admin Email</Text>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Mail size={16} color={C.muted} />
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 15, flex: 1 }}>
              {org.admin_email ?? '—'}
            </Text>
          </View>

          {/* Password */}
          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Admin Password <Text style={{ color: C.danger, fontSize: 9 }}>(TEST ONLY)</Text>
          </Text>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <KeyRound size={16} color={C.muted} />
            <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 15, flex: 1 }}>
              {org.admin_password_temp
                ? (showPass ? org.admin_password_temp : '••••••••')
                : '—'}
            </Text>
            {org.admin_password_temp && (
              <TouchableOpacity onPress={() => setShowPass(v => !v)}>
                {showPass ? <EyeOff size={18} color={C.muted} /> : <Eye size={18} color={C.muted} />}
              </TouchableOpacity>
            )}
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {/* Copy Credentials */}
            <TouchableOpacity
              onPress={handleCopy}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: copied ? C.greenBg : C.accentBg, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: copied ? C.green + '50' : C.accent + '50' }}
            >
              <Copy size={16} color={copied ? C.green : C.accent} />
              <Text style={{ color: copied ? C.green : C.accent, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>
                {copied ? 'Copied!' : 'Copy Credentials'}
              </Text>
            </TouchableOpacity>

            {/* Open Login Page */}
            {Platform.OS === 'web' && (
              <TouchableOpacity
                onPress={handleOpenLogin}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.purpleBg, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.purple + '50' }}
              >
                <ExternalLink size={16} color={C.purple} />
                <Text style={{ color: C.purple, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Open Login</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Revoke Access Button */}
          <TouchableOpacity
            onPress={handleRevoke}
            disabled={revoking}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: C.dangerBg,
              padding: 13,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: C.danger + '50',
              marginBottom: 20,
            }}
          >
            {revoking ? (
              <ActivityIndicator size="small" color={C.danger} />
            ) : (
              <>
                <Trash2 size={16} color={C.danger} />
                <Text style={{ color: C.danger, fontFamily: 'Poppins_700Bold', fontSize: 13 }}>Revoke Access & Delete Account</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Warning */}
          <View style={{ backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.accent + '30', flexDirection: 'row', gap: 8 }}>
            <Info size={16} color={C.accent} style={{ marginTop: 1 }} />
            <Text style={{ color: C.accent, fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 }}>
              Use "Open Login" in a new tab to test without losing your superadmin session.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Onboard Modal ────────────────────────────────────────────────────
function OnboardModal({ visible, onClose, onComplete, org }: {
  visible: boolean; onClose: () => void; onComplete: () => void; org: Org | null;
}) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { if (visible) { setEmail(''); setPassword(''); setShowPass(false); } }, [visible]);

  const handleSave = async () => {
    if (!org) return;
    if (!email.trim() || !password.trim()) {
      Platform.OS === 'web' ? window.alert('Please enter both email and password.') : Alert.alert('Validation', 'Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      Platform.OS === 'web' ? window.alert('Password must be at least 6 characters.') : Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    try {
      await setupMutation.mutateAsync({
        p_org_id:       org.id,
        p_org_name:     org.name,
        p_org_type:     org.org_type,
        p_admin_email:  email.trim().toLowerCase(),
        p_admin_pass:   password,
      });

      Platform.OS === 'web'
        ? window.alert(`✅ Tenant account created!\nEmail: ${email}\nPassword: ${password}`)
        : Alert.alert('Success', `Tenant created!\nEmail: ${email}\nPassword: ${password}`);
      onComplete();
      onClose();
    } catch (error: any) {
      Platform.OS === 'web' ? window.alert(`Error: ${error.message}`) : Alert.alert('Error', error.message);
    }
  };

  if (!org) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' }}>
        <Animated.View entering={FadeInUp.duration(300)} style={{
          backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 24, borderTopWidth: 1, borderColor: C.border,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <View>
              <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 20 }}>Onboard Tenant</Text>
              <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                {org.name} ({ORG_TYPE_CONFIG[org.org_type].label})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}><X size={22} color={C.muted} /></TouchableOpacity>
          </View>

          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Admin Email</Text>
          <TextInput
            value={email} onChangeText={setEmail}
            placeholder="e.g. admin@unit.com" placeholderTextColor={C.muted}
            autoCapitalize="none" keyboardType="email-address"
            style={{ backgroundColor: C.bg, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, marginBottom: 20 }}
          />

          <Text style={{ color: C.muted, fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Initial Password</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 30 }}>
            <TextInput
              value={password} onChangeText={setPassword}
              placeholder="Min 6 characters" placeholderTextColor={C.muted}
              secureTextEntry={!showPass}
              style={{ flex: 1, color: C.text, padding: 14, fontFamily: 'Poppins_400Regular', fontSize: 15 }}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={{ paddingHorizontal: 14 }}>
              {showPass ? <EyeOff size={20} color={C.muted} /> : <Eye size={20} color={C.muted} />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleSave} disabled={setupMutation.isPending}
            style={{ backgroundColor: setupMutation.isPending ? C.border : C.green, padding: 16, borderRadius: 14, alignItems: 'center' }}>
            {setupMutation.isPending ? <ActivityIndicator color={C.text} /> : (
              <Text style={{ color: '#000', fontFamily: 'Poppins_700Bold', fontSize: 15 }}>Create Tenant Account</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────
export default function TenantsManager() {
  const router = useRouter();
  
  const { useTenantAccounts } = useSuperAdmin();
  const { data: orgsData, isLoading: loading, refetch } = useTenantAccounts<Org>();
  const orgs = orgsData || [];
  
  const [activeFilter, setActiveFilter] = useState<'all' | OrgType>('all');
  const [onboardOrg, setOnboardOrg]   = useState<Org | null>(null);
  const [detailOrg, setDetailOrg]     = useState<Org | null>(null);

  const fetchOrgs = () => refetch();

  const filteredOrgs = orgs.filter(o => activeFilter === 'all' || o.org_type === activeFilter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Header */}
          <View style={{ padding: 20, paddingTop: Platform.OS === 'web' ? 40 : 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                  <ArrowLeft size={20} color={C.text} />
                </TouchableOpacity>
                <View>
                  <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Access Control</Text>
                  <Text style={{ color: C.text, fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>Tenant Accounts</Text>
                </View>
              </View>
              <TouchableOpacity onPress={fetchOrgs} style={{ padding: 10, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                <RefreshCw size={18} color={C.muted} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 20, backgroundColor: C.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text, fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 }}>
                Tap <Text style={{ color: C.green }}>Active Tenant</Text> cards to view credentials. Tap <Text style={{ color: C.danger }}>Onboard</Text> to give an organisation portal access.
              </Text>
            </View>
          </View>

          {/* Filter tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', 'state', 'district', 'division', 'sector', 'unit'] as const).map(f => {
                const active = activeFilter === f;
                const cfg = f !== 'all' ? ORG_TYPE_CONFIG[f] : null;
                return (
                  <TouchableOpacity key={f} onPress={() => setActiveFilter(f)} style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                    borderColor: active ? (cfg?.color ?? C.accent) : C.border,
                    backgroundColor: active ? (cfg?.bg ?? C.accentBg) : C.surface,
                  }}>
                    <Text style={{ color: active ? (cfg?.color ?? C.accent) : C.muted, fontFamily: 'Poppins_700Bold', fontSize: 12, textTransform: 'capitalize' }}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* List */}
          <View style={{ padding: 20, gap: 12 }}>
            {loading ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
            ) : filteredOrgs.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Users size={48} color={C.border} />
                <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', marginTop: 16 }}>No organisations found.</Text>
              </View>
            ) : filteredOrgs.map((org, i) => {
              const cfg = ORG_TYPE_CONFIG[org.org_type];
              const hasAccess = !!org.tenant_id;
              return (
                <Animated.View key={org.id} entering={FadeInDown.delay(i * 50).duration(400)}>
                  <TouchableOpacity
                    onPress={() => hasAccess ? setDetailOrg(org) : setOnboardOrg(org)}
                    activeOpacity={0.8}
                    style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: hasAccess ? '#34D39930' : C.border, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={{ backgroundColor: cfg.bg, padding: 10, borderRadius: 12 }}>{cfg.icon}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 16 }}>{org.name}</Text>
                        <Text style={{ color: C.muted, fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
                          {cfg.label}{org.admin_email ? ` · ${org.admin_email}` : ''}
                        </Text>
                      </View>
                    </View>

                    {hasAccess ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#34D39940' }}>
                          <ShieldCheck size={12} color={C.green} />
                          <Text style={{ color: C.green, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>Active</Text>
                        </View>
                        <ChevronRight size={16} color={C.muted} />
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }}>
                        <ShieldAlert size={12} color={C.danger} />
                        <Text style={{ color: C.text, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>Onboard</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>

      <OnboardModal visible={!!onboardOrg} org={onboardOrg} onClose={() => setOnboardOrg(null)} onComplete={fetchOrgs} />
      <DetailModal visible={!!detailOrg} org={detailOrg} onClose={() => setDetailOrg(null)} onComplete={fetchOrgs} />
    </View>
  );
}
