import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Poppins_400Regular, Poppins_700Bold, Poppins_900Black } from '@expo-google-fonts/poppins';
import { Montserrat_300Light, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useProtectedRoute } from '../core/hooks/useProtectedRoute';
import { useAuthStore } from '../core/store/authStore';
import { NotificationProvider } from '../core/contexts/NotificationContext';
import { NotificationToast } from '../components/ui/NotificationToast';

export const unstable_settings = {
 anchor: '(public)',
};

const queryClient = new QueryClient();

function LayoutContent() {
 useProtectedRoute();
 return <Slot />;
}

export default function RootLayout() {
 const colorScheme = useColorScheme();
 const checkSession = useAuthStore((state) => state.checkSession);
 const initialized = useAuthStore((state) => state.initialized);

 const [fontsLoaded, fontError] = useFonts({
 Poppins_400Regular,
 Poppins_700Bold,
 Poppins_900Black,
 Montserrat_300Light,
 Montserrat_700Bold,
 'CooperBlack': require('../../fonts/CooperBlack-Std.otf'),
 });

 useEffect(() => {
   checkSession();
 }, [checkSession]);

 useEffect(() => {
   if ((fontsLoaded || fontError) && initialized) {
     SplashScreen.hideAsync();
   }
 }, [fontsLoaded, fontError, initialized]);

 if ((!fontsLoaded && !fontError) || !initialized) {
   return null;
 }

 const CustomLightTheme = {
 ...DefaultTheme,
 colors: {
 ...DefaultTheme.colors,
 background: '#F8FAFC',
 },
 };

 return (
 <QueryClientProvider client={queryClient}>
 <ThemeProvider value={CustomLightTheme}>
 <NotificationProvider>
 <NotificationToast />
 <LayoutContent />
 <StatusBar style="auto" />
 </NotificationProvider>
 </ThemeProvider>
 </QueryClientProvider>
 );
}
