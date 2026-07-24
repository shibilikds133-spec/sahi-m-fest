import React, { useCallback, useState } from 'react';
import NumericField from './fields/NumericField';
import SliderField from './fields/SliderField';
import { ToggleField } from './fields/SliderField';
import Accordion from './Accordion';
import { useTemplateStore, BackgroundTransform } from '../Stores/templateStore';
import useImage from 'use-image';

export default function BackgroundBlock() {
  const { activeTemplate, updateTemplateMeta } = useTemplateStore();
  
  const bgTransform = activeTemplate?.background_transform || { scale: 1, x: 0, y: 0, isDraggable: false };
  const [image] = useImage(activeTemplate?.background_url || '', 'anonymous');

  const commit = useCallback(
    (patch: Partial<BackgroundTransform>) => {
      updateTemplateMeta({ 
        background_transform: { ...bgTransform, ...patch }
      });
    },
    [updateTemplateMeta, bgTransform]
  );

  const handleFit = () => {
    if (!image || !activeTemplate) return;
    const scale = Math.min(activeTemplate.width / image.width, activeTemplate.height / image.height);
    const x = (activeTemplate.width - image.width * scale) / 2;
    const y = (activeTemplate.height - image.height * scale) / 2;
    commit({ scale, x, y });
  };

  const handleFill = () => {
    if (!image || !activeTemplate) return;
    const scale = Math.max(activeTemplate.width / image.width, activeTemplate.height / image.height);
    const x = (activeTemplate.width - image.width * scale) / 2;
    const y = (activeTemplate.height - image.height * scale) / 2;
    commit({ scale, x, y });
  };

  const handleCenter = () => {
    if (!image || !activeTemplate) return;
    const x = (activeTemplate.width - image.width * bgTransform.scale) / 2;
    const y = (activeTemplate.height - image.height * bgTransform.scale) / 2;
    commit({ x, y });
  };

  const handleReset = () => {
    commit({ scale: 1, x: 0, y: 0 });
  };

  if (!activeTemplate?.background_url) {
    return (
      <Accordion title="Background Image">
        <p style={{ fontSize: 12, color: '#94A3B8' }}>No background image uploaded.</p>
      </Accordion>
    );
  }

  return (
    <Accordion title="BACKGROUND IMAGE">
      <div style={styles.grid}>
        <NumericField label="X Pos" value={Math.round(bgTransform.x)} onChange={(v) => commit({ x: v })} min={-4000} max={4000} />
        <NumericField label="Y Pos" value={Math.round(bgTransform.y)} onChange={(v) => commit({ y: v })} min={-4000} max={4000} />
      </div>

      <div style={{ marginTop: 12 }}>
        <SliderField 
          label="Scale (Zoom)" 
          value={bgTransform.scale} 
          onChange={(v) => commit({ scale: v })} 
          min={0.1} 
          max={10} 
          step={0.01} 
        />
      </div>

      <div style={styles.actionsGrid}>
        <button onClick={handleFit} style={styles.actionBtn}>Fit</button>
        <button onClick={handleFill} style={styles.actionBtn}>Fill</button>
        <button onClick={handleCenter} style={styles.actionBtn}>Center</button>
        <button onClick={handleReset} style={styles.actionBtn}>Reset</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <ToggleField 
          label="Enable Visual Dragging (Disables Multi-select)" 
          value={bgTransform.isDraggable || false} 
          onChange={(v) => commit({ isDraggable: v })} 
        />
      </div>
    </Accordion>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  actionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 },
  actionBtn: { 
    padding: '6px 0', 
    borderRadius: 6, 
    border: '1px solid #2a2a2a', 
    backgroundColor: '#1f1f1f', 
    cursor: 'pointer', 
    fontSize: 11, 
    fontFamily: 'Inter, sans-serif', 
    fontWeight: 600, 
    color: '#E2E8F0' 
  },
};
