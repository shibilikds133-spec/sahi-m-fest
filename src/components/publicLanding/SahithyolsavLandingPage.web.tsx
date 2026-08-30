import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SahithyolsavLandingPage() {
  return (
    <>
      
{/*  TopAppBar (Ticker)  */}
<div className="bg-alviora-surface/90 backdrop-blur-sm text-alviora-accent font-label-sm text-label-sm uppercase tracking-widest docked full-width top-0 z-[60] h-10 flex items-center px-margin-desktop overflow-hidden whitespace-nowrap border-b border-alviora-border">
<div className="flex items-center gap-4 w-full max-w-container-max mx-auto marquee-container">
<span className="material-symbols-outlined text-alviora-accent" style={{"fontVariationSettings":"'FILL' 1"}}>sensors</span>
<span className="marquee-content">LIVE RESULTS: Stage 1 - Calligraphy Finals underway | Stage 2 - Nasheed Junior Category results announced | RESULT PUBLISHED: [JN-C871] News Reading | NEXT EVENT: Stage 1 - Quran Recitation at 2:00 PM</span>
</div>
</div>
{/*  TopNavBar  */}
<nav className="bg-alviora-bg/80 backdrop-blur-xl border-b border-alviora-border docked full-width top-10 sticky z-50 shadow-sm">
<div className="flex justify-between items-center px-gutter py-4 max-w-container-max mx-auto">
<a className="font-headline-lg text-headline-lg font-black text-alviora-primary tracking-tighter" href="#"><span className="text-2xl uppercase" style={{"fontFamily":"'Syne', sans-serif","fontWeight":"800","letterSpacing":"-0.05em","color":"#000000"}}>ALVIORA</span></a>
<div className="hidden md:flex gap-8">
<a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#">About</a>
<a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#">Programs</a>
<a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#">Timeline</a>
<a className="text-alviora-primary font-bold border-b-2 border-alviora-primary font-title-md text-title-md" href="#">Leaderboard</a>
<a className="text-alviora-body hover:text-alviora-primary transition-colors duration-200 font-title-md text-title-md" href="#">Results</a>
</div>
<div className="flex gap-4">
<button className="hidden md:block px-4 py-2 text-alviora-body hover:text-alviora-primary transition-colors font-title-md text-title-md">Login</button>
<button className="hover-lift bg-alviora-primary text-white px-6 py-2 rounded-full font-title-md text-title-md hover:bg-alviora-accent-dim duration-150 ease-in-out shadow-sm">Register</button>
</div>
</div>
</nav>
<main>
{/*  Hero Section  */}
<section className="relative min-h-[80vh] flex items-center justify-center px-gutter py-section-gap bg-pattern">
<div className="max-w-container-max mx-auto text-center z-10 relative fade-in-up visible">
<div className="inline-flex items-center gap-2 bg-error-container text-on-error-container px-4 py-1.5 rounded-full mb-8 font-label-sm text-label-sm uppercase tracking-widest border border-on-error-container/20">
<span className="w-2 h-2 rounded-full bg-on-error-container"></span>
                    LIVE NOW
                </div>
<h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-alviora-heading mb-8 max-w-4xl mx-auto leading-tight">Alviora: Between <span className="text-alviora-primary animate-subtle-motion" style={{"fontFamily":"VT323, monospace"}}>Pixels</span> and People</h1>
<p className="font-body-lg text-body-lg text-alviora-body mb-12 max-w-2xl mx-auto">
                    Where the eternal word meets the universal language of art. A celebration of sacred expression and creative excellence.
                </p>
<div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
<button className="hover-lift w-full sm:w-auto bg-alviora-primary text-white px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#154a85] transition-all flex items-center justify-center gap-2 shadow-md">
<span className="material-symbols-outlined">emoji_events</span>
                        View Leaderboard
                    </button>
<button className="hover-lift w-full sm:w-auto border border-alviora-border text-alviora-body px-8 py-4 rounded-full font-title-md text-title-md hover:bg-alviora-surface hover:text-alviora-heading transition-all flex items-center justify-center gap-2 bg-white/90 backdrop-blur-sm shadow-sm">
<span className="material-symbols-outlined">calendar_today</span>
                        Today's Schedule
                    </button>
</div>
</div>
<div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden select-none z-0"><img alt="Alviora Brand Watermark" className="absolute w-full h-full object-contain opacity-5 select-none pointer-events-none scale-150 transform-gpu" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZqEKHYfZstez4tT0Xt8USRt-bU3DH9DJivIMo2yb6CMGXC9oPTuJgBkDhXYsGqfqNK19f3WIUhO67QnkAtOa_N0out17FZjvmEZG5XCzfJ93cRiVdCi566str0WK_J-q3NR0cpDfZt7kWyuaD2sLOXNaQF4QZtrkfXyw23Dn7x3d0fZba3qBsy5B2-XzFqOQgPOFAxHFar4HQe4JIt7x5qKubiZRtDOY-bDHCfo59iCIH9-8EGMLJ3V00rs8Yl0IN"/>
</div>
</section>
{/*  Quick Search  */}
<section className="px-gutter py-12 -mt-16 relative z-20 max-w-3xl mx-auto fade-in-up visible">
<div className="bg-white/90 backdrop-blur-md p-8 rounded-xl shadow-lg border border-alviora-border">
<h2 className="font-title-md text-title-md text-alviora-heading mb-4 text-center">Smart Participant Finder</h2>
<div className="relative">
<span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-alviora-body">search</span>
<input className="w-full pl-12 pr-4 py-4 rounded-lg bg-alviora-surface/50 border border-alviora-border focus:ring-2 focus:ring-alviora-primary focus:border-alviora-primary text-alviora-heading font-body-md text-body-md placeholder-alviora-body/60 outline-none" placeholder="Enter Chest Number or Name..." type="text"/>
</div>
<p className="text-center font-label-sm text-label-sm text-alviora-body mt-3 uppercase tracking-wider">Find Live Status, Stage details, and Results instantly</p>
</div>
</section>
{/*  Live Schedule  */}
<section className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible">
<div className="flex justify-between items-end mb-12">
<div>
<h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-2">Live Updates</h2>
<p className="font-body-lg text-body-lg text-alviora-body">Current and upcoming programs across all stages.</p>
</div>
<div className="hidden md:flex gap-2">
<button className="px-4 py-2 rounded-full border border-alviora-primary text-alviora-primary font-label-sm text-label-sm uppercase bg-blue-50/80 backdrop-blur-sm transition-colors">All Stages</button>
<button className="px-4 py-2 rounded-full border border-alviora-border text-alviora-body font-label-sm text-label-sm uppercase hover:bg-alviora-surface transition-colors bg-white/80 backdrop-blur-sm">Stage 1</button>
<button className="px-4 py-2 rounded-full border border-alviora-border text-alviora-body font-label-sm text-label-sm uppercase hover:bg-alviora-surface transition-colors bg-white/80 backdrop-blur-sm">Stage 2</button>
</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
{/*  Stage 1 Card  */}
<div className="bg-surface-container-lowest border rounded-xl p-6 hover:shadow-md transition-shadow shadow-md border-outline-variant/50">
<div className="flex justify-between items-center border-b border-alviora-border pb-4 mb-4">
<h3 className="font-title-md text-title-md text-alviora-heading font-bold">Stage 1: Grand Marquee</h3>
<span className="bg-error-container text-on-error-container px-3 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-on-error-container"></span>LIVE</span>
</div>
<div className="mb-6">
<p className="font-label-sm text-label-sm text-alviora-primary uppercase tracking-wider mb-2 font-bold">Currently Playing</p>
<h4 className="font-body-lg text-body-lg text-alviora-heading font-bold mb-1">Quran Recitation (Senior)</h4>
<p className="font-body-md text-body-md text-alviora-body">Participant: #QR-402 • Started at 10:30 AM</p>
</div>
<div className="bg-alviora-surface/50 p-4 rounded-lg border border-alviora-border">
<p className="font-label-sm text-label-sm text-alviora-body uppercase tracking-wider mb-2">Up Next</p>
<div className="flex justify-between items-center">
<h4 className="font-body-md text-body-md text-alviora-heading font-semibold">Elocution English</h4>
<span className="font-body-md text-body-md text-alviora-body font-medium">11:15 AM</span>
</div>
</div>
</div>
{/*  Stage 2 Card  */}
<div className="bg-surface-container-lowest border rounded-xl p-6 hover:shadow-md transition-shadow shadow-md border-outline-variant/50">
<div className="flex justify-between items-center border-b border-alviora-border pb-4 mb-4">
<h3 className="font-title-md text-title-md text-alviora-heading font-bold">Stage 2: Open Air</h3>
<span className="bg-error-container text-on-error-container px-3 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider text-xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-on-error-container"></span>LIVE</span>
</div>
<div className="mb-6">
<p className="font-label-sm text-label-sm text-alviora-primary uppercase tracking-wider mb-2 font-bold">Currently Playing</p>
<h4 className="font-body-lg text-body-lg text-alviora-heading font-bold mb-1">Calligraphy Finals</h4>
<p className="font-body-md text-body-md text-alviora-body">Category: Junior • Started at 09:00 AM</p>
</div>
<div className="bg-alviora-surface/50 p-4 rounded-lg border border-alviora-border">
<p className="font-label-sm text-label-sm text-alviora-body uppercase tracking-wider mb-2">Up Next</p>
<div className="flex justify-between items-center">
<h4 className="font-body-md text-body-md text-alviora-heading font-semibold">Pencil Drawing</h4>
<span className="font-body-md text-body-md text-alviora-body font-medium">11:30 AM</span>
</div>
</div>
</div>
</div>
</section>
{/*  Top Leaderboard  */}
<section className="bg-alviora-surface/60 backdrop-blur-sm py-section-gap px-gutter border-y border-alviora-border fade-in-up visible">
<div className="max-w-container-max mx-auto">
<div className="text-center mb-16">
<h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Winners</h2>
<p className="font-body-lg text-body-lg text-alviora-body">Current point standings for the top institutions.</p>
</div>
<div className="bg-white/90 backdrop-blur-md rounded-xl border border-alviora-border overflow-hidden shadow-md">
{/*  Header  */}
<div className="grid grid-cols-12 gap-4 p-4 border-b border-alviora-border bg-gray-50/80 font-label-sm text-label-sm text-alviora-body uppercase tracking-wider font-bold">
<div className="col-span-1 text-center">Rank</div>
<div className="col-span-7">Institution</div>
<div className="col-span-2 hidden md:block">District</div>
<div className="col-span-4 md:col-span-2 text-right">Points</div>
</div>
{/*  Row 1 Rank 1  */}
<div className="grid grid-cols-12 gap-4 p-4 md:p-6 border-b border-alviora-border items-center bg-blue-50/40 hover:bg-blue-50/60 transition-colors">
<div className="col-span-1 text-center font-display-xl-mobile text-display-xl-mobile text-alviora-primary font-black">1</div>
<div className="col-span-7">
<h4 className="font-title-md text-title-md text-alviora-heading font-bold mb-2">DNIC Vallapzuha</h4>
<div className="w-full bg-gray-200/50 h-1.5 rounded-full">
<div className="bg-alviora-primary h-1.5 rounded-full shadow-sm" style={{"width":"100%"}}></div>
</div>
</div>
<div className="col-span-2 hidden md:block font-body-md text-body-md text-alviora-body">Palakkad</div>
<div className="col-span-4 md:col-span-2 text-right font-headline-lg text-headline-lg text-alviora-primary font-bold">32</div>
</div>
{/*  Row 2 Rank 2  */}
<div className="grid grid-cols-12 gap-4 p-4 md:p-6 border-b border-alviora-border items-center hover:bg-gray-50/50 transition-colors">
<div className="col-span-1 text-center font-display-xl-mobile text-display-xl-mobile text-alviora-accent-dim font-black">2</div>
<div className="col-span-7">
<h4 className="font-title-md text-title-md text-alviora-heading font-bold mb-2">Darul Huda, PG</h4>
<div className="w-full bg-gray-200/50 h-1.5 rounded-full">
<div className="bg-alviora-accent-dim h-1.5 rounded-full" style={{"width":"90%"}}></div>
</div>
</div>
<div className="col-span-2 hidden md:block font-body-md text-body-md text-alviora-body">Malappuram</div>
<div className="col-span-4 md:col-span-2 text-right font-headline-lg text-headline-lg text-alviora-heading font-bold">29</div>
</div>
{/*  Row 3 Rank 3  */}
<div className="grid grid-cols-12 gap-4 p-4 md:p-6 items-center hover:bg-gray-50/50 transition-colors">
<div className="col-span-1 text-center font-display-xl-mobile text-display-xl-mobile text-alviora-accent-dim font-black">3</div>
<div className="col-span-7">
<h4 className="font-title-md text-title-md text-alviora-heading font-bold mb-2">Darul Huda Degree Institution</h4>
<div className="w-full bg-gray-200/50 h-1.5 rounded-full">
<div className="bg-alviora-accent-dim h-1.5 rounded-full" style={{"width":"84%"}}></div>
</div>
</div>
<div className="col-span-2 hidden md:block font-body-md text-body-md text-alviora-body">Malappuram</div>
<div className="col-span-4 md:col-span-2 text-right font-headline-lg text-headline-lg text-alviora-heading font-bold">27</div>
</div>
</div>
<div className="mt-8 text-center">
<button className="hover-lift bg-white/90 backdrop-blur-sm border border-alviora-border text-alviora-heading px-8 py-3 rounded-full font-title-md text-title-md hover:bg-alviora-surface hover:text-alviora-primary transition-all inline-flex items-center gap-2 shadow-sm">
                        View Full Standings
                        <span className="material-symbols-outlined">arrow_forward</span>
</button>
</div>
</div>
</section>
{/*  Festival Gallery (Bento Grid)  */}
<section className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible">
<h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-12 text-center">Festival Highlights</h2>
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[250px]">
<div className="hover-lift md:col-span-2 md:row-span-2 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
<div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
<img className="w-full h-full object-cover" data-alt="A striking digital installation art piece featuring glowing, generative geometric shapes suspended in a vast, minimalist gallery space. The room is illuminated by high-key, soft white lighting that creates a bright, modern light-mode aesthetic. The artwork relies on a sophisticated palette of deep blacks and pristine whites, punctuated by intense accents of vibrant red. The mood is serene yet technologically advanced." src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
<div className="absolute bottom-6 left-6 z-20">
<span className="bg-alviora-primary px-3 py-1 rounded text-xs font-label-sm text-label-sm uppercase tracking-wider text-white mb-2 inline-block shadow-sm">Exhibition</span>
<h3 className="font-title-md text-title-md text-white text-2xl font-bold shadow-sm">Digital Revelation</h3>
</div>
</div>
<div className="hover-lift rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
<div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
<img className="w-full h-full object-cover" data-alt="Close up photography of a traditional calligraphy brush resting on pristine white paper with gold leaf accents scattered around. The lighting is bright and clean, emphasizing the texture of the paper and the rich gold tones. Minimalist, professional cultural aesthetic." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
<div className="absolute bottom-4 left-4 z-20">
<h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Calligraphy Masterclass</h3>
</div>
</div>
<div className="hover-lift rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
<div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
<img className="w-full h-full object-cover" data-alt="Wide shot of a modern auditorium stage during a poetry recitation. Minimalist stage design with stark white background and soft spotlighting on the performer. Elegant, prestigious atmosphere." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
<div className="absolute bottom-4 left-4 z-20">
<h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Poetry Finals</h3>
</div>
</div>
</div>
</section>
</main>
{/*  Footer  */}
<footer className="bg-alviora-surface/80 backdrop-blur-md border-t border-alviora-border full-width mt-section-gap">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter px-margin-desktop py-section-gap max-w-container-max mx-auto">
<div>
<a className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-alviora-primary mb-4 inline-block" href="#"><span className="text-3xl uppercase" style={{"fontFamily":"'Syne', sans-serif","fontWeight":"800","letterSpacing":"-0.05em","color":"#000000"}}>ALVIORA</span></a>
<p className="font-body-md text-body-md text-alviora-body mt-4">Art Rooted in Revelation. A celebration of the sacred and the beautiful.</p>
</div>
<div className="lg:col-start-3">
<h4 className="font-title-md text-title-md text-alviora-heading mb-6 font-bold">Quick Links</h4>
<ul className="space-y-4 font-body-md text-body-md">
<li className=""><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Rules &amp; Guidelines</a></li>
<li className=""><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Credits</a></li>
<li className=""><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Privacy Policy</a></li>
</ul>
</div>
<div>
<h4 className="font-title-md text-title-md text-alviora-heading mb-6 font-bold">Portal</h4>
<ul className="space-y-4 font-body-md text-body-md">
<li className=""><a className="text-alviora-body hover:text-alviora-primary underline transition-all duration-300" href="#">Admin Login</a></li>
</ul>
</div>
</div>
<div className="border-t border-alviora-border py-6 px-margin-desktop bg-white/60">
<div className="max-w-container-max mx-auto text-center font-body-md text-body-md text-alviora-body">© 2024 Alviora - Quranic Art Festival. All rights reserved.</div>
</div>
</footer>


    </>
  );
}
