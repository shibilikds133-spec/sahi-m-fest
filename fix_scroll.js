const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// We need to replace the PremiumScheduleCarousel component
const carouselStartStr = "const PremiumScheduleCarousel = ({ schedules, onSelectSchedule }: any) => {";
const componentEndStr = "export function SahithyolsavLandingPage";

const startIndex = content.indexOf(carouselStartStr);
const endIndex = content.indexOf(componentEndStr);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find bounds of PremiumScheduleCarousel");
  process.exit(1);
}

const newCarousel = `
const PremiumScheduleCarousel = ({ schedules, onSelectSchedule }: any) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  const getActiveIndex = () => {
    const now = new Date();
    let activeIdx = -1;
    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      if ((s.status || "").toLowerCase() === "ongoing") return i;
      if (s.start_time && new Date(s.start_time) > now) {
        if (activeIdx === -1) activeIdx = i;
      }
    }
    return activeIdx !== -1 ? activeIdx : 0;
  };
  const activeIndex = getActiveIndex();

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.left + container.clientWidth / 2;
      const cards = container.querySelectorAll('.schedule-card-element');
      
      cards.forEach((card: any) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const dist = Math.abs(containerCenter - cardCenter);
        const maxDist = container.clientWidth / 1.5;
        
        let scale = 1 - (dist / maxDist) * 0.15; 
        if (scale < 0.85) scale = 0.85;
        if (scale > 1) scale = 1;

        let opacity = 1 - (dist / maxDist) * 0.4;
        if (opacity < 0.5) opacity = 0.5;
        if (opacity > 1) opacity = 1;

        card.style.transform = \`scale(\${scale})\`;
        card.style.opacity = opacity.toString();
      });
    });
  };

  React.useEffect(() => {
    handleScroll();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleScroll, { passive: true });
      setTimeout(handleScroll, 100);
    }
    return () => {
      if (container) container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [schedules]);

  const scrollBy = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  if (!schedules || schedules.length === 0) {
    return (
      <div className="w-full text-center py-16 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center backdrop-blur-sm max-w-[1400px] mx-auto">
        <span className="material-symbols-outlined text-4xl text-white/20 mb-4" style={{fontSize:"48px"}}>event_busy</span>
        <p className="text-alviora-body font-title-md">No events scheduled at the moment.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full group/carousel pb-8">
      {/* Desktop Arrows */}
      <button 
        onClick={() => scrollBy(-400)}
        className={\`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl \${canScrollLeft ? "opacity-100 visible" : "opacity-0 invisible"}\`}
        aria-label="Previous events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_left</span>
      </button>

      <button 
        onClick={() => scrollBy(400)}
        className={\`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl \${canScrollRight ? "opacity-100 visible" : "opacity-0 invisible"}\`}
        aria-label="Next events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_right</span>
      </button>

      {/* Scroll Container */}
      <div 
        ref={scrollRef}
        className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 md:px-8 py-12"
        style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
      >
        {schedules.map((schedule: any, idx: number) => {
          const isTimeActive = idx === activeIndex;
          const bgId = (idx % 10) + 1;
          const bgImage = \`/images/schedule/bg-\${bgId}.jpg\`;
          
          let dateStr = "TBA";
          let monthStr = "";
          if (schedule.start_time) {
            const d = new Date(schedule.start_time);
            dateStr = d.getDate().toString().padStart(2, "0");
            monthStr = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
          }

          let timeStr = "TBA";
          if (schedule.start_time) {
            const start = new Date(schedule.start_time).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"});
            timeStr = start;
            if (schedule.end_time) {
              const end = new Date(schedule.end_time).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"});
              timeStr = \`\${start} - \${end}\`;
            }
          }

          const statusRaw = (schedule.status || "").toLowerCase();
          const isOngoing = statusRaw === "ongoing";
          const isCompleted = statusRaw === "completed";
          const isPublished = schedule.is_published === true || statusRaw === "published";
          const isPending = schedule.has_results === true || schedule.has_marks === true || ["mark submitted", "checking pending", "checking completed"].includes(statusRaw);
          
          let statusText = schedule.status || "SCHEDULED";
          let statusStyle = "bg-alviora-primary/20 text-[#60a5fa] border-[#60a5fa]/30"; 
          
          if (isPublished) { statusText = "PUBLISHED"; statusStyle = "bg-green-500/20 text-green-400 border-green-500/30"; }
          else if (isPending) { statusText = "VERIFICATION PENDING"; statusStyle = "bg-[#c69a53]/20 text-[#c69a53] border-[#c69a53]/30"; }
          else if (isCompleted) { statusText = "COMPLETED"; statusStyle = "bg-[#a9f5d0]/20 text-[#a9f5d0] border-[#a9f5d0]/30"; }
          else if (isOngoing) { statusText = "ONGOING"; statusStyle = "bg-error-container text-on-error-container border-error-container/50"; }

          return (
            <div 
              key={idx}
              onClick={() => onSelectSchedule(schedule)}
              className={\`schedule-card-element relative shrink-0 snap-center cursor-pointer group/card
                w-[85vw] sm:w-[320px] md:w-[360px] h-[400px] rounded-[2rem] overflow-hidden shadow-2xl transition-shadow
                \${isTimeActive ? "ring-2 ring-alviora-primary/50 shadow-[0_0_40px_rgba(59,130,246,0.3)]" : "hover:ring-1 hover:ring-white/20"}
              \`}
              style={{ transformOrigin: "center center", willChange: "transform, opacity" }}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover/card:scale-110"
                style={{ backgroundImage: \`url('\${bgImage}')\` }}
              />
              <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#011635] via-[#011635]/80 to-transparent" />
              <div className="absolute inset-0 rounded-[2rem] border border-white/10 group-hover/card:border-white/30 transition-colors pointer-events-none" />

              <div className="relative h-full w-full p-6 flex flex-col justify-between z-10 pointer-events-none">
                <div className="flex justify-between items-start">
                  <div className="bg-[#011635]/60 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex flex-col items-center justify-center min-w-[70px] shadow-lg">
                    <span className="font-headline-lg font-bold text-white leading-none text-2xl">{dateStr}</span>
                    <span className="text-[10px] uppercase tracking-widest text-alviora-accent mt-1 font-bold">{monthStr}</span>
                  </div>
                  {isTimeActive && (
                    <div className="bg-alviora-primary/30 backdrop-blur-md w-10 h-10 rounded-full border border-alviora-primary/50 flex items-center justify-center text-alviora-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                      <span className="material-symbols-outlined text-lg" style={{fontSize: "20px"}}>star</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-end h-full">
                  <div>
                    <span className={\`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 border backdrop-blur-md shadow-sm \${statusStyle}\`}>
                      {statusText}
                    </span>
                    <h3 className="font-title-lg text-2xl text-white font-bold leading-tight group-hover/card:text-alviora-primary transition-colors line-clamp-2 drop-shadow-md">
                      {schedule.items?.item_name_en || schedule.items?.name || "Event Item"}
                    </h3>
                    <p className="text-alviora-accent-dim text-xs font-semibold uppercase tracking-wider mt-2 opacity-90">
                      {schedule.categories?.name || "General Category"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-white/90 text-sm">
                      <span className="material-symbols-outlined text-alviora-primary" style={{fontSize: "16px"}}>location_on</span>
                      <span className="truncate drop-shadow-sm">{schedule.venues?.name || \`Stage \${(idx % 10) + 1}\`}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90 text-sm font-mono">
                      <span className="material-symbols-outlined text-alviora-primary" style={{fontSize: "16px"}}>schedule</span>
                      <span className="drop-shadow-sm">{timeStr}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
`;

const newContent = content.substring(0, startIndex) + newCarousel + "\n" + content.substring(endIndex);
fs.writeFileSync(filePath, newContent, "utf8");
console.log("Successfully fixed scroll smoothness!");
