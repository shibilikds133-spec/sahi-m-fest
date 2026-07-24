import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Home,
  LayoutDashboard,
  Mail,
  Medal,
  Megaphone,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  UserCheck,
  UserCircle,
  Users,
} from 'lucide-react-native';

import { useAdminDashboard } from '../../core/hooks/useAdminDashboard';
import { usePageAccess } from '../../core/hooks/usePageAccess';
import { useAuthStore } from '../../core/store/authStore';
import { usePageManagementStore } from '../../core/store/pageManagementStore';
import { PageAccessControl } from '../../components/layout/PageAccessControl';

type DashboardIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

type NavigationItem = {
  label: string;
  icon: DashboardIcon;
  visible: boolean;
  active?: boolean;
  onPress?: () => void;
};

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'neutral';
  icon: DashboardIcon;
  iconBg: string;
  iconColor: string;
  sparkColor: string;
  delay: number;
};

type ActionCardProps = {
  label: string;
  icon: DashboardIcon;
  visible: boolean;
  onPress?: () => void;
};

const NAVY = '#0F172A'; // Text Primary
const MUTED = '#64748B'; // Text Secondary
const PAGE_BG = '#E2E8F0'; // Page Background
const BORDER = '#E2E8F0'; // Border
const EMERALD = '#0F766E'; // Primary Green
const EMERALD_DARK = '#0B5D4B'; // Dark Green
const SIDEBAR = '#0F766E'; // Sidebar Primary Green
const SIDEBAR_DARK = '#0B5D4B'; // Sidebar Dark Green

const SUCCESS = '#10B981'; // Success
const WARNING = '#F59E0B'; // Warning
const DANGER = '#EF4444'; // Danger
const INFO = '#3B82F6'; // Info

const categoryColors = ['#14B8A6', '#10B981', '#F97316', '#38BDF8', '#8B5CF6', '#6366F1', '#2563EB', '#F43F5E'];

// Layer 1 Surface (Welcome Section)
const welcomeSurface = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#D6DEE8',
  borderRadius: 22,
  shadowColor: '#0F172A',
  shadowOpacity: 0.04,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  ...Platform.select({
    web: {
      boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
    },
    default: {},
  }),
  elevation: 1,
} as any;

// Layer 2 Surface (Metric Cards)
const cardSurface = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#D6DEE8',
  borderRadius: 16,
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  ...Platform.select({
    web: {
      boxShadow: '0 8px 20px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
    },
    default: {},
  }),
  elevation: 2,
} as any;

// Layer 2.5 Surface (Quick Action Cards)
const actionCardSurface = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#D6DEE8',
  borderRadius: 18,
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  ...Platform.select({
    web: {
      boxShadow: '0 8px 20px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
    },
    default: {},
  }),
  elevation: 2,
} as any;

// Layer 3 Surface (Analytics & Activity Panels)
const panelSurface = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#D6DEE8',
  borderRadius: 18,
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  ...Platform.select({
    web: {
      boxShadow: '0 10px 24px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
    },
    default: {},
  }),
  elevation: 4,
} as any;



function formatTime() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MiniSparkline({ color }: { color: string }) {
  return (
    <View style={{ width: 88, height: 30, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 4 }}>
      {[5, 4, 7, 5, 9, 7, 12, 10, 16, 13, 18].map((height, index) => (
        <View key={index} style={{ width: 7, height, borderRadius: 8, backgroundColor: color, opacity: 0.35 + index / 20 }} />
      ))}
    </View>
  );
}

