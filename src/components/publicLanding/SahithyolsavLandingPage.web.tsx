import React, { useState, useMemo, useEffect } from 'react';
import Head from 'expo-router/head';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';
import { usePublicPublishedResults, usePublicLeaderboard } from '../../core/hooks/useLeaderboard';
import { usePublicSchedule } from '../../core/hooks/useSchedule';

export function SahithyolsavLandingPage() {
  const router = useRouter();
  const { tenant_id: queryTenantId } = useLocalSearchParams<{ tenant_id?: string }>();
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = (Array.isArray(queryTenantId) ? queryTenantId[0] : queryTenantId) || authTenantId || null;

  const settingsQuery = useGetPublicLeaderboardSettings(tenantId);
  const festivalId = settingsQuery.data?.festival_id;

  const publishedResultsQuery = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);
  const organisationQuery = usePublicLeaderboard(tenantId, festivalId, !!tenantId && !!festivalId);
  const scheduleQuery = usePublicSchedule(festivalId, tenantId);

  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: any) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/participant-result?tenant_id=${tenantId}&query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Ticker Logic
  const tickerItems = useMemo(() => {
    if (!publishedResultsQuery.data || publishedResultsQuery.data.length === 0) return ["Welcome to Alviora - Sahithyolsav"];
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
    if (!organisationQuery.data) return [];
    const maxPoints = Math.max(...organisationQuery.data.map((r: any) => r.total_points), 1);
    return [...organisationQuery.data]
      .sort((a: any, b: any) => b.total_points - a.total_points)
      .slice(0, 5) // Display top 5 units
      .map((unit: any, index: number) => ({
        ...unit,
        rank: index + 1,
        percentage: Math.max((unit.total_points / maxPoints) * 100, 5) // At least 5% bar width
      }));
  }, [organisationQuery.data]);

  return (
    <div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-alviora-bg bg-pattern text-alviora-body font-body-md antialiased">
      <Head>
        <title>{settingsQuery.data?.public_festival_name || 'Sahithyolsav Festival'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@800&amp;display=swap" rel="stylesheet"/>
        <style>{`
          .marquee-container { overflow: hidden; white-space: nowrap; }
          .marquee-content { display: inline-block; animation: marquee 30s linear infinite; }
          @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
          .bg-pattern { background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 20px 20px; }
          @media (prefers-reduced-motion: no-preference) {
              .fade-in-up { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
              .fade-in-up.visible { opacity: 1; transform: translateY(0); }
              .hover-lift { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
              .hover-lift:hover { transform: scale(1.05); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
              @keyframes subtle-motion {
                  0%, 100% { color: #1C5FA8; text-shadow: 0 0 0 rgba(28,95,168,0); }
                  50% { color: #3b82f6; text-shadow: 0 0 12px rgba(59,130,246,0.3); }
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
      <nav className="bg-[#1C3338]/80 backdrop-blur-xl border-b border-alviora-border docked full-width top-10 sticky z-50 shadow-sm">
        <div className="flex justify-between items-center px-gutter py-4 max-w-container-max mx-auto">
          <a className="font-headline-lg text-headline-lg font-bold text-alviora-primary tracking-tighter" href="#">
            <span className="text-2xl uppercase" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>ALVIORA</span>
          </a>
          <div className="hidden md:flex gap-8">
            <a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#">About</a>
            <a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#live-schedule">Programs</a>
            <a className="text-alviora-primary font-bold border-b-2 border-alviora-primary font-title-md text-title-md" href="#leaderboard">Leaderboard</a>
            <a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href={`/public-result?tenant_id=${tenantId}`}>Results</a>
          </div>
          <div className="flex gap-4">
            <button onClick={() => router.push('/(auth)/login')} className="hidden md:block px-4 py-2 text-alviora-body hover:text-alviora-primary transition-colors font-title-md text-title-md">Login</button>
            <button className="hover-lift bg-alviora-primary text-white px-6 py-2 rounded-full font-title-md text-title-md hover:bg-alviora-accent-dim duration-150 ease-in-out shadow-sm">Register</button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="p-4 md:p-6 w-full max-w-full mx-auto fade-in-up visible">
          <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[85vh] flex items-center shadow-2xl border border-white/5 bg-black">
            
            {/* Background Video (Placeholder) */}
            <video 
              autoPlay 
              loop 
              muted 
              playsInline 
              className="absolute inset-0 w-full h-full object-cover z-0 opacity-50 mix-blend-screen"
            >
              {/* Note: Using a lightweight placeholder abstract video. User can replace the src below. */}
              <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4" />
            </video>
            
            {/* Dark Overlays for readability and matching theme */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1a1c]/95 via-[#1C3338]/80 to-transparent z-10"></div>
            <div className="absolute inset-0 bg-[#1C3338]/40 z-10"></div>
            
            {/* Top Right Logo Placeholder */}
            <div className="absolute top-8 right-8 md:top-12 md:right-12 z-30">
              <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-xl hover:scale-105 transition-transform duration-300">
                 <span className="material-symbols-outlined text-alviora-primary text-3xl md:text-5xl">dashboard_customize</span>
              </div>
            </div>

            {/* Left Aligned Content */}
            <div className="relative z-20 w-full p-8 md:p-16 lg:p-24 flex flex-col items-start text-left max-w-4xl">
              <div className="inline-flex items-center gap-2 bg-[#ffeedb]/10 text-[#f5d0a9] px-4 py-2 rounded-full mb-8 font-label-sm text-label-sm uppercase tracking-widest border border-[#f5d0a9]/20 shadow-sm backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-[#f5d0a9]"></span>
                SAHITHYOLSAV EDITION
              </div>
              
              <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-white mb-6 leading-tight font-bold">
                <span style={{fontFamily: "Barabara, sans-serif"}} className="uppercase tracking-wide">ALVIORA</span>:<br />
                Between <span className="text-alviora-primary animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>Pixels</span><br />
                and People
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

        {/* Quick Search */}
        <section className="px-gutter py-12 -mt-16 relative z-20 max-w-3xl mx-auto fade-in-up visible">
          <form onSubmit={handleSearch} className="bg-white/10 backdrop-blur-md p-8 rounded-xl shadow-lg border border-alviora-border">
            <h2 className="font-title-md text-title-md text-alviora-heading mb-4 text-center">Smart Participant Finder</h2>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-alviora-body">search</span>
              <input 
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-lg bg-black/20 border border-alviora-border focus:ring-2 focus:ring-alviora-primary focus:border-alviora-primary text-alviora-heading font-body-md text-body-md placeholder-alviora-body/60 outline-none" 
                placeholder="Enter Chest Number or Name..." 
                type="text"
              />
            </div>
            <p className="text-center font-label-sm text-label-sm text-alviora-body mt-3 uppercase tracking-wider">Find Live Status, Stage details, and Results instantly</p>
          </form>
        </section>

        {/* Live Schedule */}
        <section id="live-schedule" className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-2">Live Updates</h2>
              <p className="font-body-lg text-body-lg text-alviora-body">Current and upcoming programs across all stages.</p>
            </div>
            <div className="hidden md:flex gap-2">
              <button className="px-4 py-2 rounded-full border border-alviora-primary text-alviora-primary font-label-sm text-label-sm uppercase bg-alviora-primary/40 backdrop-blur-sm transition-colors">All Stages</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {liveSchedules.length > 0 ? liveSchedules.map((schedule: any, idx: number) => (
              <div key={idx} className="bg-white/5 border rounded-xl p-6 hover:shadow-md transition-shadow shadow-md border-outline-variant/50">
                <div className="flex justify-between items-center border-b border-alviora-border pb-4 mb-4">
                  <h3 className="font-title-md text-title-md text-alviora-heading font-bold">{schedule.venues?.name || `Stage ${idx + 1}`}</h3>
                  {schedule.status === 'Ongoing' && (
                    <span className="bg-error-container text-on-error-container px-3 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-error-container"></span>LIVE
                    </span>
                  )}
                </div>
                <div className="mb-6">
                  <p className="font-label-sm text-label-sm text-alviora-primary uppercase tracking-wider mb-2 font-bold">{schedule.status === 'Ongoing' ? 'Currently Playing' : 'Upcoming'}</p>
                  <h4 className="font-body-lg text-body-lg text-alviora-heading font-bold mb-1">{schedule.items?.name || 'Item'}</h4>
                  <p className="font-body-md text-body-md text-alviora-body">
                    Category: {schedule.items?.category_codes?.join(', ')} • {schedule.start_time ? new Date(schedule.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                  </p>
                </div>
              </div>
            )) : (
              <div className="col-span-1 md:col-span-2 text-center py-12 bg-white/5 rounded-xl border border-alviora-border">
                <p className="text-alviora-body font-title-md">No live or upcoming events at the moment.</p>
              </div>
            )}
          </div>
        </section>

        {/* Top Leaderboard */}
        <section id="leaderboard" className="bg-transparent backdrop-blur-sm py-section-gap px-gutter border-y border-alviora-border fade-in-up visible">
          <div className="max-w-container-max mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Unit Rankings</h2>
              <p className="font-body-lg text-body-lg text-alviora-body">Current point standings for the top institutions.</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md rounded-xl border border-alviora-border overflow-hidden shadow-md">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-alviora-border bg-black/20 font-label-sm text-label-sm text-alviora-body uppercase tracking-wider font-bold">
                <div className="col-span-2 md:col-span-1 text-center">Rank</div>
                <div className="col-span-6 md:col-span-7">Institution</div>
                <div className="col-span-2 hidden md:block text-center">Firsts</div>
                <div className="col-span-4 md:col-span-2 text-right">Points</div>
              </div>

              {topUnits.length > 0 ? topUnits.map((unit: any, idx: number) => (
                <div key={idx} className={`grid grid-cols-12 gap-4 p-4 md:p-6 border-b border-alviora-border items-center transition-colors ${idx === 0 ? 'bg-white/5 hover:bg-white/10' : 'hover:bg-white/5'}`}>
                  <div className={`col-span-2 md:col-span-1 text-center font-display-xl-mobile text-display-xl-mobile font-bold ${idx === 0 ? 'text-alviora-primary' : 'text-alviora-accent-dim'}`}>
                    {unit.rank}
                  </div>
                  <div className="col-span-6 md:col-span-7">
                    <h4 className="font-title-md text-title-md text-alviora-heading font-bold mb-2">{unit.name || unit.team_name || unit.organisation_name || 'Unit ' + (idx+1)}</h4>
                    <div className="w-full bg-alviora-border/50 h-1.5 rounded-full">
                      <div className={`${idx === 0 ? 'bg-alviora-primary' : 'bg-alviora-accent-dim'} h-1.5 rounded-full shadow-sm`} style={{width: `${unit.percentage}%`}}></div>
                    </div>
                  </div>
                  <div className="col-span-2 hidden md:block text-center font-body-md text-body-md text-alviora-body">{unit.first_place_count || 0}</div>
                  <div className={`col-span-4 md:col-span-2 text-right font-headline-lg text-headline-lg font-bold ${idx === 0 ? 'text-alviora-primary' : 'text-alviora-heading'}`}>
                    {unit.total_points || 0}
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-alviora-body">
                  Leaderboard data will appear here once results are published.
                </div>
              )}
            </div>
            
            {topUnits.length > 0 && (
              <div className="mt-8 text-center">
                <button className="hover-lift bg-white/10 backdrop-blur-sm border border-alviora-border text-alviora-heading px-8 py-3 rounded-full font-title-md text-title-md hover:bg-white/10 hover:text-alviora-primary transition-all inline-flex items-center gap-2 shadow-sm">
                  View Full Standings
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Festival Gallery (Bento Grid) */}
        <section className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-12 text-center">Festival Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[250px]">
            <div className="hover-lift md:col-span-2 md:row-span-2 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Exhibition" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-6 left-6 z-20">
                <span className="bg-alviora-primary px-3 py-1 rounded text-xs font-label-sm text-label-sm uppercase tracking-wider text-white mb-2 inline-block shadow-sm">Exhibition</span>
                <h3 className="font-title-md text-title-md text-white text-2xl font-bold shadow-sm">Digital Revelation</h3>
              </div>
            </div>
            <div className="hover-lift rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Calligraphy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Calligraphy Masterclass</h3>
              </div>
            </div>
            <div className="hover-lift rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Poetry" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Poetry Finals</h3>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-md border-t border-alviora-border full-width mt-section-gap">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter px-margin-desktop py-section-gap max-w-container-max mx-auto">
          <div>
            <a className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-alviora-primary mb-4 inline-block" href="#">
              <span className="text-3xl uppercase" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>ALVIORA</span>
            </a>
            <p className="font-body-md text-body-md text-alviora-body mt-4">Art Rooted in Revelation. A celebration of the sacred and the beautiful.</p>
          </div>
          <div className="lg:col-start-3">
            <h4 className="font-title-md text-title-md text-alviora-heading mb-6 font-bold">Quick Links</h4>
            <ul className="space-y-4 font-body-md text-body-md">
              <li><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Rules &amp; Guidelines</a></li>
              <li><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Credits</a></li>
              <li><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Privacy Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-title-md text-title-md text-alviora-heading mb-6 font-bold">Portal</h4>
            <ul className="space-y-4 font-body-md text-body-md">
              <li><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="/(auth)/login">Admin Login</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-alviora-border py-6 px-margin-desktop bg-transparent">
          <div className="max-w-container-max mx-auto text-center font-body-md text-body-md text-alviora-body">© 2024 Alviora - Quranic Art Festival. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
