const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

const carouselComponent = `
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
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  React.useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, [schedules]);

  React.useEffect(() => {
    if (scrollRef.current && activeIndex > 0) {
      setTimeout(() => {
        if (scrollRef.current) {
          const cardWidth = 360; 
          scrollRef.current.scrollTo({ left: activeIndex * cardWidth - window.innerWidth/2 + cardWidth/2, behavior: "smooth" });
        }
      }, 500);
    }
  }, [activeIndex]);

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
      <button 
        onClick={() => scrollBy(-400)}
        className={\`absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl \${canScrollLeft ? "opacity-100 visible" : "opacity-0 invisible"}\`}
        aria-label="Previous events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_left</span>
      </button>

      <button 
        onClick={() => scrollBy(400)}
        className={\`absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl \${canScrollRight ? "opacity-100 visible" : "opacity-0 invisible"}\`}
        aria-label="Next events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_right</span>
      </button>

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 md:px-[calc(50vw-170px)] py-12"
        style={{ scrollBehavior: "smooth" }}
      >
        {schedules.map((schedule: any, idx: number) => {
          const isActive = idx === activeIndex;
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
              className={\`relative shrink-0 snap-center cursor-pointer transition-all duration-500 ease-out group/card
                w-[85vw] sm:w-[320px] md:w-[340px] h-[400px] rounded-3xl overflow-hidden
                \${isActive ? "ring-2 ring-alviora-primary/50 shadow-[0_0_30px_rgba(59,130,246,0.3)] md:-translate-y-4 scale-[1.02]" : "hover:-translate-y-2 hover:shadow-xl opacity-90 hover:opacity-100"}
              \`}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover/card:scale-110"
                style={{ backgroundImage: \`url('\${bgImage}')\` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#011635] via-[#011635]/80 to-[#011635]/40" />
              <div className="absolute inset-0 rounded-3xl border border-white/10 group-hover/card:border-white/20 transition-colors" />

              <div className="relative h-full w-full p-6 flex flex-col justify-between z-10">
                <div className="flex justify-between items-start">
                  <div className="bg-black/40 backdrop-blur-md rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center min-w-[70px] shadow-lg">
                    <span className="font-headline-lg font-bold text-white leading-none text-2xl">{dateStr}</span>
                    <span className="text-[10px] uppercase tracking-widest text-alviora-accent mt-1 font-bold">{monthStr}</span>
                  </div>
                  {isActive && (
                    <div className="bg-alviora-primary/20 backdrop-blur-md w-10 h-10 rounded-full border border-alviora-primary/30 flex items-center justify-center text-alviora-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                      <span className="material-symbols-outlined text-lg" style={{fontSize: "20px"}}>star</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <span className={\`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 border backdrop-blur-sm \${statusStyle}\`}>
                      {statusText}
                    </span>
                    <h3 className="font-title-lg text-2xl text-white font-bold leading-tight group-hover/card:text-alviora-primary transition-colors line-clamp-2">
                      {schedule.items?.item_name_en || schedule.items?.name || "Event Item"}
                    </h3>
                    <p className="text-alviora-body text-xs font-semibold uppercase tracking-wider mt-2 opacity-80">
                      {schedule.categories?.name || "General Category"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-white/80 text-sm">
                      <span className="material-symbols-outlined text-alviora-accent" style={{fontSize: "16px"}}>location_on</span>
                      <span className="truncate">{schedule.venues?.name || \`Stage \${(idx % 10) + 1}\`}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/80 text-sm font-mono">
                      <span className="material-symbols-outlined text-alviora-accent" style={{fontSize: "16px"}}>schedule</span>
                      <span>{timeStr}</span>
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

if (!content.includes("const PremiumScheduleCarousel")) {
  const targetStr = "export function SahithyolsavLandingPage";
  if (content.includes(targetStr)) {
    content = content.replace(targetStr, carouselComponent + "\n\n" + targetStr);
    fs.writeFileSync(filePath, content, "utf8");
    console.log("Component definition injected successfully!");
  } else {
    console.log("Could not find target string.");
  }
} else {
  console.log("Component already exists.");
}
