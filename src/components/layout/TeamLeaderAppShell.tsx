import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Trophy,
  Users,
  UserCircle,
  X,
} from 'lucide-react-native';
import { useAuthStore } from '@/core/store/authStore';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { cn } from '@/lib/utils';

type IconType = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type NavItem = {
  label: string;
  shortLabel?: string;
  path: string;
  icon: IconType;
  match: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    shortLabel: 'Home',
    path: '/team/dashboard',
    icon: Home,
    match: (path) => path === '/team/dashboard' || path === '/team',
  },
  {
    label: 'My Team',
    path: '/team/my-team',
    icon: Users,
    match: (path) => path.includes('/team/my-team'),
  },
  {
    label: 'Schedule',
    path: '/team/schedule',
    icon: CalendarDays,
    match: (path) => path.includes('/team/schedule'),
  },
  {
    label: 'Results',
    path: '/team/results',
    icon: Trophy,
    match: (path) => path.includes('/team/results'),
  },
  {
    label: 'Participants',
    path: '/team/participants',
    icon: ScrollText,
    match: (path) => path.includes('/team/participants'),
  },
  {
    label: 'Announcements',
    path: '/team/announcements',
    icon: MessageSquare,
    match: (path) => path.includes('/team/announcements'),
  },
  {
    label: 'Team Profile',
    path: '/team/profile',
    icon: UserCircle,
    match: (path) => path.includes('/team/profile'),
  },
];

export function TeamLeaderAppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { width } = useWindowDimensions();
  const { context } = useTeamLeaderContext();

  const isDesktop = width >= 768;

  const handleLogout = async () => {
    await logout();
    router.replace('/team/login');
  };

  const navigate = (path: string) => {
    router.push(path as any);
    setMobileMenuOpen(false);
  };

  // Desktop sidebar
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar */}
        <View
          style={{
            width: sidebarOpen ? 220 : 56,
            backgroundColor: '#102A2E',
            paddingTop: 16,
            paddingBottom: 16,
          }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
            {sidebarOpen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Team Portal
                </Text>
                <TouchableOpacity onPress={() => setSidebarOpen(false)} hitSlop={8}>
                  <PanelLeftClose size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setSidebarOpen(true)} hitSlop={8} style={{ alignItems: 'center' }}>
                <PanelLeftOpen size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Nav items */}
          <View style={{ flex: 1 }}>
            {navItems.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.path}
                  onPress={() => navigate(item.path)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: sidebarOpen ? 12 : 0,
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                    backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    marginHorizontal: sidebarOpen ? 8 : 4,
                    borderRadius: 8,
                    marginBottom: 2,
                  }}
                >
                  <Icon size={18} color={active ? '#5EEAD4' : '#94A3B8'} />
                  {sidebarOpen && (
                    <Text
                      style={{
                        marginLeft: 10,
                        color: active ? '#FFFFFF' : '#CBD5E1',
                        fontSize: 13,
                        fontWeight: active ? '600' : '400',
                      }}
                    >
                      {item.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: sidebarOpen ? 12 : 0,
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              marginHorizontal: sidebarOpen ? 8 : 4,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <LogOut size={18} color="#94A3B8" />
            {sidebarOpen && (
              <Text style={{ marginLeft: 10, color: '#CBD5E1', fontSize: 13 }}>Logout</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={{ flex: 1, backgroundColor: '#F6F7F9' }}>
          {/* Top bar */}
          <View
            style={{
              height: 48,
              backgroundColor: '#FFFFFF',
              borderBottomWidth: 1,
              borderBottomColor: '#E2E8F0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
              {context?.festival_id ? 'Festival Portal' : 'Team Portal'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: '#64748B' }}>
                {context?.organisation_id ? 'Team' : ''}
              </Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Mobile layout
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F7F9' }}>
      {/* Mobile top bar */}
      <View
        style={{
          height: 48,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8F0',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
        }}
      >
        <TouchableOpacity onPress={() => setMobileMenuOpen(true)} hitSlop={8}>
          <Menu size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
          Team Portal
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
          <Pressable
            onPress={() => setMobileMenuOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
          <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 260, backgroundColor: '#102A2E', paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 }}>
              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>Team Portal</Text>
              <TouchableOpacity onPress={() => setMobileMenuOpen(false)}>
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            {navItems.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.path}
                  onPress={() => navigate(item.path)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  }}
                >
                  <Icon size={18} color={active ? '#5EEAD4' : '#94A3B8'} />
                  <Text style={{ marginLeft: 12, color: active ? '#FFFFFF' : '#CBD5E1', fontSize: 14, fontWeight: active ? '600' : '400' }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 8 }}>
              <TouchableOpacity onPress={handleLogout} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}>
                <LogOut size={18} color="#94A3B8" />
                <Text style={{ marginLeft: 12, color: '#CBD5E1', fontSize: 14 }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {children}
      </ScrollView>

      {/* Mobile bottom nav */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
        }}
      >
        {navItems.slice(0, 5).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <TouchableOpacity
              key={item.path}
              onPress={() => navigate(item.path)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon size={20} color={active ? '#0F766E' : '#94A3B8'} />
              <Text style={{ fontSize: 10, color: active ? '#0F766E' : '#94A3B8', marginTop: 2, fontWeight: active ? '600' : '400' }}>
                {item.shortLabel || item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
