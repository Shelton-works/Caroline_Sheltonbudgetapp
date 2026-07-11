import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CATEGORY_BUDGETS_KEY = '@ourfinances_category_budgets';

const DEFAULT_BUDGETS: Record<string, string> = {
  Transportation: '1000',
  House: '1000',
  Office: '500',
  Education: '800',
  Food: '600',
  Utilities: '400',
  Entertainment: '300',
  Other: '500',
};

function loadBudgets(): Promise<Record<string, string>> {
  return AsyncStorage.getItem(CATEGORY_BUDGETS_KEY).then((data) => {
    if (data) {
      const parsed = JSON.parse(data);
      // Merge with defaults in case new categories were added
      const merged = { ...DEFAULT_BUDGETS, ...parsed };
      return merged;
    }
    return { ...DEFAULT_BUDGETS };
  }).catch(() => ({ ...DEFAULT_BUDGETS }));
}

function saveBudgets(budgets: Record<string, string>): Promise<void> {
  return AsyncStorage.setItem(CATEGORY_BUDGETS_KEY, JSON.stringify(budgets));
}

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    user,
    budget,
    partnerCode,
    isLoading,
    generatePartnerCode,
    linkPartner,
    disconnectPartner,
    updateBudgetLimit,
    logout,
  } = useBudgetStore();

  const [inputCode, setInputCode] = useState('');
  const [limit, setLimit] = useState(budget?.monthly_limit.toString() || '2000');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);

  // Update check state
  const [updateState, setUpdateState] = useState<
    { status: 'idle' | 'checking' | 'uptodate' | 'available' | 'error'; message?: string }
  >({ status: 'idle' });

  const isElectron = !!(Platform.OS === 'web' && (window as any).electronAPI);
  const appVersion = Constants.expoConfig?.version || '2.2.0';

  const userInitiated = useRef(false);

  // Load category budgets on mount
  useEffect(() => {
    loadBudgets().then((b) => {
      setCategoryBudgets(b);
      setBudgetsLoaded(true);
    });
  }, []);

  // Listen for update events from the main process
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    const cleanups = [
      api.onUpdateNotAvailable(() => {
        if (userInitiated.current) {
          setUpdateState({ status: 'uptodate', message: 'You have the latest version!' });
          userInitiated.current = false;
        }
      }),
      api.onUpdateAvailable(() => {
        if (userInitiated.current) {
          setUpdateState({ status: 'available' });
          userInitiated.current = false;
        }
      }),
      api.onUpdateError((msg: string) => {
        if (userInitiated.current) {
          setUpdateState({ status: 'error', message: msg });
          userInitiated.current = false;
        }
      }),
    ];

    return () => cleanups.forEach((fn) => fn?.());
  }, []);

  const handleCheckUpdates = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    userInitiated.current = true;
    setUpdateState({ status: 'checking' });
    api.checkForUpdates();
  }, []);

  // Check if user has a linked (shared) group
  const isLinked = (budget?.profiles_count ?? 1) > 1;

  const handleGenerateCode = async () => {
    setLinkError(null);
    setSuccessMsg(null);
    await generatePartnerCode();
  };

  const handleShareCode = async () => {
    if (!partnerCode) return;
    try {
      await Share.share({
        message: `Here is my budget linking code: ${partnerCode}. Enter this code in the app to link our budgets and share finances! 💰`,
      });
    } catch (error: any) {
      console.log('Error sharing:', error.message);
    }
  };

  const handleLink = async () => {
    setLinkError(null);
    setSuccessMsg(null);
    if (inputCode.trim().length !== 6) {
      setLinkError('Please enter a 6-digit code.');
      return;
    }

    try {
      await linkPartner(inputCode.trim());
      setSuccessMsg('✨ Successfully linked budgets! You are now connected.');
      setInputCode('');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link. Please check the code and try again.');
    }
  };

  const handleDisconnect = async () => {
    setLinkError(null);
    setSuccessMsg(null);
    Alert.alert(
      'Disconnect Partner',
      'Are you sure you want to disconnect from your partner? You will no longer share a budget or savings goals, and you will be moved to a private budget.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectPartner();
              setSuccessMsg('Successfully disconnected from your partner.');
            } catch (err: any) {
              setLinkError(err.message || 'Failed to disconnect. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleUpdateLimit = async () => {
    const numLimit = parseFloat(limit);
    if (!isNaN(numLimit) && numLimit > 0) {
      await updateBudgetLimit(numLimit);
      setSuccessMsg('Monthly budget limit updated successfully.');
    }
  };

  const handleCategoryBudgetChange = useCallback((cat: string, value: string) => {
    setCategoryBudgets((prev) => ({ ...prev, [cat]: value }));
  }, []);

  const handleSaveCategoryBudgets = useCallback(async () => {
    await saveBudgets(categoryBudgets);
    setSuccessMsg('Category budgets saved!');
  }, [categoryBudgets]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Success/Error messages */}
        {successMsg && (
          <View style={[styles.messageCard, { backgroundColor: colors.incomeLight }]}>
            <Text style={[styles.successText, { color: colors.income }]}>{successMsg}</Text>
          </View>
        )}

        {/* Profile Card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Account</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: colors.onPrimary }]}>
                {user?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.onSurface }]}>{user?.display_name || 'User'}</Text>
              <Text style={[styles.profileEmail, { color: colors.onSurfaceVariant }]}>{user?.email || ''}</Text>
            </View>
          </View>
        </View>

        {/* Partner Link Section */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Partner Connection</Text>

          {isLinked ? (
            <View>
              <View style={styles.linkedBanner}>
                <Text style={styles.linkedEmoji}>❤️</Text>
                <View>
                  <Text style={[styles.linkedText, { color: colors.income }]}>Connected</Text>
                  <Text style={[styles.linkedSubtext, { color: colors.onSurfaceVariant }]}>
                    Your budgets are synced in real-time
                  </Text>
                </View>
              </View>
              {linkError && <Text style={[styles.errorText, { marginTop: 8 }]}>{linkError}</Text>}
              <TouchableOpacity
                style={[styles.disconnectBtn, { borderColor: colors.expense }]}
                onPress={handleDisconnect}
                disabled={isLoading}
              >
                <Text style={[styles.disconnectBtnText, { color: colors.expense }]}>
                  {isLoading ? 'Disconnecting...' : 'Disconnect Partner'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={[styles.description, { color: colors.onSurfaceVariant }]}>
                Connect with your partner to share a budget, track expenses together, and stay in sync.
              </Text>

              {linkError && <Text style={styles.errorText}>{linkError}</Text>}

              <Text style={[styles.subLabel, { color: colors.onSurface }]}>Have a code? Enter it here:</Text>
              <View style={styles.rowInput}>
                <TextInput
                  style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={inputCode}
                  onChangeText={setInputCode}
                />
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.primary }]}
                  onPress={handleLink}
                  disabled={isLoading}
                >
                  <Text style={styles.btnText}>Link</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

              <Text style={[styles.subLabel, { color: colors.onSurface }]}>Or generate your own code to share:</Text>
              {partnerCode ? (
                <View style={[styles.codeCard, { backgroundColor: colors.surfaceContainerLow }]}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{partnerCode}</Text>
                  <TouchableOpacity
                    style={[styles.btnSmall, { backgroundColor: colors.primary }]}
                    onPress={handleShareCode}
                  >
                    <Text style={styles.btnSmallText}>Share</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btnOutline, { borderColor: colors.primary }]}
                  onPress={handleGenerateCode}
                  disabled={isLoading}
                >
                  <Text style={[styles.btnOutlineText, { color: colors.primary }]}>
                    {isLoading ? 'Generating...' : 'Generate Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Monthly Budget */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Monthly Budget</Text>
          <Text style={[styles.description, { color: colors.onSurfaceVariant }]}>
            Set your shared monthly budget limit. This adjusts your available balance indicator.
          </Text>
          <View style={styles.rowInput}>
            <TextInput
              style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
              placeholder="Budget Limit"
              placeholderTextColor={colors.onSurfaceVariant}
              keyboardType="numeric"
              value={limit}
              onChangeText={setLimit}
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={handleUpdateLimit}
            >
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Budgets */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Category Budgets</Text>
          <Text style={[styles.description, { color: colors.onSurfaceVariant }]}>
            Set monthly spending limits per category. These appear in the Ledger to help you stay on track.
          </Text>
          {budgetsLoaded && (
            <>
              {Object.entries(DEFAULT_BUDGETS).map(([cat, _default]) => (
                <View key={cat} style={styles.catBudgetRow}>
                  <Text style={[styles.catBudgetLabel, { color: colors.onSurface }]}>{cat}</Text>
                  <View style={styles.catBudgetInputRow}>
                    <Text style={[styles.catBudgetDollar, { color: colors.onSurfaceVariant }]}>$</Text>
                    <TextInput
                      style={[styles.catBudgetInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                      keyboardType="numeric"
                      value={categoryBudgets[cat] || _default}
                      onChangeText={(t) => handleCategoryBudgetChange(cat, t)}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveBudgetsBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveCategoryBudgets}
              >
                <Text style={styles.btnText}>Save Category Budgets</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* App Info — Updates */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>App Info</Text>

          <View style={styles.versionRow}>
            <Text style={[styles.versionLabel, { color: colors.onSurfaceVariant }]}>Version</Text>
            <Text style={[styles.versionValue, { color: colors.onSurface }]}>{appVersion}</Text>
          </View>

          {isElectron ? (
            <>
              <TouchableOpacity
                style={[styles.checkUpdatesBtn, { backgroundColor: updateState.status === 'checking' ? colors.surfaceContainerLow : colors.primary, borderColor: colors.primary }]}
                onPress={handleCheckUpdates}
                disabled={updateState.status === 'checking'}
              >
                <Text style={[styles.checkUpdatesText, { color: updateState.status === 'checking' ? colors.onSurfaceVariant : '#FFFFFF' }]}>
                  {updateState.status === 'checking' ? 'Checking for updates…' : 'Check for Updates'}
                </Text>
              </TouchableOpacity>
              {updateState.status === 'uptodate' && (
                <View style={styles.updateStatusRow}>
                  <Text style={styles.upToDateEmoji}>✅</Text>
                  <Text style={[styles.updateStatusText, { color: colors.income }]}>{updateState.message}</Text>
                </View>
              )}
              {updateState.status === 'error' && (
                <View style={styles.updateStatusRow}>
                  <Text style={styles.upToDateEmoji}>⚠️</Text>
                  <Text style={[styles.updateStatusText, { color: '#BA1A1A' }]} numberOfLines={2}>Update check failed: {updateState.message}</Text>
                </View>
              )}
              {updateState.status === 'available' && (
                <Text style={[styles.updateHint, { color: colors.onSurfaceVariant }]}>An update is available — see the banner at the top of the screen to download.</Text>
              )}
            </>
          ) : (
            <Text style={[styles.updateHint, { color: colors.onSurfaceVariant }]}>Updates are handled automatically through your device's app store.</Text>
          )}
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.expense }]} onPress={logout}>
          <Text style={[styles.logoutBtnText, { color: colors.expense }]}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingVertical: 16,
    shadowColor: '#D1D9E6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  title: { fontSize: 20, fontWeight: '700', fontFamily: 'Montserrat' },
  scrollContent: { padding: 24, gap: 16 },
  card: {
    padding: 20, borderRadius: 20, marginBottom: 16,
    shadowColor: '#D1D9E6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 16 },
  messageCard: { padding: 16, borderRadius: 12, marginBottom: 16 },
  successText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '700' },
  profileEmail: { fontSize: 13, marginTop: 2 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  rowInput: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  btn: { paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  divider: { height: 1, width: '100%', marginVertical: 20 },
  subLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  btnOutline: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnOutlineText: { fontSize: 14, fontWeight: '700' },
  codeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#DDC0BA',
  },
  codeText: { fontSize: 24, fontWeight: '700', letterSpacing: 2 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
  btnSmallText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#BA1A1A', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  linkedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  linkedEmoji: { fontSize: 24 },
  linkedText: { fontSize: 16, fontWeight: '700' },
  linkedSubtext: { fontSize: 13, marginTop: 2 },
  logoutBtn: { borderWidth: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 40 },
  logoutBtnText: { fontSize: 15, fontWeight: '700' },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  versionLabel: { fontSize: 14, fontWeight: '500' },
  versionValue: { fontSize: 14, fontWeight: '700' },
  checkUpdatesBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  checkUpdatesText: { fontSize: 14, fontWeight: '700' },
  updateStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  upToDateEmoji: { fontSize: 16 },
  updateStatusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  updateHint: { fontSize: 12, fontWeight: '500', marginTop: 12, lineHeight: 16 },
  disconnectBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  disconnectBtnText: { fontSize: 14, fontWeight: '700' },

  // Category Budgets
  catBudgetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, gap: 12,
  },
  catBudgetLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  catBudgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 120 },
  catBudgetDollar: { fontSize: 15, fontWeight: '500' },
  catBudgetInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '600', textAlign: 'right', flex: 1 },
  saveBudgetsBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
