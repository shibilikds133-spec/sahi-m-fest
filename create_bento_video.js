const fs = require("fs");
const content = `
import React, { useRef, useEffect } from 'react';

export function BentoVideo() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let fadeInterval;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        // Start playing when in view
        video.volume = 0;
        video.play().catch(e => console.log("Autoplay prevented:", e));
        
        // Fade in volume over 2 seconds (0 to 1 in steps of 0.05 every 100ms)
        clearInterval(fadeInterval);
        fadeInterval = setInterval(() => {
          if (video.volume < 0.95) {
            video.volume += 0.05;
          } else {
            video.volume = 1;
            clearInterval(fadeInterval);
          }
        }, 100);
      } else {
        // Pause when out of view
        video.pause();
        clearInterval(fadeInterval);
      }
    }, { threshold: 0.5 }); // Trigger when 50% visible

    observer.observe(video);
    return () => {
      observer.disconnect();
      clearInterval(fadeInterval);
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      <video
        ref={videoRef}
        src="/videos/bento-video.mp4"
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        loop
        playsInline
        crossOrigin="anonymous"
      />
    </div>
  );
}
`;
fs.writeFileSync("src/components/publicLanding/BentoVideo.tsx", content, "utf8");
