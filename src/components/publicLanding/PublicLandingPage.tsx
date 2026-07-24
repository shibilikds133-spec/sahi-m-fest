import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Bell, CalendarDays, Flag, RefreshCw, UsersRound } from 'lucide-react-native';

const navItems = [
  { label: 'Home', href: '/(public)' },
  { label: 'Leaderboard', href: '/(public)/leaderboard' },
  { label: 'Results', href: '/(public)/leaderboard' },
  { label: 'Schedule', href: '/(public)/leaderboard' },
];

const stats = [
  { value: '120+', label: 'Events', Icon: CalendarDays },
  { value: '40+', label: 'Stages', Icon: Flag },
  { value: '2000+', label: 'Participants', Icon: UsersRound },
];

export function PublicLandingPage() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  return (
    <View style={styles.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Navbar isDesktop={isDesktop} />
        <Hero isDesktop={isDesktop} />
        <Footer isDesktop={isDesktop} />
      </ScrollView>
    </View>
  );
}

function Navbar({ isDesktop }: { isDesktop: boolean }) {
  const router = useRouter();

  return (
    <View style={styles.navbar}>
      <View style={styles.navInner}>
        <TouchableOpacity onPress={() => router.push('/(public)' as never)} activeOpacity={0.8}>
          <Text style={[styles.brand, { fontSize: isDesktop ? 30 : 22 }]}>SSF Kodasseri Sahithyolsav</Text>
        </TouchableOpacity>

        {isDesktop ? (
          <View style={styles.navLinks}>
            {navItems.map((item, index) => (
              <TouchableOpacity key={item.label} onPress={() => router.push(item.href as never)} activeOpacity={0.75}>
                <Text style={[styles.navText, index === 0 && styles.activeNavText]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <TouchableOpacity onPress={() => router.push('/login' as never)} activeOpacity={0.82} style={styles.loginButton}>
          <Text style={styles.loginText}>Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Hero({ isDesktop }: { isDesktop: boolean }) {
  const router = useRouter();

  return (
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>SSF Kodasseri Sector</Text>

      <View style={[styles.titleBlock, { marginTop: isDesktop ? 50 : 36 }]}>
        <Text style={[styles.scriptTitle, { fontSize: isDesktop ? 72 : 48, lineHeight: isDesktop ? 82 : 58 }]}>
          Sahityotsav
        </Text>
      </View>

      <Text style={[styles.heroTitle, { fontSize: isDesktop ? 48 : 34, lineHeight: isDesktop ? 58 : 42 }]}>
        Live Results Portal
      </Text>

      <Text style={styles.subtitle}>
        Celebrating Talent. Inspiring Excellence. Official Live Updates from the Cultural Festival.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => router.push('/(public)/leaderboard' as never)}
          activeOpacity={0.85}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryText}>View Leaderboard</Text>
          <ArrowRight color="#FFFFFF" size={18} style={styles.buttonIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(public)/leaderboard' as never)}
          activeOpacity={0.82}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>Live Updates</Text>
          <Bell color="#111827" size={17} style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>

      <View style={[styles.statsGrid, { marginTop: isDesktop ? 64 : 44 }]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <stat.Icon color="#3B82F6" size={28} strokeWidth={2.4} />
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}

        <View style={[styles.statCard, styles.liveCard]}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <RefreshCw color="#22C55E" size={30} strokeWidth={2.5} />
          <Text style={styles.updateTitle}>Updates</Text>
          <Text style={styles.updateSub}>Real-time Scores</Text>
        </View>
      </View>
    </View>
  );
}

function Footer({ isDesktop }: { isDesktop: boolean }) {
  return (
    <View style={styles.footer}>
      <View style={[styles.footerInner, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        <Text style={styles.footerBrand}>SSF Kodasseri{'\n'}Sahithyolsav</Text>

        <View style={styles.footerLinks}>
          {['About Us', 'Contact', 'Terms of Service', 'Privacy Policy'].map((item) => (
            <Text key={item} style={styles.footerLink}>
              {item}
            </Text>
          ))}
        </View>

        <Text style={styles.copyright}>© 2024 SSF Kodasseri. All rights reserved.</Text>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 14px 28px rgba(15,23,42,0.07)' },
  default: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    minHeight: '100%',
    backgroundColor: '#F4F6F8',
  },
  navbar: {
    width: '100%',
    height: 80,
    borderBottomWidth: 1,
    borderBottomColor: '#C9CED8',
    backgroundColor: '#F4F6F8',
    paddingHorizontal: 48,
  },
  navInner: {
    width: '100%',
    maxWidth: 1184,
    height: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: '#050505',
    fontFamily: 'Poppins_900Black',
    lineHeight: 38,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  navText: {
    color: '#3E424A',
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    paddingBottom: 8,
  },
  activeNavText: {
    color: '#047A3A',
    borderBottomWidth: 2,
    borderBottomColor: '#047A3A',
  },
  loginButton: {
    borderRadius: 4,
    backgroundColor: '#050505',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loginText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
  },
  hero: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 66,
    paddingBottom: 128,
  },
  eyebrow: {
    color: '#46464F',
    fontFamily: 'Poppins_900Black',
    fontSize: 21,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
  titleBlock: {
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  scriptTitle: {
    color: '#FFFFFF',
    fontFamily: 'CooperBlack',
  },
  heroTitle: {
    marginTop: 42,
    color: '#050505',
    fontFamily: 'Poppins_900Black',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 22,
    maxWidth: 700,
    color: '#4D4F57',
    fontFamily: 'Poppins_400Regular',
    fontSize: 19,
    lineHeight: 28,
    textAlign: 'center',
  },
  actions: {
    marginTop: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  primaryButton: {
    minWidth: 199,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
  },
  secondaryButton: {
    minWidth: 165,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#C8CDD5',
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#111827',
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
  },
  buttonIcon: {
    marginLeft: 12,
  },
  statsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
  },
  statCard: {
    width: 238,
    height: 162,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9CED8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  statValue: {
    marginTop: 20,
    color: '#050505',
    fontFamily: 'Poppins_900Black',
    fontSize: 36,
    lineHeight: 42,
  },
  statLabel: {
    color: '#3F434B',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  liveCard: {
    position: 'relative',
    borderColor: '#22C55E',
    backgroundColor: '#F7F9FB',
  },
  livePill: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    marginRight: 6,
    borderRadius: 4,
    backgroundColor: '#70D99C',
  },
  liveText: {
    color: '#22C55E',
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  updateTitle: {
    marginTop: 22,
    color: '#050505',
    fontFamily: 'Poppins_700Bold',
    fontSize: 22,
  },
  updateSub: {
    marginTop: 2,
    color: '#4B5563',
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
  },
  footer: {
    width: '100%',
    backgroundColor: '#2A2F30',
    paddingHorizontal: 48,
    paddingVertical: 40,
  },
  footerInner: {
    width: '100%',
    maxWidth: 1184,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 32,
  },
  footerBrand: {
    color: '#F7F8FA',
    fontFamily: 'Poppins_900Black',
    fontSize: 30,
    lineHeight: 38,
  },
  footerLinks: {
    maxWidth: 360,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 28,
  },
  footerLink: {
    color: '#D1D5DB',
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
  },
  copyright: {
    maxWidth: 280,
    color: '#D1D5DB',
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    lineHeight: 26,
  },
});
