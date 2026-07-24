import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import StudioCanvas from './Canvas/StudioCanvas';
import TransformBlock from './Properties/TransformBlock';
import TypographyBlock from './Properties/TypographyBlock';
import EffectsBlock from './Properties/EffectsBlock';
import MobileBottomSheet from './Properties/MobileBottomSheet';
import TextToolbar from './Toolbar/TextToolbar';
import { useCanvasStore } from './Stores/canvasStore';
import { useLayerStore } from './Stores/layerStore';
import CanvasSizeBlock from './Properties/CanvasSizeBlock';
import BackgroundBlock from './Properties/BackgroundBlock';
import { useTemplateStore } from './Stores/templateStore';
import { useOfflineStore } from './Stores/offlineStore';
import { useHistoryStore } from './Stores/historyStore';
import { useKeyboardShortcuts } from './Hooks/useKeyboardShortcuts';
import { useMemoryBudget } from './Hooks/useMemoryBudget';
import ShortcutGuide from './Toolbar/ShortcutGuide';
import { VariablePreview } from './Variables/VariablePreview';
import VariableBindingPanel from './Variables/VariableBindingPanel';
import VersionHistory from './Templates/VersionHistory';
import PublishApproval from './Templates/PublishApproval';
import PublishedResultsPanel from './Results/PublishedResultsPanel';
import ErrorBoundary from './ErrorBoundary';
import DiagnosticsOverlay from './DiagnosticsOverlay';
import { validateTemplateHealth, ValidationIssue } from './Utils/validation';
import { useGetPosterTemplates } from '../../../core/hooks/useLeaderboardSettings';
import { RESULT_NUMBER_PRESETS, NEXT_RESULT_MODE } from './Utils/resultNumberPresets';
import CreateTemplateModal from './Templates/CreateTemplateModal';
import { supabase } from '../../../core/config/supabase';
import OffscreenRenderer from './Canvas/OffscreenRenderer';
import { uploadService } from '../../../services/storage/uploadService';

interface PosterStudioProps {
  festivalId: string;
  tenantId: string;
}