function MetricCard({ label, value, delta, trend, icon: Icon, iconBg, iconColor, sparkColor, delay }: MetricCardProps) {
  const trendColor = trend === 'down' ? DANGER : trend === 'neutral' ? MUTED : SUCCESS;
  const trendPrefix = trend === 'down' ? '-' : trend === 'neutral' ? '' : '+';

  return (
    <Animated.View
      entering={FadeInUp.duration(420).delay(delay).springify()}
      className="metric-card"
      style={[cardSurface, { flex: 1, minWidth: 180, height: 112, padding: 16, overflow: 'hidden' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <Icon color={iconColor} size={27} strokeWidth={2.5} />
        </View>
        <View>
          <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 12.5 }}>{label}</Text>
          <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 25, lineHeight: 30, marginTop: 1, letterSpacing: -0.5 }}>{value}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: 'Poppins_700Bold', color: trendColor, fontSize: 11.5, marginLeft: 66, marginTop: 2 }}>
        {trendPrefix} {delta}
      </Text>
      <View style={{ position: 'absolute', right: 13, bottom: 8 }}>
        <MiniSparkline color={sparkColor} />
      </View>
    </Animated.View>
  );
}

function SidebarItem({ label, icon: Icon, active, onPress }: NavigationItem) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.82}
      style={{
        height: 38,
        borderRadius: 9,
        paddingHorizontal: 12,
        marginBottom: 6,
        backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
        borderWidth: active ? 1 : 0,
        borderColor: active ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...Platform.select({
          web: active ? { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)' } : {},
          default: {},
        }),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Icon color={active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)'} size={16} strokeWidth={2.1} />
        <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.72)', fontSize: 12.5, marginLeft: 10, flex: 1, letterSpacing: 0.3 }}>
          {label}
        </Text>
      </View>
      {!active && <ChevronRight color="rgba(255, 255, 255, 0.4)" size={13} />}
    </TouchableOpacity>
  );
}


function ActionCard({ label, icon: Icon, visible, onPress }: ActionCardProps) {
  if (!visible) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      className="action-card"
      style={[actionCardSurface, { height: 76, flex: 1, minWidth: 160, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }]}
    >
      <Icon color={EMERALD_DARK} size={25} strokeWidth={2.5} />
      <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 7 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 14 }}>{title}</Text>
      {action && (
        <TouchableOpacity style={{ height: 28, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#ECFDF5', flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Poppins_700Bold', color: EMERALD_DARK, fontSize: 10 }}>{action}</Text>
          <ChevronRight color={EMERALD_DARK} size={13} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyAnalytics({ title }: { title: string }) {
  return (
    <View style={[panelSurface, { flex: 1, minWidth: 310, minHeight: 222, padding: 16 }]}>
      <SectionHeader title={title} />
      <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: BORDER, backgroundColor: '#EDF2F7', alignItems: 'center', justifyContent: 'center' }}>
        <BarChart3 color="#CBD5E1" size={34} />
        <Text style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 12, marginTop: 8 }}>No dashboard data yet</Text>
      </View>
    </View>
  );
}

