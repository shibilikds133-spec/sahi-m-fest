import React, { useEffect, useState, useCallback } from 'react';
import { ML_FONTS, EN_FONTS, loadFont, FontDefinition } from '../../Utils/fontLoader';
import { fontService, FontMetadata } from '../../../../../services/fontService';
import { useAuthStore } from '../../../../../core/store/authStore';
import { useLocalSearchParams } from 'expo-router';
import FontManagerPanel from '../FontManagerPanel';

interface FontSelectProps {
  label: string;
  value: string;
  onChange: (family: string) => void;
  script?: 'ml' | 'en' | 'both';
}

export default function FontSelect({ label, value, onChange, script = 'both' }: FontSelectProps) {
  const { tenant_id } = useAuthStore();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const festivalId = Array.isArray(id) ? id[0] : id;

  const [customFonts, setCustomFonts] = useState<FontMetadata[]>([]);
  const [showManager, setShowManager] = useState(false);

  const fetchFonts = useCallback(() => {
    if (tenant_id) {
      fontService.getFonts(tenant_id, festivalId).then(fonts => {
        setCustomFonts(fonts.map(f => f.metadata as FontMetadata).filter(Boolean));
      }).catch(console.error);
    }
  }, [tenant_id, festivalId]);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  const customFontsList = customFonts.map(f => ({ family: f.family, url: '', isCustom: true }));

  const fonts = [
    ...(script !== 'en' ? ML_FONTS : []),
    ...(script !== 'ml' ? EN_FONTS : []),
    ...customFontsList,
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <label style={styles.label}>{label}</label>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...styles.select, fontFamily: value }}
        onMouseOver={(e) => {
          const opt = (e.target as HTMLSelectElement).options[(e.target as HTMLSelectElement).selectedIndex];
          const fontEntry = fonts.find((f) => f.family === opt.value);
          if (fontEntry && !(fontEntry as any).isCustom) loadFont(fontEntry);
        }}
      >
        {script !== 'en' && (
          <optgroup label="── Malayalam Fonts ──">
            {ML_FONTS.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.family}
              </option>
            ))}
          </optgroup>
        )}
        {script !== 'ml' && (
          <optgroup label="── English Fonts ──">
            {EN_FONTS.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.family}
              </option>
            ))}
          </optgroup>
        )}
        {customFonts.length > 0 && (
          <optgroup label="── Custom Fonts ──">
            {customFonts.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                {f.family} {f.scope === 'tenant' ? '(Org)' : '(Fest)'}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button 
        style={styles.manageBtn} 
        onClick={() => setShowManager(true)}
        title="Upload Custom Font"
      >
        + Upload Font
      </button>

      {showManager && (
        <FontManagerPanel 
          onClose={() => setShowManager(false)} 
          onUploadSuccess={fetchFonts} 
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 10, color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: { padding: '0 8px', height: 36, borderRadius: 8, border: '1px solid #2a2a2a', fontSize: 13, color: '#E2E8F0', outline: 'none', backgroundColor: '#171717', cursor: 'pointer', transition: 'border-color 0.15s' },
  manageBtn: { fontSize: 10, color: '#38bdf8', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', alignSelf: 'flex-start' }
};
