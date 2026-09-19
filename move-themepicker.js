const fs = require('fs');
let code = fs.readFileSync('src/components/layout/AdminAppShell.tsx', 'utf8');

// Add ThemePicker to DesktopSidebar profile section
const profileTarget = `              <TouchableOpacity
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                onPress={logout}
                style={styles.logoutButton}
              >`;
              
if (code.includes(profileTarget)) {
  code = code.replace(profileTarget, '<ThemePicker />\n              ' + profileTarget);
}

// Add ThemePicker to Mobile sheetHeader
const sheetHeaderTarget = `              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={onClose}
                style={styles.sheetClose}
              >`;
              
if (code.includes(sheetHeaderTarget)) {
  code = code.replace(sheetHeaderTarget, '<View style={{ marginRight: 10 }}><ThemePicker /></View>\n              ' + sheetHeaderTarget);
}

// Also add to TeamLeaderAppShell
let teamCode = '';
try {
  teamCode = fs.readFileSync('src/components/layout/TeamLeaderAppShell.tsx', 'utf8');
} catch (e) {}

if (teamCode) {
  // Check if it already has ThemePicker, if not, copy the component and add it
  if (!teamCode.includes('ThemePicker = () => {')) {
    // Extract ThemePicker from AdminAppShell
    const pickerRegex = /const ThemePicker = \(\) => \{[\s\S]*?\};\n/;
    const match = code.match(pickerRegex);
    if (match) {
      teamCode = teamCode.replace(/import React, \{ useState, useMemo \} from 'react';/, "import React, { useState, useMemo } from 'react';\n" + match[0]);
    }
  }

  // Add useTheme import if missing
  if (!teamCode.includes('useTheme')) {
    teamCode = teamCode.replace(/import \{ ui \} from '@\/constants\/designSystem';/, "import { ui } from '@/constants/designSystem';\nimport { useTheme } from '@/core/contexts/ThemeContext';\nimport { Palette, Moon, Sun } from 'lucide-react-native';");
  }

  // Add ThemePicker to topbarActions
  const teamTopbarTarget = `<TouchableOpacity style={styles.topbarIconButton}>
                  <Bell size={19} color={ui.colors.textMuted} />
                </TouchableOpacity>`;
  if (teamCode.includes(teamTopbarTarget) && !teamCode.includes('<ThemePicker />')) {
    teamCode = teamCode.replace(teamTopbarTarget, teamTopbarTarget + '\n                <ThemePicker />');
  }

  // Add to mobile sheet header
  const teamSheetHeaderTarget = `              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={onClose}
                style={styles.sheetClose}
              >`;
  if (teamCode.includes(teamSheetHeaderTarget) && !teamCode.includes('marginRight: 10 }}><ThemePicker />')) {
    teamCode = teamCode.replace(teamSheetHeaderTarget, '<View style={{ marginRight: 10 }}><ThemePicker /></View>\n              ' + teamSheetHeaderTarget);
  }

  fs.writeFileSync('src/components/layout/TeamLeaderAppShell.tsx', teamCode);
}

fs.writeFileSync('src/components/layout/AdminAppShell.tsx', code);
console.log('Moved ThemePicker');
