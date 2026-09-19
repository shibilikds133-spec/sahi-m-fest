# Theme Changer Implementation Guide

This document preserves the instructions for setting up the Dynamic Theme Changer in the Sahithyolsav Festival web application. Because the festival was very close, we opted to temporarily remove the feature to guarantee maximum stability.

After the current festival concludes, you can re-enable the theme system by following these steps:

## 1. Core Architecture
The `ThemeContext.tsx` is already present in `src/core/contexts/ThemeContext.tsx`. It provides the `SsfThemeProvider` and the `useTheme` hook.
The design system tokens in `src/constants/designSystem.ts` (e.g. `ui.colors.primary`, `ui.colors.surface`) are wired to read from this context.

## 2. Re-enabling the Theme Provider
To apply the theme system across the app, wrap the root layout in the `SsfThemeProvider`.

In **`src/app/_layout.tsx`**:
1. Import the provider:
   ```tsx
   import { ThemeProvider as SsfThemeProvider } from "@/core/contexts/ThemeContext";
   ```
2. Wrap the existing `ThemeProvider` with it:
   ```tsx
   <SsfThemeProvider>
     <ThemeProvider value={CustomLightTheme}>
       ...
     </ThemeProvider>
   </SsfThemeProvider>
   ```

## 3. Re-enabling the Theme Picker UI
To allow users to select their theme, you can inject a `ThemePicker` component into the App Shell headers.

### The Component
You can add this component inline to the layout files or create a separate file in `src/components/ui/ThemePicker.tsx`:

```tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useTheme } from '@/core/contexts/ThemeContext';
import { ui } from '@/constants/designSystem';
import { Palette, Moon, Sun } from 'lucide-react-native';

export const ThemePicker = () => {
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
```

### Injecting into the App Shells
In **`src/components/layout/AdminAppShell.tsx`** and **`TeamLeaderAppShell.tsx`**:

1. Add it to the Desktop sidebar, above the Logout button:
```tsx
<ThemePicker />
<TouchableOpacity style={styles.logoutButton} onPress={logout}>
```

2. Add it to the Mobile Bottom Sheet header, next to the close button:
```tsx
<View style={{ marginRight: 10 }}>
  <ThemePicker />
</View>
<TouchableOpacity style={styles.sheetClose} onPress={onClose}>
```
