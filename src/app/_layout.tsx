import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Slot, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "@fontsource-variable/inter";
import "../global.css";
import { ActivityIndicator, Platform, View } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_700Bold,
  Poppins_900Black,
} from "@expo-google-fonts/poppins";
import {
  Montserrat_300Light,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useProtectedRoute } from "../core/hooks/useProtectedRoute";
import { useAuthStore } from "../core/store/authStore";
import { NotificationProvider } from "../core/contexts/NotificationContext";
import { NotificationToast } from "../components/ui/NotificationToast";
import { useParticipantProfileUpdates } from "../core/hooks/useParticipantProfileUpdates";

// Removed top-level preventAutoHideAsync, moving it inside component

const LOADING_BG = "#011635";

function AppLoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: LOADING_BG,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" color="#c69a53" />
    </View>
  );
}

function LayoutContent() {
  const tenantId = useAuthStore((state) => state.tenant_id);
  // Observe the festival already loaded by admin screens; no extra API read.
  const { data: activeFestival } = useQuery<{ id: string } | null>({
    queryKey: ['active-festival', tenantId], enabled: false,
  });
  useParticipantProfileUpdates(activeFestival?.id);
  const blockProtectedCoreRoute = useProtectedRoute();
  if (blockProtectedCoreRoute) return <AppLoadingScreen />;
  return <Slot />;
}

export const unstable_settings = {
  anchor: "(public)",
};

const queryClient = new QueryClient();

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
    CooperBlack: require("../../fonts/CooperBlack-Std.otf"),
  });

  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {});
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && initialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, initialized]);

  if ((!fontsLoaded && !fontError) || !initialized) {
    return <AppLoadingScreen />;
  }

  const CustomLightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: "#F6F7F9",
      card: "#FFFFFF",
      border: "#E2E8F0",
      primary: "#0F766E",
      text: "#111827",
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={CustomLightTheme}>
        <NotificationProvider>
          <NotificationToast />
          <LayoutContent />
          <StatusBar style="dark" />
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

