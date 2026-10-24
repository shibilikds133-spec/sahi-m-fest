import type { TeamLeaderContext } from '@/services/teamLeaderPortalService';

const DEFAULT_PRIMARY = '#0F766E';
const DEFAULT_ACCENT = '#14B8A6';

const TEAM_BRANDINGS: Record<string, { primary: string; accent: string }> = {
  'LA COSMIX': { primary: '#7E22CE', accent: '#DDD6FE' },
  'AL COGNIX': { primary: '#B91C1C', accent: '#FECACA' },
  'EL CLARIX': { primary: '#1D4ED8', accent: '#BFDBFE' },
  'LO GLIFIX': { primary: '#047857', accent: '#A7F3D0' },
  'DER ZENIX': { primary: '#A16207', accent: '#FEF3C7' },
};

function normalizeHex(value: string | null | undefined, fallback: string) {
  const hex = value?.trim();
  return hex && /^#[\da-f]{6}$/i.test(hex) ? hex.toUpperCase() : fallback;
}

function mixWithWhite(hex: string, whiteRatio: number) {
  const rgb = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16));
  const mixed = rgb.map((channel) => Math.round(channel + (255 - channel) * whiteRatio));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function getTeamLeaderPalette(context: TeamLeaderContext | null | undefined) {
  const teamKey = context?.team_name?.trim().replace(/-/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  const assigned = teamKey ? TEAM_BRANDINGS[teamKey] : undefined;
  const storedPrimary = normalizeHex(context?.portal_primary_color, DEFAULT_PRIMARY);
  const storedAccent = normalizeHex(context?.portal_accent_color, DEFAULT_ACCENT);
  const hasDefaultBranding = storedPrimary === DEFAULT_PRIMARY && storedAccent === DEFAULT_ACCENT;
  const primary = assigned && hasDefaultBranding ? assigned.primary : storedPrimary;
  const accent = assigned && hasDefaultBranding ? assigned.accent : storedAccent;

  return {
    primary,
    accent,
    surface: mixWithWhite(primary, 0.965),
    surfaceSoft: mixWithWhite(primary, 0.92),
    border: mixWithWhite(primary, 0.68),
    selected: mixWithWhite(primary, 0.9),
  };
}
