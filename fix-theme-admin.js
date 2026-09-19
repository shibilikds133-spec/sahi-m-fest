const fs = require('fs');

function fixTheme() {
  let code = fs.readFileSync('src/app/(admin)/index.tsx', 'utf8');

  // 1. Inject design system
  if (!code.includes('designSystem')) {
    code = code.replace(
      "import { useAdminDashboard }", 
      "import { ui } from '../../constants/designSystem';\nimport { useAdminDashboard }"
    );
  }

  // 2. Remove color constants
  const constantsToRemove = [
    'NAVY', 'MUTED', 'PAGE_BG', 'BORDER', 'EMERALD', 'EMERALD_DARK', 
    'SIDEBAR', 'SIDEBAR_DARK', 'SUCCESS', 'WARNING', 'DANGER', 'INFO'
  ];
  
  constantsToRemove.forEach(c => {
    const regex = new RegExp(`const ${c} = .*`, 'g');
    code = code.replace(regex, '');
  });

  // 3. Fix surfaces
  code = code.replace(
    /const dashboardBgStyle = [\s\S]*?\} as any;/g, 
    "const dashboardBgStyle = {\n  backgroundColor: ui.colors.background,\n};"
  );
  code = code.replace(
    /const welcomeSurface = [\s\S]*?\} as any;/g, 
    "const welcomeSurface = {\n  backgroundColor: ui.colors.surface,\n  borderColor: ui.colors.border,\n  borderWidth: 1,\n  borderRadius: 10,\n  shadowColor: '#0F172A',\n  shadowOpacity: 0.015,\n  shadowRadius: 3,\n  shadowOffset: { width: 0, height: 1 },\n  elevation: 1,\n};"
  );
  code = code.replace(
    /const cardSurface = [\s\S]*?\} as any;/g, 
    "const cardSurface = {\n  backgroundColor: ui.colors.surface,\n  borderColor: ui.colors.border,\n  borderWidth: 1,\n  borderRadius: 10,\n  shadowColor: '#0F172A',\n  shadowOpacity: 0.015,\n  shadowRadius: 3,\n  shadowOffset: { width: 0, height: 1 },\n};"
  );
  code = code.replace(
    /const actionCardSurface = [\s\S]*?\} as any;/g, 
    "const actionCardSurface = {\n  backgroundColor: ui.colors.surface,\n  borderColor: ui.colors.border,\n  borderWidth: 1,\n  borderRadius: 10,\n  shadowColor: '#0F172A',\n  shadowOpacity: 0.015,\n  shadowRadius: 3,\n  shadowOffset: { width: 0, height: 1 },\n  elevation: 1,\n};"
  );
  code = code.replace(
    /const panelSurface = [\s\S]*?\} as any;/g, 
    "const panelSurface = {\n  backgroundColor: ui.colors.surface,\n  borderColor: ui.colors.border,\n  borderWidth: 1,\n  borderRadius: 10,\n  shadowColor: '#0F172A',\n  shadowOpacity: 0.015,\n  shadowRadius: 3,\n  shadowOffset: { width: 0, height: 1 },\n  elevation: 1,\n};"
  );

  // 4. Replace variable usages
  // Use boundaries to avoid matching parts of words, though these are all uppercase constants
  code = code.replace(/\bNAVY\b/g, 'ui.colors.text');
  code = code.replace(/\bMUTED\b/g, 'ui.colors.textMuted');
  code = code.replace(/\bEMERALD_DARK\b/g, 'ui.colors.primaryHover');
  code = code.replace(/\bEMERALD\b/g, 'ui.colors.primary');
  code = code.replace(/\bSUCCESS\b/g, 'ui.colors.success');
  code = code.replace(/\bWARNING\b/g, 'ui.colors.warning');
  code = code.replace(/\bDANGER\b/g, 'ui.colors.destructive');
  code = code.replace(/\bINFO\b/g, 'ui.colors.info');
  code = code.replace(/\bBORDER\b/g, 'ui.colors.border');
  
  // 5. Fix SidebarItem
  code = code.replace(/color: active \? '#FFFFFF' : 'rgba\(255, 255, 255, 0\.72\)'/g, "color: ui.colors.sidebarText");
  code = code.replace(/color=\{active \? '#FFFFFF' : 'rgba\(255, 255, 255, 0\.65\)'\}/g, "color={ui.colors.sidebarText}");
  code = code.replace(/backgroundColor: active \? 'rgba\(255, 255, 255, 0\.14\)' : 'transparent'/g, "backgroundColor: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent'");
  
  // 6. InsightChip
  code = code.replace(/backgroundColor: active \? '#E6F6F2' : '#FFFFFF'/g, "backgroundColor: active ? ui.colors.primarySoft : ui.colors.surface");
  
  // 7. SectionHeader action button
  code = code.replace(/backgroundColor: '#ECFDF5'/g, "backgroundColor: ui.colors.primarySoft");
  
  // 8. Welcome Back specific hardcoding
  code = code.replace(/backgroundColor: '#F8FAFC'/g, "backgroundColor: ui.colors.surfaceMuted");
  
  // 9. Hardcoded stroke colors in Svg
  code = code.replace(/stroke="#F1F5F9"/g, "stroke={ui.colors.surfaceStrong}");
  
  // 10. Dashboard specific Text (footer)
  code = code.replace(/color: Platform\.OS === 'web' \? 'var\(--ssf-text-muted, #64748B\)' : '#64748B'/g, "color: ui.colors.textMuted");

  // 11. EmptyAnalytics
  code = code.replace(/#CBD5E1/g, "ui.colors.textSubtle");

  fs.writeFileSync('src/app/(admin)/index.tsx', code);
  console.log('Fixed themes in Admin Dashboard');
}

fixTheme();
