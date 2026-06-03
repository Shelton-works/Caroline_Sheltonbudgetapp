import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  Share,
} from 'react-native';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors } from '../constants/theme';

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
    updateBudgetLimit,
    logout,
    theme,
    setTheme
  } = useBudgetStore();

  const [inputCode, setInputCode] = useState('');
  const [limit, setLimit] = useState(budget?.monthly_limit.toString() || '2000');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check if user is linked (in mock: group-shared-123 means linked)
  const isLinked = user?.group_id === 'group-shared-123';
  const partnerName = user?.display_name === 'Alex' ? 'Taylor' : 'Alex';
  const partnerEmail = user?.display_name === 'Alex' ? 'taylor@example.com' : 'alex@example.com';

  const handleGenerateCode = async () => {
    setLinkError(null);
    await generatePartnerCode();
  };

  const handleShareCode = async () => {
    if (!partnerCode) return;
    try {
      await Share.share({
        message: `Here is my budget linking code: ${partnerCode}. Enter this code in your Caroline Budget App to link our budgets!`,
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
      setSuccessMsg('Successfully linked budgets with your partner!');
      setInputCode('');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link budgets. Check the code and try again.');
    }
  };

  const handleUpdateLimit = async () => {
    const numLimit = parseFloat(limit);
    if (!isNaN(numLimit) && numLimit > 0) {
      await updateBudgetLimit(numLimit);
      setSuccessMsg('Monthly budget limit updated successfully.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {/* Profile Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Account Details</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.display_name}</Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Partner Link Section (Core Feature) */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Partner Link</Text>
          
          {isLinked ? (
            <View style={styles.linkedContainer}>
              <Text style={[styles.linkedText, { color: colors.text }]}>
                Linked with <Text style={{ fontWeight: 'bold' }}>{partnerName}</Text> ❤️
              </Text>
              <Text style={[styles.linkedSubtext, { color: colors.textSecondary }]}>
                {partnerEmail}
              </Text>
              <Text style={[styles.syncStatus, { color: colors.income }]}>
                ● Real-time budget sync active
              </Text>
            </View>
          ) : (
            <View style={styles.unlinkedContainer}>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                Link budgets with a partner to share transactions, dynamic balances, and view notifications in real-time.
              </Text>

              {/* Show error or success messages */}
              {linkError && <Text style={styles.errorText}>{linkError}</Text>}
              {successMsg && <Text style={styles.successText}>{successMsg}</Text>}

              {/* Enter partner code form */}
              <View style={styles.rowInput}>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundElement },
                  ]}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={inputCode}
                  onChangeText={setInputCode}
                />
                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleLink}>
                  <Text style={styles.btnText}>Link</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Generate code */}
              <Text style={[styles.subLabel, { color: colors.text }]}>Generate your link code:</Text>
              {partnerCode ? (
                <View style={styles.codeRevealContainer}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{partnerCode}</Text>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { backgroundColor: colors.backgroundElement }]}
                    onPress={handleShareCode}
                  >
                    <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Share Code</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.btnOutline, { borderColor: colors.primary }]}
                  onPress={handleGenerateCode}
                  disabled={isLoading}
                >
                  <Text style={[styles.btnOutlineText, { color: colors.primary }]}>
                    {isLoading ? 'Generating...' : 'Generate 6-Digit Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Budget limit settings */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Budget Parameters</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Set your shared monthly budget limit. This will immediately adjust your "LEFT OF" indicator.
          </Text>
          <View style={styles.rowInput}>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundElement },
              ]}
              placeholder="Budget Limit"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={limit}
              onChangeText={setLimit}
            />
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleUpdateLimit}>
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Theme select */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Preferences</Text>
          <View style={styles.preferenceRow}>
            <Text style={[styles.preferenceLabel, { color: colors.text }]}>Dark Mode</Text>
            <TouchableOpacity
              style={[styles.themeBtn, { backgroundColor: colors.backgroundElement }]}
              onPress={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              <Text style={[styles.themeBtnText, { color: colors.primary }]}>
                {theme === 'light' ? 'Off' : 'On'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.expense }]} onPress={logout}>
          <Text style={[styles.logoutBtnText, { color: colors.expense }]}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  rowInput: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  btn: {
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 20,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  btnOutline: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  codeRevealContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  codeText: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  btnSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF5C5A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  successText: {
    color: '#00A699',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  linkedContainer: {
    paddingVertical: 10,
  },
  linkedText: {
    fontSize: 16,
  },
  linkedSubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  syncStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 16,
  },
  unlinkedContainer: {},
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preferenceLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  themeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  themeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
