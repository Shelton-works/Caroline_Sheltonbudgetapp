import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme, StatusBar } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

const tabs = [
  { name: 'index', label: 'Home', icon: 'wallet' },
  { name: 'analytics', label: 'Logs', icon: 'chart' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pathname = usePathname();
  const router = useRouter();

  const currentTab = pathname === '/' ? 'index' : pathname.replace('/', '');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="analytics" />
        <Tabs.Screen name="settings" />
      </Tabs>

      {/* Neomorphic Bottom Navigation Bar */}
      <View style={[styles.bottomNav, { backgroundColor: colors.background }]}>
        <View style={styles.navInner}>
          {tabs.map((tab) => {
            const isActive = currentTab === tab.name;
            return (
              <Pressable
                key={tab.name}
                style={({ pressed }) => [
                  styles.navItem,
                  isActive && styles.navItemActive,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => router.replace(tab.name === 'index' ? '/' : `/${tab.name}` as any)}
              >
                <View style={[styles.navIcon, isActive && { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.navIconText, { color: isActive ? colors.onPrimary : colors.secondary }]}>
                    {tab.label === 'Overview' ? '💰' : tab.label === 'Ledger' ? '📊' : '⚙️'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    { color: isActive ? colors.primary : colors.onSurfaceVariant },
                    isActive && styles.navLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bottomNav: {
    paddingBottom: 12,
    paddingTop: 8,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    // Neomorphic extruded shadow effect
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  navInner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.xl,
    minWidth: 80,
  },
  navItemActive: {
    // Pressed active state
    shadowColor: '#D1D9E6',
    shadowOffset: { width: -3, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  navIconText: {
    fontSize: 20,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.04,
  },
  navLabelActive: {
    fontWeight: '700',
  },
});
