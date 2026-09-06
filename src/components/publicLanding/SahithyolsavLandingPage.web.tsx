import React, { useState, useMemo, useEffect } from 'react';
import Head from 'expo-router/head';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';
import { usePublicPublishedResults, usePublicLeaderboard } from '../../core/hooks/useLeaderboard';
import { usePublicSchedule } from '../../core/hooks/useSchedule';
import { Swirling } from "@/components/loading-ui/swirling";

const InitialLoader = ({ isReady }: { isReady: boolean }) => {
  const [shouldRender, setShouldRender] = React.useState(true);

  React.useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => setShouldRender(false), 500); // Wait for fade out animation
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!shouldRender) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#1C3338] transition-opacity duration-500 ease-in-out ${isReady ? 'opacity-0' : 'opacity-100'}`}>
      <div className="flex flex-col items-center gap-8 fade-in-up visible">
        <span className="text-5xl uppercase tracking-widest text-alviora-primary keep-font drop-shadow-lg" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>
          ALVIORA
        </span>
        <Swirling className="w-16 h-16 text-white" />
        <p className="font-['Plus_Jakarta_Sans'] text-sm tracking-widest text-white/70 uppercase animate-pulse">Initializing Experience...</p>
      </div>
    </div>
  );
};

const VideoBackground = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  // Store a list of which videos have been loaded at least once
  const [loadedVideos, setLoadedVideos] = useState<number[]>([0]);

  const videos = [
    '/videos/leaderboard_1.mp4?v=1',
    '/videos/leaderboard_2.mp4?v=1'
  ];

  useEffect(() => {
    if (videos.length > 1) {
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          const next = (prev + 1) % videos.length;
          setLoadedVideos((loaded) => loaded.includes(next) ? loaded : [...loaded, next]);
          return next;
        });
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [videos.length]);

  return (
    <>
      {videos.map((src, index) => {
        const isActive = index === activeIndex;
        const isLoaded = loadedVideos.includes(index);
        return (
          <video
            key={src}
            // Only set src if it has been loaded
            src={isLoaded ? src : undefined}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover z-0 mix-blend-screen"
            style={{ opacity: isActive ? 0.5 : 0, transition: 'opacity 1.5s ease-in-out' }}
          />
        );
      })}
    </>
  );
};