export default function PosterStudio({ festivalId, tenantId }: PosterStudioProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1180;
  const isDesktop = width >= 1180;

  const { zoomLevel, setZoom, fitToViewport, gridVisible, setGridVisible, gridSnap, setGridSnap, gridSize, setGridSize, rulerVisible, setRulerVisible, safeZoneVisible, setSafeZoneVisible, failedFonts } = useCanvasStore();
  const { layers, selectedIds } = useLayerStore();
  const { activeTemplate, hasUnsavedChanges, saveDraft, draftRecoveryAvailable, restoreDraft, clearDraft, lastSavedAt, variables, currentResultId, saveResultOverride, typographyMode, toggleTypographyMode, resultNumberMode, cycleResultNumberMode } = useTemplateStore();
  const safeVariables = variables || {};
  const { data: dbTemplates = [] } = useGetPosterTemplates(festivalId);
  const { isOnline } = useOfflineStore();
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());


  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isDebug, setIsDebug] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  // Default to first DB template (not a demo). Falls back to empty string so loadDraftOnStart gets null.
  const [currentTemplateId, setCurrentTemplateId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDebug(window.location.search.includes('debug=1'));
    }
  }, []);

  // When DB templates first load, auto-select the last used one, or the first one
  useEffect(() => {
    if (dbTemplates.length > 0 && !currentTemplateId) {
      const lastId = localStorage.getItem('posterStudio_lastTemplateId');
      const exists = lastId && dbTemplates.find((t: any) => t.id === lastId);
      setCurrentTemplateId(exists ? lastId : dbTemplates[0].id!);
    }
  }, [dbTemplates, currentTemplateId]);

  // Initial Draft Loading — only fires when a real templateId is set
  useEffect(() => {
    if (currentTemplateId) {
      useTemplateStore.getState().loadDraftOnStart(currentTemplateId);
    }
  }, [currentTemplateId]);

  // ── Result Number Typography Mode Switcher ──────────
  const handleResultModeSwitch = () => {
    // 1. Update mode in store
    useTemplateStore.getState().cycleResultNumberMode();
    const newMode = useTemplateStore.getState().resultNumberMode;
    const preset = RESULT_NUMBER_PRESETS[newMode];

    // 2. Find result_no layer
    const { layers: ls, updateLayer } = useLayerStore.getState();
    const resultLayer = ls.find(l => l.dynamicBinding === 'result_no' || l.text?.includes('{result_no}'));

    if (resultLayer) {
      useHistoryStore.getState().push(ls);
      updateLayer(resultLayer.id, {
        fontFamily: preset.fontFamily,
        fontWeight: preset.fontWeight,
        fontSize: preset.fontSize,
      });
      useTemplateStore.getState().markUnsaved();
    }
  };

  const selectedLayer = selectedIds.length === 1 ? layers.find((l) => l.id === selectedIds[0]) || null : null;

  // Register keyboard shortcuts
  useKeyboardShortcuts();
  useMemoryBudget();

  useEffect(() => {
    const onShowShortcuts = () => setShowShortcuts(true);
    window.addEventListener('poster-studio:show-shortcuts', onShowShortcuts);
    return () => window.removeEventListener('poster-studio:show-shortcuts', onShowShortcuts);
  }, []);

  // Dirty State Marking
  useEffect(() => {
    // Only mark unsaved if the app has fully loaded
    if (layers.length > 0) {
      useTemplateStore.getState().markUnsaved();
    }
  }, [layers, safeVariables]);

  // Debounced Autosave
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = setTimeout(() => {
      saveDraft();
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, saveDraft]);

  // Warn on Unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useTemplateStore.getState().hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Network detection
  const { setIsOnline } = useOfflineStore();
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [setIsOnline]);

  const canvasW = activeTemplate?.width || 1080;
  const canvasH = activeTemplate?.height || 1080;

  // Status bar text
  const saveStatus = !isOnline
    ? '📡 Offline — changes queued'
    : hasUnsavedChanges
    ? '● Unsaved changes'
    : lastSavedAt
    ? `✓ Saved ${formatRelativeTime(lastSavedAt)}`
    : '✓ Draft saved';

  const runValidation = () => {
    if (!activeTemplate) return;
    const issues = validateTemplateHealth(activeTemplate, layers, useTemplateStore.getState().variables);
    setValidationIssues(issues);
    setShowValidation(true);
  };

  // Background image upload handler
  const handleBgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      useTemplateStore.getState().updateTemplateMeta({ background_url: url });
    };
    reader.readAsDataURL(file);
  }, []);

  // Layer quick actions
  const handleDuplicateLayer = () => {
    if (!selectedLayer) return;
    const { layers: ls } = useLayerStore.getState();
    const { duplicateLayer } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    duplicateLayer(selectedLayer.id);
  };

  const handleAddText = () => {
    const { addLayer, layers: ls } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    const newId = `layer_text_${Date.now()}`;
    addLayer({
      id: newId,
      type: 'text',
      version: '1.0',
      name: 'New Text',
      text: 'New Text',
      x: canvasW / 2 - 100,
      y: canvasH / 2 - 20,
      width: 200,
      height: 40,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      fontSize: 32,
      fontFamily: 'Poppins',
      fontWeight: 600,
      fill: '#000000',
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      zIndex: ls.length > 0 ? Math.max(...ls.map(l => l.zIndex)) + 1 : 1,
      isVisible: true,
      isLocked: false,
      lockProfile: 'editable',
    });
    useLayerStore.getState().setSelectedIds([newId]);
  };

  // ── Insert pre-styled Event Name Primary + Secondary layers ──────────
  const insertEventNameLayers = () => {
    const { addLayer, layers: ls } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    const maxZ = ls.length > 0 ? Math.max(...ls.map(l => l.zIndex)) + 1 : 10;
    const cx = (activeTemplate?.width ?? 1080) / 2;
    const cy = (activeTemplate?.height ?? 1080) / 2;
    const primaryId = `evt_primary_${Date.now()}`;
    const secondaryId = `evt_secondary_${Date.now() + 1}`;
    addLayer({
      id: primaryId, type: 'text', version: '1.0',
      name: 'Event Name Primary',
      text: '{event_name_primary}',
      x: cx - 440, y: cy - 120, width: 880, height: 120,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 96, fontFamily: 'Poppins', fontWeight: 900,
      fill: '#000000', align: 'center', lineHeight: 1.1, letterSpacing: 2,
      zIndex: maxZ, isVisible: true, isLocked: false, lockProfile: 'editable',
      dynamicBinding: 'event_name_primary',
    });
    addLayer({
      id: secondaryId, type: 'text', version: '1.0',
      name: 'Event Name Secondary',
      text: '{event_name_secondary}',
      x: cx - 440, y: cy + 20, width: 880, height: 80,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      fontSize: 52, fontFamily: 'Poppins', fontWeight: 400,
      fill: '#333333', align: 'center', lineHeight: 1.2, letterSpacing: 0,
      zIndex: maxZ + 1, isVisible: true, isLocked: false, lockProfile: 'editable',
      dynamicBinding: 'event_name_secondary',
    });
    useLayerStore.getState().setSelectedIds([primaryId]);
    useTemplateStore.getState().markUnsaved();
    useTemplateStore.getState().updateStableLayout();
  };

  const handleDeleteLayer = () => {
    if (!selectedLayer) return;
    const { layers: ls, removeLayer } = useLayerStore.getState();
    useHistoryStore.getState().push(ls);
    removeLayer(selectedLayer.id);
  };

  const scaleText = (factor: number) => {
    const currentLayers = useLayerStore.getState().layers;
    const selectedIds = useLayerStore.getState().selectedIds;
    useHistoryStore.getState().push(currentLayers);
    
    const newLayers = currentLayers.map(l => {
      if (l.type === 'text' && l.fontSize) {
        if (selectedIds.length > 0 && !selectedIds.includes(l.id)) {
          return l;
        }
        return { ...l, fontSize: Math.max(8, Math.round(l.fontSize * factor)) };
      }
      return l;
    });
    useLayerStore.getState().setLayers(newLayers);
  };

  const handleCapture = useCallback(async (captureFunc: () => string) => {
    if (!activeTemplate) return;
    try {
      const dataUrl = captureFunc();

      // Convert dataURL → Blob
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      const blob = new Blob([u8arr], { type: mime });

      // Upload to R2
      const uploaded = await uploadService.uploadGeneratedAsset(blob, festivalId, tenantId);

      // Unique hash for this render (groups resolutions in Media Center)
      const renderHash = `${activeTemplate.id}_${currentResultId || 'base'}_${Date.now()}`;
      const eventName = safeVariables['event_name'] || 'Festival Event';

      // Save to generated_assets — both hd and standard point to same URL for now
      const { error: dbError } = await supabase.from('generated_assets').insert([
        {
          tenant_id: tenantId,
          festival_id: festivalId,
          template_id: activeTemplate.id,
          result_id: currentResultId || null,
          public_url: uploaded.file_url,
          storage_path: uploaded.object_key,
          resolution: 'hd',
          asset_type: 'poster',
          render_hash: renderHash,
        },
        {
          tenant_id: tenantId,
          festival_id: festivalId,
          template_id: activeTemplate.id,
          result_id: currentResultId || null,
          public_url: uploaded.file_url,
          storage_path: uploaded.object_key,
          resolution: 'standard',
          asset_type: 'poster',
          render_hash: renderHash,
        },
      ]);

      if (dbError) throw new Error(dbError.message);

      useTemplateStore.getState().updateStableLayout();
      alert('✅ Poster published to Media Center!');
    } catch (e: any) {
      console.error(e);
      alert('Failed to generate poster: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  }, [activeTemplate, festivalId, tenantId, currentResultId, safeVariables]);

  return (
    <ErrorBoundary>
      <div style={styles.root}>
        {/* ---- OFFLINE BANNER ---- */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          📡 Offline — changes will sync when connection restores
        </div>
      )}

      {/* ---- DRAFT RECOVERY BANNER ---- */}
      {draftRecoveryAvailable && (
        <div style={styles.draftBanner}>
          <span>🗂 Unsaved draft found from a previous session.</span>
          <div style={styles.draftActions}>
            <button onClick={() => restoreDraft()} style={styles.draftBtn}>Restore Draft</button>
            <button onClick={() => clearDraft()} style={{ ...styles.draftBtn, backgroundColor: 'transparent', color: '#64748B' }}>Discard</button>
          </div>
        </div>
      )}

      {/* ---- FONT FAILURE TOAST ---- */}
      {failedFonts.length > 0 && (
        <div style={styles.fontWarning}>
          ⚠ Font unavailable: {failedFonts.join(', ')} — system fallback active. Export may differ.
        </div>
      )}

      {/* ---- TOPBAR ---- */}
      <div style={styles.topbar}>
        {/* Row 1: Brand + template name + status */}
        <div style={styles.topbarRow1}>
          <div style={styles.topbarLeft}>
            <span style={styles.studioTitle}>🎨 Poster Studio</span>
            {/* Template selector — DB templates only; demo templates shown only in ?debug=1 mode */}
            {(dbTemplates.length > 0 || isDebug) ? (
              <select
                value={currentTemplateId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setCurrentTemplateId(newId);
                  localStorage.setItem('posterStudio_lastTemplateId', newId);
                  useTemplateStore.getState().setCurrentResultId(null);
                }}
                style={{
                  backgroundColor: '#1E293B',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  outline: 'none',
                  marginLeft: '8px',
                  fontSize: '14px'
                }}
              >
                {dbTemplates.length === 0 && <option value="">-- No templates yet --</option>}
                {dbTemplates.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                {/* Debug-only: local demo templates, visible only with ?debug=1 */}
                {isDebug && (
                  <optgroup label="🛠 Sandbox (debug only — NOT publishable)">
                    <option value="demo-template-1">Book Test (Demo)</option>
                    <option value="template-qawwali">Qawwali (Demo)</option>
                    <option value="template-reading">Reading (Demo)</option>
                  </optgroup>
                )}
              </select>
            ) : (
              // No DB templates yet — show inline CTA instead of dropdown
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  marginLeft: '12px',
                  padding: '5px 14px',
                  borderRadius: '7px',
                  border: '1px dashed #0F766E',
                  backgroundColor: 'rgba(15,118,110,0.12)',
                  color: '#5EEAD4',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + Create your first template
              </button>
            )}
            {/* + New template button always visible */}
            <button
              onClick={() => setShowCreateModal(true)}
              title="Create a new database template"
              style={{
                marginLeft: '8px',
                padding: '4px 10px',
                borderRadius: '7px',
                border: '1px solid #0F766E',
                backgroundColor: 'transparent',
                color: '#5EEAD4',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + New
            </button>
            <div style={{
              marginLeft: '16px',
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: currentResultId ? '#8B5CF6' : '#3B82F6',
              color: 'white',
              display: 'flex',
              alignItems: 'center'
            }}>
              {currentResultId ? `EDITING RESULT` : 'EDITING BASE TEMPLATE'}
            </div>
            {currentResultId && (
              <button
                onClick={async () => {
                  useTemplateStore.getState().setCurrentResultId(null);
                  const activeTemplate = useTemplateStore.getState().activeTemplate;
                  if (activeTemplate) {
                    useLayerStore.getState().setLayers(activeTemplate.layers);
                  }
                }}
                style={{
                  marginLeft: '8px',
                  padding: '6px 12px',
                  backgroundColor: '#475569',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#475569')}
              >
                ↩ Back to Base Template
              </button>
            )}
            {activeTemplate && <span style={{...styles.templateName, display: 'none'}}>{activeTemplate.name}</span>}
          </div>
          <div style={styles.topbarRight}>
            {!currentResultId && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveDraft();
                  // Also persist layers to Supabase for publishable templates
                  if (activeTemplate?.isPublishable && activeTemplate.id) {
                    const currentLayers = useLayerStore.getState().layers;
                    await supabase
                      .from('poster_templates')
                      .update({
                        layers: currentLayers,
                        background_url: activeTemplate.background_url,
                        width: activeTemplate.width,
                        height: activeTemplate.height,
                        aspect_ratio: activeTemplate.aspect_ratio,
                      })
                      .eq('id', activeTemplate.id);
                  }
                  setIsSaving(false);
                }}
                disabled={isSaving}
                style={{ ...styles.topBtn, backgroundColor: '#3B82F6', color: '#FFFFFF', borderColor: '#3B82F6' }}
              >
                {isSaving ? 'Saving...' : '💾 Save Template'}
              </button>
            )}
            {currentResultId && (
              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveResultOverride();
                  setIsSaving(false);
                }}
                disabled={isSaving}
                style={{ ...styles.topBtn, backgroundColor: '#8B5CF6', color: '#FFFFFF', borderColor: '#8B5CF6' }}
              >
                {isSaving ? 'Saving...' : '💾 Save Result Edit'}
              </button>
            )}
            {currentResultId && (
              <button 
                onClick={() => setIsGenerating(true)} 
                disabled={isGenerating}
                style={{ ...styles.topBtn, backgroundColor: '#0F766E', color: '#FFFFFF', borderColor: '#0F766E' }}
              >
                {isGenerating ? 'Generating...' : '🚀 Generate Poster'}
              </button>
            )}
            {/* ── Typography Mode Toggle ── */}
            <button
              onClick={toggleTypographyMode}
              title={`Typography Mode: ${typographyMode === 'A' ? 'BIG first / small second' : 'small first / BIG second'}. Click to swap.`}
              style={{ ...styles.topBtn, backgroundColor: typographyMode === 'A' ? '#4F46E5' : '#7C3AED', color: '#fff', borderColor: 'transparent', fontWeight: 700, letterSpacing: 1, minWidth: 44 }}
            >
              ⇅ {typographyMode === 'A' ? 'BIG/small' : 'small/BIG'}
            </button>
            {/* ── Result Number Switcher ── */}
            <button
              onClick={handleResultModeSwitch}
              title={`Result Number Mode: ${resultNumberMode}. Click to cycle presets.`}
              style={{ ...styles.topBtn, backgroundColor: '#BE185D', color: '#fff', borderColor: 'transparent', fontWeight: 600 }}
            >
              🔢 {resultNumberMode}
            </button>
            {/* ── Insert Event Name Layers ── */}
            <button
              onClick={insertEventNameLayers}
              title="Insert pre-styled Event Name Primary + Secondary layers"
              style={{ ...styles.topBtn, backgroundColor: '#0369A1', color: '#fff', borderColor: 'transparent' }}
            >
              ✦ Event Layers
            </button>
            {!currentResultId && (
              <button onClick={() => setShowPublish(true)} style={{ ...styles.topBtn, backgroundColor: '#0F766E', color: '#FFFFFF', borderColor: '#0F766E' }}>🚀 Publish Template</button>
            )}
            <button
              onClick={async () => {
                await useTemplateStore.getState().clearDraft();
                // Reload from the current DB template (no demo fallback)
                const firstTemplate = dbTemplates[0];
                if (firstTemplate?.id) {
                  await useTemplateStore.getState().loadDraftOnStart(firstTemplate.id);
                } else {
                  useLayerStore.getState().setLayers([]);
                  useTemplateStore.getState().setActiveTemplate(null);
                }
                useTemplateStore.getState().markSaved();
              }}
              style={{ ...styles.topBtn, borderColor: '#F87171', color: '#F87171' }}
            >
              🔄 Reset
            </button>
            <button
              onClick={() => {
                const result = historyUndo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              style={{ ...styles.topBtn, opacity: canUndo ? 1 : 0.4 }}
              title="Undo (Ctrl+Z)"
            >↩ Undo</button>
            <button
              onClick={() => {
                const result = historyRedo(layers);
                if (result) useLayerStore.getState().setLayers(result);
              }}
              style={{ ...styles.topBtn, opacity: canRedo ? 1 : 0.4 }}
              title="Redo (Ctrl+Y)"
            >↪ Redo</button>
            <span style={styles.saveStatus}>{saveStatus}</span>
          </div>
        </div>
        {/* Row 2: Tool controls */}
        <div style={styles.topbarRow2}>
          {/* Zoom group */}
          <div style={styles.toolGroup}>
            <button onClick={() => setZoom(Math.max(0.1, zoomLevel - 0.1))} style={styles.toolBtn} title="Zoom Out">−</button>
            <span style={styles.zoomLabel}>{Math.round(zoomLevel * 100)}%</span>
            <button onClick={() => setZoom(zoomLevel + 0.1)} style={styles.toolBtn} title="Zoom In">+</button>
            <button onClick={fitToViewport} style={styles.toolBtn} title="Fit to Screen">⊡ Fit</button>
          </div>
          <div style={styles.toolDivider} />
          {/* Canvas options */}
          <div style={styles.toolGroup}>
            <button onClick={() => setGridVisible(!gridVisible)} style={{ ...styles.toolBtn, color: gridVisible ? '#5EEAD4' : '#94A3B8' }} title="Grid">⊞ Grid</button>
            <button onClick={() => setGridSnap(!gridSnap)} style={{ ...styles.toolBtn, color: gridSnap ? '#5EEAD4' : '#94A3B8' }} title="Snap to Grid">⊹ Snap</button>
            <button onClick={() => setSafeZoneVisible(!safeZoneVisible)} style={{ ...styles.toolBtn, color: safeZoneVisible ? '#5EEAD4' : '#94A3B8' }} title="Safe Zones">⬚ Safe</button>
            <button onClick={() => setRulerVisible(!rulerVisible)} style={{ ...styles.toolBtn, color: rulerVisible ? '#5EEAD4' : '#94A3B8' }} title="Ruler">↔ Ruler</button>
          </div>
          <div style={styles.toolDivider} />
          {/* Add Layer options */}
          <div style={styles.toolGroup}>
            <button onClick={handleAddText} style={{...styles.toolBtn, color: '#38bdf8'}} title="Add new text layer">+ Add Text</button>
          </div>
          <div style={styles.toolDivider} />
          {/* Global Text options */}
          <div style={styles.toolGroup}>
            <button onClick={() => scaleText(0.95)} style={styles.toolBtn} title="Decrease text size">A-</button>
            <button onClick={() => scaleText(1.05)} style={styles.toolBtn} title="Increase text size">A+</button>
          </div>
          <div style={styles.toolDivider} />
          {/* Layer quick actions (shown when a layer is selected) */}
          {selectedLayer && (
            <div style={styles.toolGroup}>
              <button onClick={handleDuplicateLayer} style={styles.toolBtn} title="Duplicate layer">⎘ Dupe</button>
              <button onClick={() => useLayerStore.getState().toggleVisibility(selectedLayer.id)} style={{ ...styles.toolBtn, color: selectedLayer.isVisible ? '#5EEAD4' : '#94A3B8' }} title="Toggle visibility">
                {selectedLayer.isVisible ? '👁 Show' : '🙈 Hide'}
              </button>
              <button onClick={() => useLayerStore.getState().toggleLock(selectedLayer.id)} style={{ ...styles.toolBtn, color: selectedLayer.lockProfile === 'fully-locked' ? '#F59E0B' : '#94A3B8' }} title="Lock/Unlock">
                {selectedLayer.lockProfile === 'fully-locked' ? '🔒 Locked' : '🔓 Lock'}
              </button>
              <button onClick={handleDeleteLayer} style={{ ...styles.toolBtn, color: '#F87171' }} title="Delete layer">🗑 Del</button>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {/* Background */}
          <div style={styles.toolGroup}>
            <input ref={bgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
            <button onClick={() => bgInputRef.current?.click()} style={styles.toolBtn} title="Upload background image">🖼 BG Image</button>
            <button onClick={() => setShowShortcuts(true)} style={styles.toolBtn} title="Keyboard shortcuts">? Keys</button>
          </div>
        </div>
      </div>

      {/* ---- MAIN WORKSPACE ---- */}
      <div style={{ ...styles.workspace, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* ---- LEFT PANEL (Desktop) ---- */}
        {isDesktop && (
          <div style={styles.leftPanel}>
            <div style={styles.panelSection}>
              <h3 style={styles.panelTitle}>Layers</h3>
              {layers.length === 0 && <p style={styles.emptyMsg}>No layers yet.</p>}
              {[...layers].sort((a, b) => b.zIndex - a.zIndex).map((l) => (
                <div
                  key={l.id}
                  onClick={() => useLayerStore.getState().setSelectedIds([l.id])}
                  style={{
                    ...styles.layerItem,
                    backgroundColor: selectedIds.includes(l.id) ? '#2a2a2a' : '#171717',
                    borderColor: selectedIds.includes(l.id) ? '#38bdf8' : '#2a2a2a',
                    opacity: l.isVisible ? 1 : 0.45,
                  }}
                >
                  <span style={styles.layerIcon}>{l.type === 'text' ? 'T' : l.type === 'image' ? '🖼' : '⬜'}</span>
                  <span style={styles.layerName}>{l.name}</span>
                  <div style={styles.layerActions}>
                    <button
                      onClick={(e) => { e.stopPropagation(); useLayerStore.getState().toggleVisibility(l.id); }}
                      style={styles.miniBtn}
                      title={l.isVisible ? 'Hide' : 'Show'}
                    >{l.isVisible ? '👁' : '👁‍🗨'}</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); useLayerStore.getState().toggleLock(l.id); }}
                      style={styles.miniBtn}
                      title={l.isLocked ? 'Unlock' : 'Lock'}
                    >{l.lockProfile === 'fully-locked' ? '🔒' : '🔓'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- CANVAS CENTER ---- */}
        <div style={styles.canvasArea}>
          {!activeTemplate ? (
            // Empty state — no DB template loaded yet
            <div style={styles.emptyStateCenter}>
              <div style={styles.emptyStateCard}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                <h2 style={styles.emptyStateTitle}>No Template Loaded</h2>
                <p style={styles.emptyStateMsg}>
                  Create a database template to start designing and publishing.
                  Templates are stored in Supabase with a unique UUID and can be
                  published to Cloudflare R2.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={styles.emptyStateCta}
                >
                  + Create Database Template
                </button>
                {isDebug && (
                  <p style={{ color: '#475569', fontSize: 11, marginTop: 12 }}>
                    Debug mode: Use the dropdown above to load a local demo template.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.canvasWrapper}>
              <StudioCanvas
                canvasWidth={canvasW}
                canvasHeight={canvasH}
                backgroundUrl={activeTemplate?.background_url}
              />
            </div>
          )}
        </div>


        {/* ---- RIGHT PANEL (Desktop) ---- */}
        {isDesktop && (
          <div style={styles.rightPanel}>
            {selectedLayer ? (
              <>
                <div style={styles.rightPanelStickyHeader}>
                  <h3 style={styles.stickyTitle}>PROPERTIES — {selectedLayer.name}</h3>
                </div>
                <div style={styles.rightPanelContent}>
                  {selectedLayer.type === 'text' && <TextToolbar />}
                  <TransformBlock layer={selectedLayer} />
                  <EffectsBlock layer={selectedLayer} />
                  {selectedLayer.type === 'text' && <VariablePreview layerId={selectedLayer.id} variables={safeVariables} />}
                  <VariableBindingPanel variables={safeVariables} />
                </div>
              </>
            ) : (
              <>
                <div style={styles.rightPanelStickyHeader}>
                  <h3 style={styles.stickyTitle}>POSTER SETTINGS</h3>
                </div>
                <div style={styles.rightPanelContent}>
                  <CanvasSizeBlock />
                  <BackgroundBlock />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- PUBLISHED RESULTS PANEL (Phase 6) ---- */}
      <PublishedResultsPanel festivalId={festivalId} tenantId={tenantId} />

      {/* ---- MOBILE BOTTOM SHEET ---- */}
      {!isDesktop && (
        <MobileBottomSheet
          selectedLayer={selectedLayer}
          onClose={() => useLayerStore.getState().clearSelection()}
        />
      )}

      {/* ---- VALIDATION MODAL ---- */}
      {showValidation && (
        <div style={styles.modalBackdrop} onClick={() => setShowValidation(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Health Report</h3>
            {validationIssues.length === 0 ? (
              <p style={{ color: '#0F766E', fontSize: 13, margin: '16px 0' }}>✓ Template is perfectly healthy.</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', margin: '16px 0' }}>
                {validationIssues.map((iss, i) => (
                  <div key={i} style={{ ...styles.issueRow, backgroundColor: iss.type === 'error' ? '#FEF2F2' : '#FFFBEB', borderColor: iss.type === 'error' ? '#FECACA' : '#FDE68A' }}>
                    <span style={{ fontSize: 16 }}>{iss.type === 'error' ? '❌' : '⚠️'}</span>
                    <span style={{ fontSize: 12, color: '#0F172A' }}>{iss.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowValidation(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && <ShortcutGuide onClose={() => setShowShortcuts(false)} />}
      {showVersionHistory && (
        <div style={styles.modalBackdrop} onClick={() => setShowVersionHistory(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <VersionHistory />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowVersionHistory(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showPublish && (
        <div style={styles.modalBackdrop} onClick={() => setShowPublish(false)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <PublishApproval />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowPublish(false)} style={styles.modalBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- CREATE TEMPLATE MODAL ---- */}
      {showCreateModal && (
        <CreateTemplateModal
          visible={showCreateModal}
          festivalId={festivalId}
          tenantId={tenantId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newId) => {
            setCurrentTemplateId(newId);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* ---- DIAGNOSTICS OVERLAY (ADD-ON 52) ---- */}
      {isDebug && <DiagnosticsOverlay />}

      {/* ---- OFFSCREEN RENDERER FOR GENERATION ---- */}
      {isGenerating && activeTemplate && (
        <OffscreenRenderer
          layers={layers}
          variables={safeVariables}
          width={activeTemplate.width}
          height={activeTemplate.height}
          backgroundUrl={activeTemplate.background_url}
          backgroundTransform={activeTemplate.background_transform}
          onReady={handleCapture}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0f0f0f', fontFamily: 'Inter, sans-serif' },
  offlineBanner: { backgroundColor: '#FEF3C7', color: '#92400E', padding: '8px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' },
  draftBanner: { backgroundColor: '#1E3A8A', color: '#DBEAFE', padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  draftActions: { display: 'flex', gap: 8 },
  draftBtn: { padding: '6px 14px', borderRadius: 8, border: '1px solid #3B82F6', backgroundColor: '#2563EB', color: '#FFFFFF', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  fontWarning: { backgroundColor: '#713F12', color: '#FEF9C3', padding: '8px 16px', fontSize: 12, borderBottom: '1px solid #854D0E' },
  // Topbar — two-row professional toolbar
  topbar: { display: 'flex', flexDirection: 'column', backgroundColor: '#1f1f1f', borderBottom: '1px solid #2a2a2a', flexShrink: 0, userSelect: 'none' },
  topbarRow1: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #2a2a2a' },
  topbarRow2: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', overflowX: 'auto' },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 6 },
  studioTitle: { fontSize: 15, fontWeight: 800, color: '#E2E8F0', letterSpacing: '0.02em' },
  templateName: { fontSize: 12, color: '#94A3B8', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 6, fontWeight: 500 },
  saveStatus: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' },
  // Professional tool buttons
  topBtn: { padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#CBD5E1', touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  toolGroup: { display: 'flex', alignItems: 'center', gap: 2 },
  toolDivider: { width: 1, height: 22, backgroundColor: '#2a2a2a', margin: '0 8px', flexShrink: 0 },
  toolBtn: { padding: '7px 11px', borderRadius: 7, border: '1px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#94A3B8', touchAction: 'manipulation', whiteSpace: 'nowrap', transition: 'all 0.12s' },
  zoomLabel: { fontSize: 12, color: '#CBD5E1', width: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  topSelect: { height: 32, borderRadius: 7, border: '1px solid #2a2a2a', backgroundColor: '#171717', color: '#94A3B8', fontSize: 12, fontWeight: 600, padding: '0 4px' },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPanel: { width: 260, flexShrink: 0, backgroundColor: '#171717', borderRight: '1px solid #2a2a2a', overflowY: 'auto', overflowX: 'visible', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 30 },
  rightPanel: { width: 420, flexShrink: 0, backgroundColor: '#171717', borderLeft: '1px solid #2a2a2a', overflowY: 'hidden', overflowX: 'visible', display: 'flex', flexDirection: 'column', zIndex: 30 },
  rightPanelStickyHeader: { padding: '14px 20px', borderBottom: '1px solid #2a2a2a', backgroundColor: '#1f1f1f', zIndex: 10 },
  stickyTitle: { fontSize: 11, fontWeight: 800, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 },
  rightPanelContent: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  canvasArea: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10, backgroundColor: '#0f0f0f', backgroundImage: 'radial-gradient(#2a2a2a 1px, transparent 1px)', backgroundSize: '24px 24px' },
  canvasWrapper: { flex: 1, position: 'relative', overflow: 'hidden' },
  emptyStateCenter: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateCard: { textAlign: 'center', maxWidth: 440, padding: 40, backgroundColor: '#171717', borderRadius: 16, border: '1px solid #2a2a2a', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' },
  emptyStateTitle: { fontSize: 22, fontWeight: 800, color: '#E2E8F0', marginBottom: 12, marginTop: 0 },
  emptyStateMsg: { fontSize: 14, color: '#94A3B8', lineHeight: '1.6', marginBottom: 24 },
  emptyStateCta: { padding: '12px 28px', borderRadius: 10, border: 'none', backgroundColor: '#0F766E', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' },
  panelSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  panelTitle: { fontSize: 11, fontWeight: 700, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, margin: '0 0 8px' },
  emptyMsg: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '20px 0' },
  layerItem: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 8, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s' },
  layerIcon: { fontSize: 13, flexShrink: 0, width: 22, textAlign: 'center', color: '#94A3B8' },
  layerName: { flex: 1, fontSize: 12, fontWeight: 500, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  layerActions: { display: 'flex', gap: 4 },
  miniBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '3px 5px', borderRadius: 5, lineHeight: 1, transition: 'background 0.1s' },
  modalBackdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: '#171717', borderRadius: 12, padding: 20, width: 400, maxWidth: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #2a2a2a' },
  modalTitle: { fontSize: 16, fontWeight: 700, color: '#E2E8F0', borderBottom: '1px solid #2a2a2a', paddingBottom: 8, margin: 0 },
  issueRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 8, border: '1px solid', marginBottom: 8 },
  modalBtn: { padding: '8px 16px', backgroundColor: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#E2E8F0', cursor: 'pointer' },
};