export default function AdminDashboard() {
  const { logout } = useAuthStore();
  const router = useRouter();
  const { useStats } = useAdminDashboard();
  const { data, isLoading, isRefetching, refetch } = useStats();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 768;

  const syncRegistry = usePageManagementStore((state) => state.syncRegistry);
  const fetchPages = usePageManagementStore((state) => state.fetchPages);

  useEffect(() => {
    const initPageRegistry = async () => {
      await syncRegistry();
      await fetchPages();
    };
    initPageRegistry();
  }, [syncRegistry, fetchPages]);

  const { isVisible: pVisible } = usePageAccess('admin_participants');
  const { isVisible: sVisible } = usePageAccess('admin_schedule');
  const { isVisible: oVisible } = usePageAccess('admin_organisations');
  const { isVisible: setVisible } = usePageAccess('system_settings');
  const { isVisible: cVisible } = usePageAccess('admin_communication');
  const { isVisible: jVisible } = usePageAccess('admin_judges');
  const { isVisible: lVisible } = usePageAccess('admin_leaderboard');
  const { isVisible: pmVisible } = usePageAccess('page_management');

  const refreshing = isRefetching;
  const orgData = data ? { name: data.orgName, type: data.orgType } : null;
  const stats = data
    ? { participants: data.participantsCount, items: data.itemsCount, pendingRegs: data.pendingRegsCount }
    : { participants: 0, items: 0, pendingRegs: 0 };

  const orgName = orgData?.name ?? 'Kodasseri';
  const orgType = orgData?.type ?? 'Sector';
  const subOrgCount = data?.unitGraph?.length || 0;
  const updatedAt = formatTime();
  const categoryTotal = data?.categoryGraph?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const unitTotal = data?.unitGraph?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const maxUnitCount = Math.max(...(data?.unitGraph?.map((item) => item.count) ?? [0]), 1);

  const onRefresh = () => {
    refetch();
  };

  const navigationItems: NavigationItem[] = [
    { label: 'Dashboard', icon: Home, visible: true, active: true, onPress: () => router.push('/(admin)' as any) },
    { label: 'Participants', icon: Users, visible: pVisible, onPress: () => router.push('/(admin)/participants' as any) },
    { label: 'Schedules', icon: Calendar, visible: sVisible, onPress: () => router.push('/(admin)/schedule' as any) },
    { label: 'Sub Organisations', icon: Building2, visible: oVisible, onPress: () => router.push('/(admin)/organisations' as any) },
    { label: 'Festival Settings', icon: Settings, visible: setVisible, onPress: () => router.push('/(admin)/settings' as any) },
    { label: 'Communication Center', icon: Megaphone, visible: cVisible, onPress: () => router.push('/(admin)/communication' as any) },
    { label: 'Judge Management', icon: UserCheck, visible: jVisible, onPress: () => router.push('/(admin)/judges' as any) },
    { label: 'Leaderboard Management', icon: Medal, visible: lVisible, onPress: () => router.push('/(admin)/settings/leaderboard' as any) },
    { label: 'Page Management Center', icon: LayoutDashboard, visible: pmVisible },
    { label: 'Open Judge Portal', icon: Trophy, visible: true, onPress: () => router.push('/judge' as any) },
  ];

  const actionItems: ActionCardProps[] = [
    { label: 'Manage Participants', icon: Users, visible: pVisible, onPress: () => router.push('/(admin)/participants' as any) },
    { label: 'Manage Schedules', icon: Calendar, visible: sVisible, onPress: () => router.push('/(admin)/schedule' as any) },
    { label: 'Sub Organisations', icon: Building2, visible: oVisible, onPress: () => router.push('/(admin)/organisations' as any) },
    { label: 'Festival Settings', icon: Settings, visible: setVisible, onPress: () => router.push('/(admin)/settings' as any) },
    { label: 'Communication Center', icon: Megaphone, visible: cVisible, onPress: () => router.push('/(admin)/communication' as any) },
    { label: 'Judge Management', icon: UserCheck, visible: jVisible, onPress: () => router.push('/(admin)/judges' as any) },
    { label: 'Leaderboard Management', icon: BarChart3, visible: lVisible, onPress: () => router.push('/(admin)/settings/leaderboard' as any) },
    { label: 'Page Management Center', icon: FileText, visible: pmVisible },
  ];

  const activityItems = [
    { title: 'New participant registered', detail: `${orgName} registration desk`, time: '10:15 AM', icon: Users, bg: '#ECFDF5', color: EMERALD_DARK },
    { title: 'New item added', detail: 'Operational category updated', time: '09:42 AM', icon: Trophy, bg: '#F0FDF4', color: '#16A34A' },
    { title: 'Schedule updated', detail: 'Stage program monitoring active', time: '09:15 AM', icon: Calendar, bg: '#EFF6FF', color: '#3B82F6' },
    { title: 'Judge assigned', detail: 'Music category readiness updated', time: 'Yesterday', icon: UserCheck, bg: '#EEF2FF', color: '#4F46E5' },
    { title: 'Announcement published', detail: 'Communication center is online', time: 'Yesterday', icon: Megaphone, bg: '#FEF2F2', color: '#EF4444' },
  ];

  if (isLoading && !refreshing) {
    return (
      <View style={{ flex: 1, backgroundColor: PAGE_BG, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={EMERALD_DARK} />
        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, marginTop: 12 }}>Initializing Enterprise Portal...</Text>
      </View>
    );
  }

  return (
    <PageAccessControl pageKey="admin_dashboard">
      <View style={{ flex: 1, backgroundColor: PAGE_BG, flexDirection: 'row' }}>
        {isTablet && (
          <View style={{ width: 210, backgroundColor: SIDEBAR }}>
            <View style={{ height: 84, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: SIDEBAR_DARK }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <ShieldCheck color={EMERALD_DARK} size={25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: '#D1FAE5', fontSize: 8, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                    {orgType} Portal
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: '#FFFFFF', fontSize: 18, lineHeight: 21, letterSpacing: 0.4 }}>
                    {orgName}
                  </Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: '#D1FAE5', fontSize: 10 }}>Manage your festival operations</Text>
                </View>
              </View>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
              {navigationItems.filter((item) => item.visible).map((item) => (
                <SidebarItem key={item.label} {...item} />
              ))}
            </ScrollView>

            <View style={{ padding: 14, paddingBottom: 18 }}>
              <View style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: EMERALD, alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck color="#FFFFFF" size={16} />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: '#FFFFFF', fontSize: 10 }}>{orgName}</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: '#CFFAFE', fontSize: 9 }}>Festival Management System</Text>
                  </View>
                </View>
              </View>
              <View style={{ height: 116, borderRadius: 18, backgroundColor: SIDEBAR_DARK, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Building2 color="#FFFFFF" size={84} strokeWidth={1.2} />
                <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,118,110,0.18)' }} />
              </View>
            </View>
          </View>
        )}

        <View style={{ flex: 1, backgroundColor: '#EDF2F7' }}>
          <View
            style={[
              { height: 56, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(226, 232, 240, 0.8)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
              Platform.OS === 'web' ? { position: 'sticky' as any, top: 0 } : undefined,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <TouchableOpacity style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Menu color={NAVY} size={22} />
              </TouchableOpacity>
              <View style={{ width: isDesktop ? 230 : 190, height: 38, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}>
                <Search color="#64748B" size={16} />
                <TextInput
                  editable={false}
                  placeholder="Search anything..."
                  placeholderTextColor="#94A3B8"
                  style={{ flex: 1, marginLeft: 10, fontFamily: 'Poppins_400Regular', color: NAVY, fontSize: 12, paddingVertical: 0 }}
                />
                {isDesktop && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.8)' }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: '#94A3B8', fontSize: 9 }}>Ctrl + K</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity style={{ position: 'relative' }}>
                <Bell color={NAVY} size={19} />
                <View style={{ position: 'absolute', top: -7, right: -7, width: 15, height: 15, borderRadius: 8, backgroundColor: EMERALD, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: '#FFFFFF', fontSize: 8 }}>5</Text>
                </View>
              </TouchableOpacity>
              {isTablet && (
                <TouchableOpacity style={{ position: 'relative' }}>
                  <Mail color={NAVY} size={19} />
                  <View style={{ position: 'absolute', top: -7, right: -7, width: 15, height: 15, borderRadius: 8, backgroundColor: EMERALD, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: '#FFFFFF', fontSize: 8 }}>2</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={logout} activeOpacity={0.82} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCircle color="#9A3412" size={29} />
                </View>
                {isTablet && (
                  <View style={{ marginLeft: 10 }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 12 }}>Admin User</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>Super Admin</Text>
                  </View>
                )}
                {isTablet && <ChevronDown color={MUTED} size={15} style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1, backgroundColor: '#EDF2F7' }}
            contentContainerStyle={{
              padding: isDesktop ? 24 : 16,
              paddingBottom: 16,
              maxWidth: 1650,
              width: '100%',
              alignSelf: 'center',
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMERALD_DARK} />}
          >
            {!isTablet && (
              <View style={{ backgroundColor: SIDEBAR, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', color: '#D1FAE5', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 }}>{orgType} Portal</Text>
                <Text style={{ fontFamily: 'Montserrat_700Bold', color: '#FFFFFF', fontSize: 21 }}>{orgName}</Text>
              </View>
            )}

            <Animated.View
              entering={FadeInDown.duration(380).springify()}
              className="welcome-card"
              style={[
                welcomeSurface,
                {
                  minHeight: 88,
                  padding: 24,
                  marginBottom: 24,
                  overflow: 'hidden',
                }
              ]}
            >
              <LinearGradient
                colors={['#FFFFFF', '#F8FBFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFillObject, { zIndex: -1 }]}
              />
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'center' : 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 260 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Users color={EMERALD_DARK} size={28} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: isDesktop ? 22 : 20, lineHeight: 27 }}>Welcome back, Admin!</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 12, marginTop: 6 }}>Here is what is happening with your festival today.</Text>
                  </View>
                </View>

                <View style={{ alignItems: isDesktop ? 'flex-end' : 'flex-start', marginTop: isDesktop ? 0 : 14 }}>
                  <TouchableOpacity onPress={onRefresh} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>Last updated: {updatedAt}</Text>
                    <RefreshCw color={MUTED} size={13} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                  <View style={{ width: 210, height: 42, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)', backgroundColor: '#FFFFFF', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SUCCESS, marginRight: 10 }} />
                    <View>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10 }}>System Status</Text>
                      <Text style={{ fontFamily: 'Poppins_700Bold', color: EMERALD, fontSize: 11 }}>All Systems Operational</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
              <MetricCard label="Participants" value={stats.participants.toLocaleString()} delta="12 this week" trend="up" icon={Users} iconBg="rgba(15, 118, 110, 0.1)" iconColor={EMERALD} sparkColor={EMERALD} delay={80} />
              <MetricCard label="Items" value={stats.items.toLocaleString()} delta="8 this week" trend="up" icon={Trophy} iconBg="rgba(245, 158, 11, 0.1)" iconColor={WARNING} sparkColor={WARNING} delay={140} />
              <MetricCard label="Pending Registrations" value={stats.pendingRegs.toLocaleString()} delta="2 this week" trend={stats.pendingRegs > 0 ? 'down' : 'neutral'} icon={Clock} iconBg="rgba(239, 68, 68, 0.1)" iconColor={DANGER} sparkColor={DANGER} delay={200} />
              <MetricCard label="Active Schedules" value={subOrgCount.toLocaleString()} delta="5 this week" trend="up" icon={Calendar} iconBg="rgba(59, 130, 246, 0.1)" iconColor={INFO} sparkColor={INFO} delay={260} />
            </View>


            <Animated.View entering={FadeInUp.duration(420).delay(280).springify()} style={{ paddingVertical: 8, marginBottom: 24 }}>
              <View style={{ paddingBottom: 16 }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 14 }}>Quick Actions</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: '100%' }}>
                {actionItems.map((item) => (
                  <ActionCard key={item.label} {...item} />
                ))}
              </View>
            </Animated.View>

            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>
              {data?.categoryGraph && data.categoryGraph.length > 0 ? (
                <Animated.View entering={FadeInUp.duration(460).delay(360).springify()} className="panel-card" style={[panelSurface, { flex: 1, minWidth: 330, minHeight: 222, padding: 16 }]}>
                  <SectionHeader title="Participants by Category" action="View Details" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                      <Svg width={148} height={148} viewBox="0 0 148 148">
                        <Circle cx="74" cy="74" r="58" stroke="#F1F5F9" strokeWidth="12" fill="none" />
                        {(() => {
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          let offset = 0;
                          return data.categoryGraph.map((item, index) => {
                            const segment = categoryTotal > 0 ? item.count / categoryTotal : 0;
                            const dash = `${segment * circumference} ${circumference}`;
                            const circle = (
                              <Circle
                                key={item.name}
                                cx="74"
                                cy="74"
                                r={radius}
                                stroke={categoryColors[index % categoryColors.length]}
                                strokeWidth="12"
                                fill="none"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                rotation="-90"
                                origin="74, 74"
                              />
                            );
                            offset += segment * circumference;
                            return circle;
                          });
                        })()}
                      </Svg>
                      <View style={{ position: 'absolute', alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Montserrat_700Bold', color: NAVY, fontSize: 22 }}>{categoryTotal.toLocaleString()}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11 }}>Total</Text>
                      </View>
                    </View>

                    <View style={{ flex: 1, gap: 9 }}>
                      {data.categoryGraph.slice(0, 7).map((item, index) => {
                        const pct = categoryTotal > 0 ? ((item.count / categoryTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: categoryColors[index % categoryColors.length], marginRight: 10 }} />
                              <Text style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 10 }}>{item.name}</Text>
                            </View>
                            <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 10 }}>
                              {item.count} ({pct}%)
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              ) : (
                <EmptyAnalytics title="Participants by Category" />
              )}

              {data?.unitGraph && data.unitGraph.length > 0 ? (
                <Animated.View entering={FadeInUp.duration(460).delay(430).springify()} className="panel-card" style={[panelSurface, { flex: 1, minWidth: 340, minHeight: 222, padding: 16 }]}>
                  <SectionHeader title={`Participants by ${orgData?.type === 'sector' ? 'Unit' : 'Organisation'}`} action="View Details" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginRight: 18 }}>
                      <Svg width={148} height={148} viewBox="0 0 148 148">
                        <Circle cx="74" cy="74" r="58" stroke="#F1F5F9" strokeWidth="12" fill="none" />
                        {(() => {
                          const radius = 58;
                          const circumference = 2 * Math.PI * radius;
                          let offset = 0;
                          return data.unitGraph.slice(0, 7).map((item, index) => {
                            const segment = unitTotal > 0 ? item.count / unitTotal : 0;
                            const dash = `${segment * circumference} ${circumference}`;
                            const circle = (
                              <Circle
                                key={item.name}
                                cx="74"
                                cy="74"
                                r={radius}
                                stroke={categoryColors[(index + 3) % categoryColors.length]}
                                strokeWidth="12"
                                fill="none"
                                strokeDasharray={dash}
                                strokeDashoffset={-offset}
                                strokeLinecap="butt"
                                rotation="-90"
                                origin="74, 74"
                              />
                            );
                            offset += segment * circumference;
                            return circle;
                          });
                        })()}
                      </Svg>
                      <View style={{ position: 'absolute', alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Montserrat_700Bold', color: NAVY, fontSize: 22 }}>{unitTotal.toLocaleString()}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 11 }}>Total</Text>
                      </View>
                    </View>

                    <View style={{ flex: 1, gap: 9 }}>
                      {data.unitGraph.slice(0, 7).map((item, index) => {
                        const pct = unitTotal > 0 ? ((item.count / unitTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: categoryColors[(index + 3) % categoryColors.length], marginRight: 10 }} />
                              <Text numberOfLines={1} style={{ fontFamily: 'Poppins_700Bold', color: MUTED, fontSize: 10, flex: 1 }}>{item.name}</Text>
                            </View>
                            <Text style={{ fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 10, marginLeft: 4 }}>
                              {item.count} ({pct}%)
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Animated.View>
              ) : (
                <EmptyAnalytics title="Participants by Unit" />
              )}

              <Animated.View entering={FadeInUp.duration(460).delay(500).springify()} className="panel-card" style={[panelSurface, { flex: 1, minWidth: 292, minHeight: 222, padding: 16 }]}>
                <SectionHeader title="Recent Activity" />
                <View style={{ gap: 12 }}>
                  {activityItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <View key={item.title} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Icon color={item.color} size={15} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <Text style={{ flex: 1, fontFamily: 'Poppins_700Bold', color: NAVY, fontSize: 11 }}>{item.title}</Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 9, marginLeft: 8 }}>{item.time}</Text>
                          </View>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: MUTED, fontSize: 10, marginTop: 1 }}>{item.detail}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            </View>

            <Text style={{ textAlign: 'center', fontFamily: 'Poppins_400Regular', color: '#64748B', fontSize: 12.5, marginTop: 24, marginBottom: 24 }}>
              (c) 2026 {orgName} Festival Management System. All rights reserved.
            </Text>
          </ScrollView>
        </View>
      </View>
    </PageAccessControl>
  );
}