export function SahithyolsavLandingPage({ page = 'landing' }: { page?: 'landing' | 'schedule' | 'units' | 'items' }) {
  const router = useRouter();
  const { tenant_id: queryTenantId } = useLocalSearchParams<{ tenant_id?: string }>();
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = (Array.isArray(queryTenantId) ? queryTenantId[0] : queryTenantId) || authTenantId || 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

  const settingsQuery = useGetPublicLeaderboardSettings(tenantId);
  const festivalId = settingsQuery.data?.festival_id;

  const publishedResultsQuery = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);
  const organisationQuery = usePublicLeaderboard(tenantId, festivalId, !!tenantId && !!festivalId);
  const scheduleQuery = usePublicSchedule(festivalId, tenantId);
  
  // Initial Splash Screen Logic
  const [isAppReady, setIsAppReady] = React.useState(false);
  React.useEffect(() => {
    // ONLY block on settings to show the Hero Section ASAP.
    // The other queries (organisation, results, schedule) can load in the background.
    const isDataLoaded = !settingsQuery.isLoading;
    if (isDataLoaded) {
      setIsAppReady(true);
    }
  }, [settingsQuery.isLoading]);

  // Removed artificial transition delay. We now rely only on actual data loading states.
  const isTransitioning = false;

  const [selectedSchedule, setSelectedSchedule] = React.useState<any>(null);
  const [activeFilter, setActiveFilter] = React.useState<string>('all');

  const uniqueDates = React.useMemo(() => {
    const dates = new Set<string>();
    const schedules = scheduleQuery.data || [];
    schedules.forEach((s: any) => {
      if (s.start_time) {
        dates.add(new Date(s.start_time).toDateString());
      }
    });
    return Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [scheduleQuery.data]);

  const filterTabs = React.useMemo(() => {
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'today', label: 'Today' },
      { id: 'tomorrow', label: 'Tomorrow' }
    ];
    uniqueDates.forEach(dateStr => {
      const formatted = new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const isToday = dateStr === new Date().toDateString();
      const isTomorrow = dateStr === new Date(Date.now() + 86400000).toDateString();
      if (!isToday && !isTomorrow) {
        tabs.push({ id: dateStr, label: formatted });
      }
    });
    return tabs;
  }, [uniqueDates]);

  const filteredSchedules = React.useMemo(() => {
    const schedules = scheduleQuery.data || [];
    if (page === 'landing') {
      const isFuture = (s: any) => s.status === 'Ongoing' || s.status === 'Upcoming' || (s.start_time && new Date(s.start_time).getTime() > Date.now());
      const future = schedules.filter(isFuture).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      const past = schedules.filter((s: any) => !isFuture(s)).sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      return [...future, ...past].slice(0, 12);
    }

    // For schedule page: filter by active tab
    if (activeFilter === 'all') return schedules;
    if (activeFilter === 'today') {
      return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === new Date().toDateString());
    }
    if (activeFilter === 'tomorrow') {
      return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === new Date(Date.now() + 86400000).toDateString());
    }
    return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === activeFilter);
  }, [scheduleQuery.data, activeFilter, page]);


  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: any) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/participant-result?tenant_id=${tenantId}&query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Ticker Logic
  const tickerItems = useMemo(() => {
    if (!publishedResultsQuery.data || publishedResultsQuery.data.length === 0) return ["Welcome to Alviora - ADSA Art Fiesta 2.0"];
    return publishedResultsQuery.data.slice(0, 10).map((r: any) => {
      const topWinner = r.participants?.find((p: any) => p.position === 1);
      return `RESULT PUBLISHED: ${r.item_name} ${r.participant_category_code ? `(${r.participant_category_code})` : ''} - 1st Place: ${topWinner?.name || 'Announced'}`;
    });
  }, [publishedResultsQuery.data]);
  
  const tickerString = tickerItems.join(' | ');

  // Schedule Logic
  const liveSchedules = useMemo(() => {
    if (!scheduleQuery.data) return [];
    return scheduleQuery.data
      .filter((s: any) => s.status === 'Ongoing' || s.status === 'Upcoming')
      .slice(0, 2);
  }, [scheduleQuery.data]);

  // Leaderboard Logic
  const topUnits = useMemo(() => {
    let data: any[] = organisationQuery.data || [];
    if (data.length === 0) {
      // Mock data for preview when no real data exists
      data = [
        { organisation_name: "Victoria", total_points: 0, first_place_count: 0, organisation_id: '1' },
        { organisation_name: "Gloria", total_points: 0, first_place_count: 0, organisation_id: '2' },
        { organisation_name: "Aurelia", total_points: 0, first_place_count: 0, organisation_id: '3' }
      ];
    }
    
    const maxPoints = Math.max(...data.map((r: any) => r.total_points), 1);
    return [...data]
      .sort((a: any, b: any) => b.total_points - a.total_points)
      .slice(0, page === 'units' ? undefined : 5) // Display all for units page, otherwise top 5
      .map((unit: any, index: number) => ({
        ...unit,
        rank: index + 1,
        percentage: Math.max((unit.total_points / maxPoints) * 100, 5) // At least 5% bar width
      }));
  }, [organisationQuery.data, page]);

  
  const stats = React.useMemo(() => {
    let campuses = 0;
    let competitors = 0;

    // Plan: Real campuses count
    if (organisationQuery.data) {
      campuses = organisationQuery.data.length;
    }

    // Plan: Real competitors count (falling back to 600 until registration API is integrated)
    if (publishedResultsQuery.data && publishedResultsQuery.data.length > 0) {
      const uniqueParticipants = new Set();
      publishedResultsQuery.data.forEach(result => {
        if ((result as any).participants) {
          (result as any).participants.forEach((p: any) => uniqueParticipants.add(p.chest_no || p.name));
        }
      });
      competitors = uniqueParticipants.size;
    }

    return { 
      days: 40, // Hardcoded as requested
      campuses: campuses > 0 ? campuses : 3, 
      events: 72, // Hardcoded until items API is available publicly
      competitors: competitors > 0 ? competitors : 600 
    };
  }, [organisationQuery.data, publishedResultsQuery.data]);

  const marqueeSchedules = React.useMemo(() => {
    if (filteredSchedules.length === 0) return [];
    const minCards = 12; // Ensure at least 12 cards to fill screen
    const items = [];
    while (items.length < minCards) {
      items.push(...filteredSchedules);
    }
    // Duplicate once more to ensure seamless scroll animation
    return [...items, ...items];
  }, [filteredSchedules]);

  // Determine if the current page's critical data is still loading
  const isPageDataLoading = React.useMemo(() => {
    if (settingsQuery.isLoading) return true;
    if (page === 'schedule' && scheduleQuery.isLoading) return true;
    if (page === 'units' && organisationQuery.isLoading) return true;
    if (page === 'items' && publishedResultsQuery.isLoading) return true;
    return false;
  }, [page, settingsQuery.isLoading, scheduleQuery.isLoading, organisationQuery.isLoading, publishedResultsQuery.isLoading]);

  return (
    <div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-alviora-bg text-alviora-body font-body-md antialiased">
      <InitialLoader isReady={isAppReady} />
      <Head>
        <title>{settingsQuery.data?.public_festival_name || 'ADSA Art Fiesta 2.0'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;family=Handjet:wght@100..900&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@800&amp;display=swap" rel="stylesheet"/>
        <style>{`
          .marquee-container { overflow: hidden; white-space: nowrap; }
          .marquee-content { display: inline-block; animation: marquee 30s linear infinite; }
          @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
          .schedule-marquee-container { display: flex; overflow: hidden; width: 100%; position: relative; }
          .schedule-marquee-track { display: flex; gap: 1.5rem; animation: schedule-marquee 90s linear infinite; width: max-content; }
          .schedule-marquee-container:hover .schedule-marquee-track { animation-play-state: paused; }
          @keyframes schedule-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50% - 0.75rem)); } }
          .handjet-wrapper, .handjet-wrapper *:not(.material-symbols-outlined):not(.keep-font) {
            font-family: "Handjet", sans-serif !important;
            font-variation-settings: "ELSH" 2 !important;
          }
          @media (prefers-reduced-motion: no-preference) {
              .fade-in-up { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
              .fade-in-up.visible { opacity: 1; transform: translateY(0); }
              .hover-lift { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
              .hover-lift:hover { transform: scale(1.05); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
              @keyframes subtle-motion {
                  0%, 100% { color: #009499; text-shadow: 0 0 0 rgba(0,148,153,0); }
                  50% { color: #00b3b8; text-shadow: 0 0 25px rgba(0,148,153,0.8); }
              }
              .animate-subtle-motion { animation: subtle-motion 3s ease-in-out infinite; display: inline-block; }
          }
          @media (prefers-reduced-motion: reduce) {
              .fade-in-up { opacity: 1; transform: none; }
              .hover-lift { transition: none; }
              .hover-lift:hover { transform: none; }
              .animate-subtle-motion { animation: none; }
          }
        `}</style>
      </Head>

      {/* TopAppBar (Ticker) */}
      <div className="bg-black/20 backdrop-blur-sm text-alviora-accent font-label-sm text-label-sm uppercase tracking-widest docked full-width top-0 z-[60] h-10 flex items-center px-margin-desktop overflow-hidden whitespace-nowrap border-b border-alviora-border">
        <div className="flex items-center gap-4 w-full max-w-container-max mx-auto marquee-container">
          <span className="material-symbols-outlined text-alviora-accent" style={{fontVariationSettings:"'FILL' 1"}}>sensors</span>
          <span className="marquee-content">{tickerString}</span>
        </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-[#1C3338]/80 backdrop-blur-xl border-b border-white/5 docked full-width top-0 sticky z-50 transition-all duration-300 shadow-sm">
        <div className="flex justify-between items-center px-gutter py-4 max-w-container-max mx-auto">
          <Link className="font-headline-lg text-headline-lg font-bold text-alviora-primary tracking-tighter" href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}>
            <span className="text-2xl uppercase keep-font" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>ALVIORA</span>
          </Link>
          <div className="hidden md:flex gap-8 handjet-wrapper">
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'landing' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}>Home</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'schedule' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/schedule?tenant_id=${tenantId}`}>Schedule</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'units' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/unit-rankings?tenant_id=${tenantId}`}>Teams</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'items' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/item-results?tenant_id=${tenantId}`}>Results</Link>
          </div>
          <div className="flex gap-4 handjet-wrapper">
            <button onClick={() => router.push('/(auth)/login')} className="hidden md:block px-4 py-2 font-bold text-lg uppercase tracking-widest text-white hover:text-gray-200 transition-colors">Admin</button>
            <button className="hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Register</button>
          </div>
        </div>
      </nav>

      <main>
        {isPageDataLoading && page !== 'landing' ? (
          <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center gap-6 fade-in-up visible">
            <Swirling className="w-16 h-16 text-white" />
            <p className="font-['Plus_Jakarta_Sans'] text-sm tracking-widest text-[#c69a53] uppercase animate-pulse">Loading Content...</p>
          </div>
        ) : (
          <>
          {page === 'landing' && (<>{/* Hero Section */}
        <section className="p-4 md:p-6 w-full max-w-full mx-auto fade-in-up visible hero-section">
          <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[85vh] flex items-center shadow-2xl border border-white/5 bg-black">
            
            {/* Background Video using Load Manager */}
            <VideoBackground />
            
            {/* Dark Overlays for readability and matching theme */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a1c]/95 via-[#1C3338]/80 to-transparent z-10"></div>
            <div className="absolute inset-0 bg-[#1C3338]/40 z-10"></div>
            
            {/* Top Right Logo Placeholder */}
            <div className="absolute top-8 right-8 md:top-12 md:right-12 z-30">
              <div className="relative w-20 h-20 md:w-28 md:h-28 rounded-full bg-black/10 backdrop-blur-sm border border-white/5 shadow-xl hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img 
                  src="/images/logo-9.png" 
                  alt="Logo" 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] h-[95%] object-contain mix-blend-screen"
                />
              </div>
            </div>

            {/* Left Aligned Content */}
            <div className="relative z-20 w-full p-8 md:p-16 lg:p-24 flex flex-col items-start text-left max-w-4xl">
              <div className="inline-flex items-center gap-2 bg-[#ffeedb]/10 text-[#f5d0a9] px-4 py-2 rounded-full mb-8 font-label-sm text-label-sm uppercase tracking-widest border border-[#f5d0a9]/20 shadow-sm backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-[#f5d0a9]"></span>
                ADSA ART FIESTA 2.0
              </div>
              
              <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-white mb-6 leading-tight font-bold">
                <span style={{fontFamily: "Barabara, sans-serif"}} className="uppercase tracking-wide">ALVIORA</span><br />
                Between <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>Pixels</span><br />
                and <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>People</span>
              </h1>
              
              <p className="font-body-lg text-body-lg text-white/80 mb-10 max-w-2xl leading-relaxed">
                Where the eternal word meets the universal language of art. A celebration of sacred expression and creative excellence.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-start items-center w-full sm:w-auto">
                <a href="#leaderboard" className="hover-lift w-full sm:w-auto bg-alviora-primary text-white px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#154a85] transition-all flex items-center justify-center gap-2 shadow-md">
                  <span className="material-symbols-outlined">emoji_events</span>
                  View Leaderboard
                </a>
                <a href="#live-schedule" className="hover-lift w-full sm:w-auto border border-white/20 text-white px-8 py-4 rounded-full font-title-md text-title-md hover:bg-white/10 transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                  <span className="material-symbols-outlined">calendar_today</span>
                  Today's Schedule
                </a>
              </div>
            </div>
          </div>
        </section>

        
        {/* Stats Section */}
        <section className="bg-transparent py-8 md:py-12 relative z-20 overflow-hidden handjet-wrapper">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8">
            <div className="flex flex-row flex-wrap md:flex-nowrap justify-between items-center gap-4 md:gap-8 fade-in-up visible">
              
              {/* Stat 1 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 group min-w-[20%]">
                <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform shadow-lg">
                  <span className="material-symbols-outlined text-[#c69a53] text-[3rem] md:text-[5rem]">calendar_month</span>
                </div>
                <div className="text-center">
                  <div className="font-headline-lg font-bold text-4xl md:text-7xl text-white mb-2 leading-none tracking-tight">{stats.days < 10 ? '0'+stats.days : stats.days}</div>
                  <div className="text-[10px] md:text-sm tracking-[0.2em] md:tracking-[0.25em] uppercase font-bold text-white/70">DAYS</div>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 group min-w-[20%]">
                <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform shadow-lg">
                  <span className="material-symbols-outlined text-[#f5a9a9] text-[3rem] md:text-[5rem]">apartment</span>
                </div>
                <div className="text-center">
                  <div className="font-headline-lg font-bold text-4xl md:text-7xl text-white mb-2 leading-none tracking-tight">{stats.campuses < 10 ? '0'+stats.campuses : stats.campuses}</div>
                  <div className="text-[10px] md:text-sm tracking-[0.2em] md:tracking-[0.25em] uppercase font-bold text-white/70">TEAMS</div>
                </div>
              </div>

              {/* Stat 3 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 group min-w-[20%]">
                <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform shadow-lg">
                  <span className="material-symbols-outlined text-[#a9f5d0] text-[3rem] md:text-[5rem]">local_activity</span>
                </div>
                <div className="text-center">
                  <div className="font-headline-lg font-bold text-4xl md:text-7xl text-white mb-2 leading-none tracking-tight">100+</div>
                  <div className="text-[10px] md:text-sm tracking-[0.2em] md:tracking-[0.25em] uppercase font-bold text-white/70">ITEMS</div>
                </div>
              </div>

              {/* Stat 4 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 group min-w-[20%]">
                <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform shadow-lg">
                  <span className="material-symbols-outlined text-[#a9c5f5] text-[3rem] md:text-[5rem]">emoji_events</span>
                </div>
                <div className="text-center">
                  <div className="font-headline-lg font-bold text-4xl md:text-7xl text-white mb-2 leading-none tracking-tight">40+</div>
                  <div className="text-[10px] md:text-sm tracking-[0.2em] md:tracking-[0.25em] uppercase font-bold text-white/70">PARTICIPANTS</div>
                </div>
              </div>
            </div>
          </div>
        </section></>)}
        {/* Live Schedule */}
        {(page === 'landing' || page === 'schedule') && (
        <section id="live-schedule" className="px-gutter pt-4 md:pt-8 pb-section-gap max-w-[1400px] mx-auto fade-in-up visible handjet-wrapper">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-2 font-bold">{page === 'schedule' ? 'Festival Schedule' : 'Event Schedule'}</h2>
              <p className="font-body-lg text-body-lg text-alviora-body">All scheduled programs across stages.</p>
            </div>
          </div>
          
          {page === 'schedule' && (
            <div className="flex flex-wrap gap-2 mb-8">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-4 py-2 rounded-full font-title-sm text-title-sm transition-all ${
                    activeFilter === tab.id 
                      ? 'bg-alviora-primary text-white shadow-md' 
                      : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {page === 'landing' ? (
            <div className="schedule-marquee-container -mx-4 px-4 overflow-hidden">
              <div className="schedule-marquee-track">
                {marqueeSchedules.length > 0 ? marqueeSchedules.map((schedule: any, idx: number) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedSchedule(schedule)}
                    className="bg-white/5 border border-white/10 hover:border-alviora-primary/50 hover:bg-white/10 rounded-xl p-6 cursor-pointer transition-all shadow-md group flex flex-col justify-between min-h-[160px] w-[280px] sm:w-[320px] shrink-0"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <span className={`inline-block px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 ${
                          (schedule.status || '').toLowerCase() === 'ongoing' 
                            ? 'bg-error-container text-on-error-container' 
                            : (schedule.status || '').toLowerCase() === 'completed' 
                              ? 'bg-[#a9f5d0]/20 text-[#a9f5d0]' 
                              : (schedule.is_published === true || (schedule.status || '').toLowerCase() === 'published')
                                ? 'bg-green-500/20 text-green-400'
                                : (schedule.has_results === true || schedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((schedule.status || '').toLowerCase()))
                                  ? 'bg-[#c69a53]/20 text-[#c69a53]'
                                  : 'bg-alviora-primary/20 text-alviora-primary'
                        }`}>
                          {
                            (schedule.is_published === true || (schedule.status || '').toLowerCase() === 'published') ? 'PUBLISHED' :
                            (schedule.has_results === true || schedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((schedule.status || '').toLowerCase())) ? 'VERIFICATION PENDING' :
                            schedule.status || 'Scheduled'
                          }
                        </span>
                        <span className="text-white/50 text-xs flex items-center gap-1 font-mono">
                          <span className="material-symbols-outlined text-[14px]">schedule</span>
                          {schedule.start_time ? new Date(schedule.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBA'}
                        </span>
                      </div>
                      <h3 className="font-title-lg text-title-lg text-white font-bold mb-3 group-hover:text-alviora-primary transition-colors line-clamp-2 leading-tight">
                        {schedule.items?.item_name_en || schedule.items?.name || 'Event Item'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-alviora-body text-xs mt-2 border-t border-white/10 pt-3">
                      <span className="material-symbols-outlined text-[16px] text-alviora-primary">location_on</span>
                      <span className="truncate">{schedule.venues?.name || `Stage ${idx % filteredSchedules.length + 1}`}</span>
                    </div>
                  </div>
                )) : (
                  <div className="w-full text-center py-16 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-white/20 mb-4">event_busy</span>
                    <p className="text-alviora-body font-title-md">No events scheduled at the moment.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredSchedules.length > 0 ? filteredSchedules.map((schedule: any, idx: number) => (
                <div 
                  key={idx} 
                  onClick={() => setSelectedSchedule(schedule)}
                  className="bg-white/5 border border-white/10 hover:border-alviora-primary/50 hover:bg-white/10 rounded-xl p-6 cursor-pointer transition-all shadow-md group flex flex-col justify-between min-h-[160px]"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 ${
                        (schedule.status || '').toLowerCase() === 'ongoing' 
                          ? 'bg-error-container text-on-error-container' 
                          : (schedule.status || '').toLowerCase() === 'completed' 
                            ? 'bg-[#a9f5d0]/20 text-[#a9f5d0]' 
                            : (schedule.is_published === true || (schedule.status || '').toLowerCase() === 'published')
                              ? 'bg-green-500/20 text-green-400'
                              : (schedule.has_results === true || schedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((schedule.status || '').toLowerCase()))
                                ? 'bg-[#c69a53]/20 text-[#c69a53]'
                                : 'bg-alviora-primary/20 text-alviora-primary'
                      }`}>
                        {
                          (schedule.is_published === true || (schedule.status || '').toLowerCase() === 'published') ? 'PUBLISHED' :
                          (schedule.has_results === true || schedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((schedule.status || '').toLowerCase())) ? 'VERIFICATION PENDING' :
                          schedule.status || 'Scheduled'
                        }
                      </span>
                      <span className="text-white/50 text-xs flex items-center gap-1 font-mono">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        {schedule.start_time ? new Date(schedule.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBA'}
                      </span>
                    </div>
                    <h3 className="font-title-lg text-title-lg text-white font-bold mb-3 group-hover:text-alviora-primary transition-colors line-clamp-2 leading-tight">
                      {schedule.items?.item_name_en || schedule.items?.name || 'Event Item'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-alviora-body text-xs mt-2 border-t border-white/10 pt-3">
                    <span className="material-symbols-outlined text-[16px] text-alviora-primary">location_on</span>
                    <span className="truncate">{schedule.venues?.name || `Stage ${idx + 1}`}</span>
                  </div>
                </div>
              )) : (
                <div className="col-span-full text-center py-16 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-white/20 mb-4">event_busy</span>
                  <p className="text-alviora-body font-title-md">No events scheduled at the moment.</p>
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {/* Schedule Modal */}
        {selectedSchedule && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSchedule(null)}></div>
            <div className="relative bg-[#1C3338] border border-white/10 rounded-3xl max-w-lg w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setSelectedSchedule(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
              
              <div className="mb-6 pr-8">
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 ${
                  (selectedSchedule.status || '').toLowerCase() === 'ongoing' 
                    ? 'bg-error-container text-on-error-container' 
                    : (selectedSchedule.status || '').toLowerCase() === 'completed' 
                      ? 'bg-[#a9f5d0]/20 text-[#a9f5d0]' 
                      : (selectedSchedule.is_published === true || (selectedSchedule.status || '').toLowerCase() === 'published')
                        ? 'bg-green-500/20 text-green-400'
                        : (selectedSchedule.has_results === true || selectedSchedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((selectedSchedule.status || '').toLowerCase()))
                          ? 'bg-[#c69a53]/20 text-[#c69a53]'
                          : 'bg-alviora-primary/20 text-alviora-primary'
                }`}>
                  {
                    (selectedSchedule.is_published === true || (selectedSchedule.status || '').toLowerCase() === 'published') ? 'PUBLISHED' :
                    (selectedSchedule.has_results === true || selectedSchedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((selectedSchedule.status || '').toLowerCase())) ? 'VERIFICATION PENDING' :
                    selectedSchedule.status || 'Scheduled'
                  }
                </span>
                <h2 className="text-3xl font-bold text-white mb-2 leading-tight">{selectedSchedule.items?.item_name_en || selectedSchedule.items?.name || 'Event Item'}</h2>
                {selectedSchedule.items?.category_name && (
                  <p className="text-alviora-primary text-sm font-bold uppercase tracking-wider">Category: {selectedSchedule.items?.category_name}</p>
                )}
              </div>
              
              {/* Dynamic Status Alert Block */}
              {(() => {
                let stage = {
                  title: "Scheduled",
                  description: "This event is scheduled but has not started yet.",
                  bgColor: "bg-[#009499]/10", borderColor: "border-[#009499]/30", textColor: "text-[#009499]", icon: "schedule"
                };

                const schedStatus = (selectedSchedule.status || '').toLowerCase();
                const resStatus = (selectedSchedule.result_status || selectedSchedule.items?.result_status || '').toLowerCase();
                
                const isPublished = selectedSchedule.is_published === true || selectedSchedule.items?.result_published || schedStatus === 'published' || resStatus === 'published';
                const isUnderVerification = selectedSchedule.has_results === true || ['mark submitted', 'checking pending', 'checking completed', 'mark_submitted', 'checking_pending', 'checking_completed'].includes(schedStatus) || ['mark_submitted', 'checking_pending', 'checking_completed'].includes(resStatus);

                if (isPublished) {
                  stage = {
                    title: "Results Published",
                    description: "The results for this event are now available on the public leaderboard.",
                    bgColor: "bg-green-500/10", borderColor: "border-green-500/30", textColor: "text-green-400", icon: "verified"
                  };
                } else if (isUnderVerification) {
                  stage = {
                    title: "Results Under Verification",
                    description: "Results are currently being verified and will be published soon.",
                    bgColor: "bg-[#c69a53]/10", borderColor: "border-[#c69a53]/30", textColor: "text-[#c69a53]", icon: "rule"
                  };
                } else if (schedStatus === 'completed') {
                  stage = {
                    title: "Competition Ended",
                    description: "This event has successfully concluded. Awaiting evaluations.",
                    bgColor: "bg-[#c69a53]/10", borderColor: "border-[#c69a53]/30", textColor: "text-[#c69a53]", icon: "task_alt"
                  };
                } else if (schedStatus === 'ongoing') {
                  stage = {
                    title: "Live Now",
                    description: "This competition is currently happening at the venue.",
                    bgColor: "bg-red-500/10", borderColor: "border-red-500/30", textColor: "text-red-400", icon: "sensors"
                  };
                }

                return (
                  <div className={`mb-6 ${stage.bgColor} border ${stage.borderColor} rounded-xl p-4 flex items-start gap-3 shadow-sm backdrop-blur-sm`}>
                    <span className={`material-symbols-outlined ${stage.textColor}`}>{stage.icon}</span>
                    <div>
                      <div className={`${stage.textColor} font-bold text-sm`}>{stage.title}</div>
                      <div className={`${stage.textColor} opacity-80 text-xs mt-1`}>{stage.description}</div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-5 mb-8 bg-black/20 p-5 rounded-2xl border border-white/5">
                <div className="flex items-start gap-4 text-alviora-body">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white">location_on</span>
                  </div>
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Venue</div>
                    <div className="text-white font-medium text-lg">{selectedSchedule.venues?.name || 'TBA'}</div>
                    {selectedSchedule.venues?.location && <div className="text-sm mt-1">{selectedSchedule.venues.location}</div>}
                  </div>
                </div>
                
                <div className="h-[1px] w-full bg-white/5"></div>
                
                <div className="flex items-start gap-4 text-alviora-body">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white">event</span>
                  </div>
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Time & Date</div>
                    <div className="text-white font-medium text-lg">
                      {selectedSchedule.start_time ? new Date(selectedSchedule.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBA'} 
                      {selectedSchedule.end_time ? ` - ${new Date(selectedSchedule.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
                    </div>
                    <div className="text-sm mt-1">{selectedSchedule.start_time ? new Date(selectedSchedule.start_time).toLocaleDateString([], {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'}) : ''}</div>
                  </div>
                </div>
                
                {selectedSchedule.judges && (
                  <>
                    <div className="h-[1px] w-full bg-white/5"></div>
                    <div className="flex items-start gap-4 text-alviora-body">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white">gavel</span>
                      </div>
                      <div>
                        <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Assigned Judges</div>
                        <div className="text-white font-medium">
                          {Array.isArray(selectedSchedule.judges) ? selectedSchedule.judges.map((j:any) => j.name || j).join(', ') : selectedSchedule.judges}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <button 
                onClick={() => setSelectedSchedule(null)}
                className="w-full bg-white hover:bg-gray-200 text-black py-4 rounded-xl font-bold transition-colors shadow-lg"
              >
                Close Details
              </button>
            </div>
          </div>
        )}

        {/* Top Leaderboard */}
        {(page === 'landing' || page === 'units') && (
        <section id="leaderboard" className={`bg-transparent backdrop-blur-sm py-section-gap px-gutter border-alviora-border fade-in-up visible ${page === 'units' ? '' : 'border-y'}`}>
          <div className="max-w-container-max mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Team Rankings</h2>
              <p className="font-body-lg text-body-lg text-alviora-body">Current point standings for the top institutions.</p>
            </div>
            
            <div className="bg-[#1f383e] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 bg-[#182d31] font-label-sm text-label-sm text-white/50 uppercase tracking-widest font-bold">
                <div className="col-span-2 text-center font-['Plus_Jakarta_Sans']">Rank</div>
                <div className="col-span-6 font-['Plus_Jakarta_Sans']">Teams</div>
                <div className="col-span-4 text-right font-['Plus_Jakarta_Sans']">Points</div>
              </div>

              {topUnits.length > 0 ? topUnits.map((unit: any, idx: number) => (
                <div key={idx} className="grid grid-cols-12 gap-4 p-4 md:px-6 md:py-8 border-b border-white/5 items-center bg-[#1c3338]/50 hover:bg-[#1f383e] transition-colors">
                  <div className={`col-span-2 text-center font-['Syne'] text-2xl md:text-3xl font-extrabold ${idx < 3 ? 'text-[#c69a53]' : 'text-white/40'}`}>
                    {unit.rank}
                  </div>
                  <div className="col-span-6 pr-4">
                    <h4 className="font-['Plus_Jakarta_Sans'] text-base md:text-lg text-white font-bold mb-3">{unit.name || unit.team_name || unit.organisation_name || 'Team ' + (idx+1)}</h4>
                    <div className="w-full bg-white/5 h-1.5 rounded-full">
                      <div className={`h-1.5 rounded-full shadow-sm ${idx < 3 ? 'bg-[#c69a53]' : 'bg-white/20'}`} style={{width: `${unit.percentage}%`}}></div>
                    </div>
                  </div>
                  <div className="col-span-4 text-right font-['Syne'] text-3xl md:text-4xl font-extrabold text-white">
                    {unit.total_points || 0}
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-white/50">
                  Leaderboard data will appear here once results are published.
                </div>
              )}
            </div>
            
            {page === 'landing' && topUnits.length > 0 && (
              <div className="mt-8 text-center">
                <button onClick={() => router.push(`/leaderboard/unit-rankings?tenant_id=${tenantId}`)} className="hover-lift bg-white/10 backdrop-blur-sm border border-alviora-border text-alviora-heading px-8 py-3 rounded-full font-title-md text-title-md hover:bg-white/10 hover:text-alviora-primary transition-all inline-flex items-center gap-2 shadow-sm">
                  View Full Standings
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Item Results Section */}
        {page === 'items' && (
        <section id="item-results" className="bg-transparent backdrop-blur-sm py-section-gap px-gutter border-alviora-border fade-in-up visible">
          <div className="max-w-container-max mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Published Results</h2>
              <p className="font-body-lg text-body-lg text-alviora-body">Latest competition results.</p>
            </div>
            
            <div className="space-y-6">
              {publishedResultsQuery.data && publishedResultsQuery.data.length > 0 ? publishedResultsQuery.data.map((result: any, idx: number) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-md">
                  <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">{result.item_name}</h3>
                      {result.participant_category_code && <span className="text-alviora-primary text-sm font-bold uppercase tracking-wider">{result.participant_category_code}</span>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {result.participants && [...result.participants].sort((a:any,b:any) => a.position - b.position).map((p: any, pIdx: number) => (
                      <div key={pIdx} className="flex items-center gap-4 bg-black/20 p-3 rounded-lg border border-white/5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${p.position === 1 ? 'bg-[#FBBF24] text-black' : p.position === 2 ? 'bg-[#D1D5DB] text-black' : p.position === 3 ? 'bg-[#D97706] text-white' : 'bg-white/10 text-white'}`}>
                          {p.position}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-white">{p.name || p.chest_no}</div>
                          {p.grade && <div className="text-xs text-white/60">Grade: {p.grade}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-alviora-body bg-white/5 rounded-xl border border-white/10">
                  No results published yet.
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* Festival Gallery (Bento Grid) */}
        {false && page === 'landing' && (
        <section className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible handjet-wrapper">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-12 text-center">Festival Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[250px]">
            {/* Item 1 - 2x2 Large */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-2 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Exhibition" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-6 left-6 z-20">
                <span className="bg-alviora-primary px-3 py-1 rounded text-xs font-label-sm text-label-sm uppercase tracking-wider text-white mb-2 inline-block shadow-sm">Exhibition</span>
                <h3 className="font-title-md text-title-md text-white text-2xl font-bold shadow-sm">Digital Revelation</h3>
              </div>
            </div>
            {/* Item 2 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Calligraphy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Calligraphy</h3>
              </div>
            </div>
            {/* Item 3 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Poetry" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Poetry</h3>
              </div>
            </div>
            {/* Item 4 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Digital Art" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Digital Art</h3>
              </div>
            </div>
            {/* Item 5 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Music" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Musical Ensemble</h3>
              </div>
            </div>
            {/* Item 6 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Theatre" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Live Theatre</h3>
              </div>
            </div>
            {/* Item 7 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Storytelling" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Storytelling</h3>
              </div>
            </div>
          </div>
        </section>
        )}
        </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-black/40 backdrop-blur-md border-t border-white/5 full-width mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-gutter py-8 max-w-container-max mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start">
            <a className="font-bold tracking-tighter inline-block" href="#">
              <span className="text-2xl uppercase keep-font" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#c69a53"}}>ALVIORA</span>
            </a>
            <p className="font-['Plus_Jakarta_Sans'] text-sm text-white/50 mt-2">Art Rooted in Revelation. A celebration of the sacred and the beautiful.</p>
          </div>
          
          <div className="flex gap-4">
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">language</span>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">photo_camera</span>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">play_circle</span>
            </a>
          </div>
        </div>
        
        <div className="border-t border-white/5 py-4 px-gutter bg-transparent">
          <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
            <div className="font-['Plus_Jakarta_Sans'] text-xs text-white/40">© 2024 Alviora - Quranic Art Festival. All rights reserved.</div>
            <div className="flex gap-4 font-['Plus_Jakarta_Sans'] text-xs text-white/40">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
