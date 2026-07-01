import { useCallback, useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme, ActivityIndicator, View, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';

import OnboardingScreen from '@/components/OnboardingScreen';
import { useBudgetStore } from '@/store/useBudgetStore';
import AppTabs from '@/components/app-tabs';

// Prevent splash from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { token, isLoading, init } = useBudgetStore();
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Load Montserrat font via @expo-google-fonts/montserrat
  // Use module variables as keys so the package auto-registers proper weight metadata
  // under the 'Montserrat' family name, enabling fontFamily:'Montserrat' + fontWeight:'700'
  const [fontsLoaded, fontsError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  useEffect(() => {
    init()
      .then(() => setInitialized(true))
      .catch((err) => {
        setInitError(err?.message || 'Failed to initialize');
        setInitialized(true);
      });
  }, []);

  // Wait for fonts and store init
  const ready = initialized && (fontsLoaded || fontsError);

  if (!ready || isLoading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9F9F9' }}>
          <ActivityIndicator size="large" color="#9F402D" />
          {initError && (
            <Text style={{ marginTop: 16, color: '#BA1A1A', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 }}>
              {initError}
            </Text>
          )}
        </View>
      </ThemeProvider>
    );
  }

  // Show onboarding if no token (not logged in yet)
  if (!token) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <OnboardingScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}
