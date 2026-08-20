import React from 'react';
import { useLayerStore, LayerData } from '../Stores/layerStore';
import { useHistoryStore } from '../Stores/historyStore';
import ColorField from '../Properties/fields/ColorField';
import NumericField from '../Properties/fields/NumericField';
import SliderField from '../Properties/fields/SliderField';
import FontSelect from '../Properties/fields/FontSelect';
import { useTemplateStore } from '../Stores/templateStore';
import { resolveTemplateVariables } from '../Utils/resolver';

function detectScript(text: string): 'ml' | 'en' {
  return /[\u0D00-\u0D7F]/.test(text) ? 'ml' : 'en';
}

const PRESET_COLORS = ["#000000", "#FFFFFF", "#0F766E", "#F59E0B", "#6B7280", "#EF4444"];

export default function TextToolbar() {
  const { layers, selectedIds, updateLayer } = useLayerStore();
  const history = useHistoryStore();
  const { variables } = useTemplateStore();
  
  if (selectedIds.length !== 1) return null;
  const layer = layers.find(l => l.id === selectedIds[0]);
  if (!layer || layer.type !== 'text') return null;

  const commit = (patch: Partial<LayerData>) => {
    history.push(layers);
    updateLayer(layer.id, patch);
  };

  const resolved = resolveTemplateVariables(layer.text, variables);
  const detectedScript = detectScript(resolved);
  
  return (
    <div style={styles.toolbar}>
      {/* SECTION: TYPOGRAPHY */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>TYPOGRAPHY</div>
        <div style={styles.group}>
          <FontSelect
            label=""
            value={layer.fontFamily || 'Poppins'}
            onChange={(v) => commit({ fontFamily: v })}
            script={detectedScript}
          />
          <NumericField label="Size" value={layer.fontSize ?? 24} onChange={(v) => commit({ fontSize: v })} min={8} max={200} unit="px" />
          <select
            value={layer.fontWeight ?? 400}
            onChange={(e) => commit({ fontWeight: parseInt(e.target.value) as any })}
            style={styles.selectBtn}
            title="Font Weight"
          >
            <option value={300}>Light</option>
            <option value={400}>Regular</option>
            <option value={500}>Medium</option>
            <option value={600}>SemiBold</option>
            <option value={700}>Bold</option>
            <option value={800}>ExtraBold</option>
          </select>
        </div>
      </div>

      {/* SECTION: ALIGNMENT */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>ALIGNMENT</div>
        <div style={styles.group}>
          <button onClick={() => commit({ align: 'left' })} style={{...styles.btn, backgroundColor: layer.align === 'left' ? '#0F766E' : '#1f1f1f'}}>⟵ Left</button>
          <button onClick={() => commit({ align: 'center' })} style={{...styles.btn, backgroundColor: layer.align === 'center' ? '#0F766E' : '#1f1f1f'}}>⟷ Center</button>
          <button onClick={() => commit({ align: 'right' })} style={{...styles.btn, backgroundColor: layer.align === 'right' ? '#0F766E' : '#1f1f1f'}}>⟶ Right</button>
          <button onClick={() => commit({ align: 'justify' })} style={{...styles.btn, backgroundColor: layer.align === 'justify' ? '#0F766E' : '#1f1f1f'}}>≡ Justify</button>
        </div>
      </div>

      {/* SECTION: SPACING */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>SPACING</div>
        <div style={styles.group}>
          <div style={{ width: 140 }}>
            <SliderField label="Letter Spacing" value={layer.letterSpacing ?? 0} onChange={(v) => commit({ letterSpacing: v })} min={-50} max={200} unit="px" />
          </div>
          <div style={{ width: 140 }}>
            <SliderField label="Line Height" value={layer.lineHeight ?? 1.4} onChange={(v) => commit({ lineHeight: v })} min={0.5} max={4} step={0.1} />
          </div>
        </div>
      </div>

      {/* SECTION: COLOR */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>COLOR</div>
        <div style={{...styles.group, alignItems: 'center', backgroundColor: '#1f1f1f', padding: '6px 12px', borderRadius: 8, border: '1px solid #2a2a2a', height: 42}}>
          {/* Color Preview & Native Input */}
          <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 4, overflow: 'hidden', border: '1px solid #3f3f46' }}>
             <input 
               type="color" 
               value={layer.fill || '#000000'} 
               onChange={(e) => commit({ fill: e.target.value })}
               style={{ width: 40, height: 40, position: 'absolute', top: -5, left: -5, cursor: 'pointer', padding: 0, border: 'none' }} 
             />
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#E2E8F0', textTransform: 'uppercase', width: 65, marginLeft: 8 }}>
             {layer.fill || '#000000'}
          </span>
          <div style={{ width: 1, height: 24, backgroundColor: '#3f3f46', margin: '0 8px' }} />
          {/* Presets */}
          <div style={{ display: 'flex', gap: 6 }}>
            {PRESET_COLORS.map(c => (
              <button 
                key={c}
                onClick={() => commit({ fill: c })}
                style={{
                  width: 24, height: 24, borderRadius: 12, backgroundColor: c, border: `2px solid ${layer.fill === c ? '#5EEAD4' : '#3f3f46'}`, cursor: 'pointer'
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>

      {/* SECTION: ACTIONS */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>ACTIONS</div>
        <div style={styles.group}>
          <button onClick={() => {
            const id = `text_${Date.now()}`;
            history.push(layers);
            useLayerStore.getState().addLayer({ id, type: 'text', version: '1.0', name: 'New Text', text: 'New Text', x: 100, y: 100, width: 200, height: 40, rotation: 0, scaleX: 1, scaleY: 1, fontSize: 32, fill: '#000000', fontFamily: 'Poppins', isVisible: true, isLocked: false, lockProfile: 'editable', zIndex: layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) + 1 : 1, opacity: 1, align: 'left', fontWeight: 600 });
            useLayerStore.getState().setSelectedIds([id]);
          }} style={styles.btn}>+ Text</button>
          <button onClick={() => {
             navigator.clipboard.writeText(JSON.stringify(layer));
             history.push(layers);
             useLayerStore.getState().removeLayer(layer.id);
          }} style={styles.btn}>✂ Cut</button>
          <button onClick={() => navigator.clipboard.writeText(JSON.stringify(layer))} style={styles.btn}>⎘ Copy</button>
          <button onClick={async () => {
             try {
               const text = await navigator.clipboard.readText();
               const data = JSON.parse(text);
               if (data && data.type) {
                 const newId = `layer_${Date.now()}`;
                 history.push(layers);
                 useLayerStore.getState().addLayer({ ...data, id: newId, x: (data.x || 0) + 20, y: (data.y || 0) + 20 });
                 useLayerStore.getState().setSelectedIds([newId]);
               }
             } catch(e) { console.error(e) }
          }} style={styles.btn}>📋 Paste</button>
          <button onClick={() => {
             history.push(layers);
             useLayerStore.getState().duplicateLayer(layer.id);
          }} style={styles.btn}>⧉ Dupe</button>
          <button onClick={() => {
             history.push(layers);
             useLayerStore.getState().removeLayer(layer.id);
          }} style={{...styles.btn, color: '#EF4444'}}>🗑 Del</button>
        </div>
      </div>
      
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    width: '100%',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionHeader: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
  },
  btn: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #2a2a2a',
    backgroundColor: '#1f1f1f',
    color: '#E2E8F0',
    cursor: 'pointer',
    fontWeight: 600,
    height: 42,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background-color 0.15s, border-color 0.15s',
  },
  selectBtn: {
    padding: '0 12px',
    borderRadius: 6,
    border: '1px solid #2a2a2a',
    color: '#E2E8F0',
    cursor: 'pointer',
    fontWeight: 600,
    height: 42,
    fontSize: 13,
    backgroundColor: '#171717',
    WebkitAppearance: 'none',
    paddingRight: 32,
    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394A3B8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '10px auto',
  }
};
