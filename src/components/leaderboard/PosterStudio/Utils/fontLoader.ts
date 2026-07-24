import { useCanvasStore } from '../Stores/canvasStore';

export interface FontDefinition {
  family: string;
  url: string;
}

export const ML_FONTS: FontDefinition[] = [
  { family: 'Manjari', url: 'https://fonts.gstatic.com/s/manjari/v10/k3kVo8UPMOBO2w1UdWLNC8Q.woff2' },
  { family: 'Noto Sans Malayalam', url: 'https://fonts.gstatic.com/s/notosansmalayalam/v28/sJoG3LFXjsSdcnzn071rL37lpAOsUThnDZIfPdbeSNzVakglNM-Qw8EFdB3Rwg.woff2' },
  { family: 'Rachana', url: 'https://fonts.gstatic.com/s/rachana/v16/syk0-yBxa0fYrFQq8dMR.woff2' },
  { family: 'Baloo Chettan 2', url: 'https://fonts.gstatic.com/s/baloochettan2/v14/0QIvMX1D_o-N8F6tK2t-yCq9B8M.woff2' },
  { family: 'Meera', url: 'https://fonts.gstatic.com/s/meera/v22/8QINdih9S8C7sHnC_A.woff2' },
  { family: 'Gayathri', url: 'https://fonts.gstatic.com/s/gayathri/v11/nwpxtK-o8i8t65i30L2d.woff2' },
  { family: 'Chilanka', url: 'https://fonts.gstatic.com/s/chilanka/v16/wwXXz-a6q0216m18mYk.woff2' },
  { family: 'AnjaliOldLipi', url: 'https://fonts.gstatic.com/s/anjalioldlipi/v19/5u91qrpYwLStA7vE3K8x2uP-eA.woff2' },
  { family: 'Dyuthi', url: 'https://fonts.gstatic.com/s/dyuthi/v14/2-ct9JJt6ZY1p8eU.woff2' },
  { family: 'Karumbi', url: 'https://fonts.gstatic.com/s/karumbi/v15/K2FzfZWElr6U737d.woff2' },
];


export const EN_FONTS: FontDefinition[] = [
  "Poppins", "Inter", "Montserrat", "Oswald", "Bebas Neue", 
  "Roboto", "Open Sans", "Lato", "Raleway", "Playfair Display", 
  "Anton", "Nunito", "DM Sans", "League Spartan", "Work Sans",
  "Cormorant Garamond", "Abril Fatface", "DM Serif Display", "Libre Bodoni"
].map(family => ({ family, url: 'https://fonts.gstatic.com/' }));

const loadedFonts = new Set<string>();
const fontLoadCache = new Map<string, Promise<'loaded' | 'failed'>>();

export async function loadFont(font: FontDefinition): Promise<'loaded' | 'failed'> {
  if (loadedFonts.has(font.family)) return 'loaded';

  // Deduplicate simultaneous load calls for same font
  if (fontLoadCache.has(font.family)) {
    return fontLoadCache.get(font.family)!;
  }

  const promise = new Promise<'loaded' | 'failed'>((resolve) => {
    const isGoogleFont = font.url && font.url.includes('fonts.gstatic');
    
    if (isGoogleFont) {
      try {
        const webFontLoader = typeof window !== 'undefined' ? require('webfontloader') : null;
        if (!webFontLoader) {
          resolve('failed');
          return;
        }
        webFontLoader.load({
          google: {
            families: [`${font.family}:300,400,500,600,700,800,900`]
          },
          active: () => {
            loadedFonts.add(font.family);
            resolve('loaded');
          },
          inactive: () => {
            console.warn(`[PosterStudio] WebFont failed to load: ${font.family}`);
            if (typeof window !== 'undefined') useCanvasStore.getState().addFailedFont(font.family);
            resolve('failed');
          }
        });
      } catch {
        resolve('failed');
      }
    } else {
      (async () => {
        try {
          const fontFace = new FontFace(font.family, `url(${font.url})`);
          await fontFace.load();
          (document.fonts as any).add(fontFace);
          loadedFonts.add(font.family);
          resolve('loaded');
        } catch {
          console.warn(`[PosterStudio] Font failed to load: ${font.family}`);
          if (typeof window !== 'undefined') useCanvasStore.getState().addFailedFont(font.family);
          resolve('failed');
        }
      })();
    }
  });

  fontLoadCache.set(font.family, promise);
  promise.finally(() => fontLoadCache.delete(font.family));
  return promise;
}

export async function loadFontBatch(fonts: FontDefinition[]): Promise<{ family: string; status: 'loaded' | 'failed' }[]> {
  const results = await Promise.allSettled(fonts.map((f) => loadFont(f)));
  return results.map((r, i) => ({
    family: fonts[i].family,
    status: r.status === 'fulfilled' ? r.value : 'failed',
  }));
}

export function isFontLoaded(family: string): boolean {
  return loadedFonts.has(family);
}

/** Smart Font Metrics Cache for malayalam/english text measurement */
const metricsCache = new Map<string, { width: number; height: number }>();

export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number = 400,
  maxWidth?: number
): { width: number; height: number } {
  const cacheKey = `${text}|${fontFamily}|${fontSize}|${fontWeight}|${maxWidth ?? 'nomax'}`;
  if (metricsCache.has(cacheKey)) return metricsCache.get(cacheKey)!;

  if (typeof document === 'undefined') return { width: 0, height: 0 };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;

  const words = text.split(' ');
  let lines = 1;
  let currentLine = '';
  let maxLineWidth = 0;

  if (maxWidth) {
    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
        currentLine = word;
        lines++;
      } else {
        currentLine = testLine;
      }
    });
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
  } else {
    maxLineWidth = ctx.measureText(text).width;
  }

  const result = { width: Math.ceil(maxLineWidth), height: Math.ceil(fontSize * 1.4 * lines) };
  metricsCache.set(cacheKey, result);
  return result;
}

export function clearMetricsCache() {
  metricsCache.clear();
}

/**
 * Basic missing glyph detection for Malayalam.
 * Renders a specific Malayalam text and compares its width against a generic fallback.
 * If the font is missing the glyphs, it often renders as boxes (.notdef) or falls back to a different width.
 * This is a heuristic and may not be 100% accurate without pixel-level comparison, but works decently.
 */
export function checkMalayalamSupport(fontFamily: string): boolean {
  if (typeof document === 'undefined') return true;
  
  const testString = 'മലയാളം'; // "Malayalam" in ML script
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Measure in the target font, explicitly disabling fallbacks as much as possible
  ctx.font = `20px "${fontFamily}"`;
  const targetWidth = ctx.measureText(testString).width;
  
  // Measure in a known missing-glyph scenario or fallback
  ctx.font = `20px "Courier New"`;
  const fallbackWidth = ctx.measureText(testString).width;
  
  // If the widths are identically matching standard monospace fallbacks, it's highly likely missing
  // Or we can just log it for now. True pixel diffing is expensive.
  return targetWidth !== fallbackWidth;
}
