import { useCallback, useEffect, useState, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme, ActivityIndicator, View, Text, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';

import OnboardingScreen from '@/components/OnboardingScreen';
import UpdateNotification from '@/components/UpdateNotification';
import { useBudgetStore } from '@/store/useBudgetStore';
import { api } from '@/lib/api';
import AppTabs from '@/components/app-tabs';

// Prevent splash from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { token, isLoading, init } = useBudgetStore();
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Track whether we've already registered push notifications this session
  const pushRegistered = useRef(false);

  // Register for push notifications when user is logged in
  useEffect(() => {
    if (!token || pushRegistered.current) return;
    pushRegistered.current = true;

    (async () => {
      try {
        // Only register on physical Android/iOS devices
        if (Platform.OS === 'web') return;

        // Set up Android notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
          });
        }

        // Request permission (may prompt the user)
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Get the Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'b0db9be5-501d-47ae-809c-6c760f4ca974',
        });

        // Send token to backend
        await api.registerPushToken(tokenData.data);
        console.log('Push token registered:', tokenData.data);
      } catch (err) {
        // Silently fail — push notifications are a nice-to-have, not critical
        console.log('Failed to register push notifications:', err);
      }
    })();
  }, [token]);

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

  if (!ready) {
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
      <UpdateNotification />
      <View style={{ flex: 1, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
        <AppTabs />
      </View>
    </ThemeProvider>
  );
}
