const fs = require('fs');

// 1. Add ThemeProvider to _layout.tsx
let layoutCode = fs.readFileSync('src/app/_layout.tsx', 'utf8');
if (!layoutCode.includes('ThemeProvider as SsfThemeProvider')) {
  layoutCode = layoutCode.replace(/import \{ ThemeProvider \} from '@react-navigation\/native';/, 'import { ThemeProvider } from \'@react-navigation/native\';\nimport { ThemeProvider as SsfThemeProvider } from \'@/core/contexts/ThemeContext\';');
  layoutCode = layoutCode.replace(/<ThemeProvider value=\{CustomLightTheme\}>/, '<SsfThemeProvider>\n      <ThemeProvider value={CustomLightTheme}>');
  layoutCode = layoutCode.replace(/<\/ThemeProvider>/, '</ThemeProvider>\n      </SsfThemeProvider>');
  fs.writeFileSync('src/app/_layout.tsx', layoutCode);
}

// 2. Add ThemePicker to AdminAppShell.tsx
let shellCode = fs.readFileSync('src/components/layout/AdminAppShell.tsx', 'utf8');

const themePickerCode = `
import { useTheme } from '@/core/contexts/ThemeContext';
import { Palette, Moon, Sun } from 'lucide-react-native';

const ThemePicker = () => {
  const { theme, setThemeOption } = useTheme();
  const [open, setOpen] = useState(false);
  
  const options = [
    { id: 'light', label: 'Light', icon: <Sun size={14} color="#B8860B" /> },
    { id: 'dark', label: 'Dark', icon: <Moon size={14} color="#B8860B" /> },
    { id: 'gruvbox', label: 'Gruvbox', icon: <Palette size={14} color="#D79921" /> },
    { id: 'nord', label: 'Nord', icon: <Palette size={14} color="#88C0D0" /> },
    { id: 'dracula', label: 'Dracula', icon: <Palette size={14} color="#BD93F9" /> },
    { id: 'purple-dark', label: 'Purple Dark', icon: <Palette size={14} color="#8B5CF6" /> },
  ];

  return (
    <View style={{ position: 'relative', zIndex: 9999 }}>
      <TouchableOpacity 
        onPress={() => setOpen(!open)}
        style={{ padding: 6, borderRadius: 8, backgroundColor: ui.colors.surfaceMuted, borderWidth: 1, borderColor: ui.colors.border }}
      >
        <Palette size={19} color={ui.colors.textMuted} />
      </TouchableOpacity>
      
      {open && (
        <View className="absolute right-0 top-10 z-[1000] rounded-xl py-1.5 border border-ui-border bg-ui-surface shadow-lg shadow-black/15 w-48">
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => { setThemeOption(opt.id as any); setOpen(false); }}
              className="flex-row items-center px-4 py-2 hover:bg-ui-surface-muted"
              style={{ backgroundColor: theme === opt.id ? ui.colors.surfaceStrong : 'transparent' }}
            >
              <View className="w-6 items-center justify-center mr-2">{opt.icon}</View>
              <Text className="font-poppins text-xs" style={{ color: ui.colors.text }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};
`;

if (!shellCode.includes('ThemePicker')) {
  shellCode = shellCode.replace(/import React, \{ useState, useMemo \} from 'react';/, 'import React, { useState, useMemo } from \'react\';\n' + themePickerCode);
  
  // Inject into topbarActions
  const topbarTarget = `<TouchableOpacity style={styles.topbarIconButton}>
                  <Bell size={19} color={ui.colors.textMuted} />
                </TouchableOpacity>`;
  shellCode = shellCode.replace(topbarTarget, topbarTarget + '\n                <ThemePicker />');
  
  fs.writeFileSync('src/components/layout/AdminAppShell.tsx', shellCode);
}
console.log('Restored Theme Picker and Provider');
