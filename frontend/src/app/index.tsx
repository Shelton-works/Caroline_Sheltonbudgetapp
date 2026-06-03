import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing } from '../constants/theme';
import { ProgressBar } from '../components/ProgressBar';
import { AddTransactionModal } from '../components/AddTransactionModal';

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    token,
    user,
    budget,
    transactions,
    isLoading,
    error,
    login,
    logout,
    fetchData,
    addTransaction,
    theme,
    setTheme
  } = useBudgetStore();

  const [secretPhrase, setSecretPhrase] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Sync theme
  useEffect(() => {
    setTheme(scheme === 'dark' ? 'dark' : 'light');
  }, [scheme]);

  // Fetch data on login
  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const handleUnlock = async () => {
    setAuthError(null);
    const phrase = secretPhrase.trim();
    if (!phrase) {
      setAuthError('Please enter your secret phrase.');
      return;
    }
    let targetEmail = '';
    if (phrase === 'alex-secure-phrase-777') {
      targetEmail = 'alex@example.com';
    } else if (phrase === 'taylor-secure-phrase-888') {
      targetEmail = 'taylor@example.com';
    } else {
      setAuthError('Access Denied: Invalid secret phrase.');
      return;
    }
    try {
      await login(targetEmail);
    } catch (err: any) {
      setAuthError(err.message || 'Unlock failed');
    }
  };

  if (!token) {
    // RENDER GATEKEEPER / ACCESS VERIFICATION SCREEN
    return (
      <SafeAreaView style={[styles.welcomeContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.welcomeScroll}>
          {/* Welcome Text */}
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>Caroline Budget</Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
            Enter secret phrase to unlock shared budget
          </Text>

          {/* Premium Geometric CSS Illustration */}
          <View style={styles.illustrationContainer}>
            <View style={[styles.circleBg, { backgroundColor: colors.primaryLight }]} />
            <View style={[styles.cardShape1, { backgroundColor: colors.primary }]} />
            <View style={[styles.cardShape2, { backgroundColor: colors.secondary }]} />
            <View style={[styles.accentCircle, { backgroundColor: colors.expense }]} />
          </View>

          {/* Gatekeeper Form */}
          <View style={styles.formContainer}>
            {authError && <Text style={styles.formError}>{authError}</Text>}
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundElement },
              ]}
              placeholder="Enter Secret Phrase"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              value={secretPhrase}
              onChangeText={setSecretPhrase}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleUnlock}
            >
              <Text style={styles.primaryBtnText}>Unlock Budget</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER MAIN DASHBOARD / HOME SCREEN
  const fluidBalance = budget?.fluid_balance ?? 0;
  const monthlyLimit = budget?.monthly_limit ?? 2000;
  const progressPercent = monthlyLimit > 0 ? (monthlyLimit - fluidBalance) / monthlyLimit : 0;

  // Calculate top spending categories spending
  const calculateCategorySpent = (catName: string) => {
    return transactions
      .filter((t) => t.category.toLowerCase().includes(catName.toLowerCase()) && t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  };

  const categoriesToRender = [
    { name: 'Transportation', limit: 1000, daily: 15, color: colors.expense, bg: '#FFEBEA' },
    { name: 'House', limit: 1000, daily: 20, color: colors.primary, bg: '#F2E8FF' },
    { name: 'Office', limit: 500, daily: 10, color: '#FF9500', bg: '#FFF4E5' },
    { name: 'Education', limit: 800, daily: 12, color: '#007AFF', bg: '#E5F1FF' },
  ];

  return (
    <SafeAreaView style={[styles.dashboardContainer, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.dashboardScroll}>
        
        {/* Header bar */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Hello,</Text>
            <Text style={[styles.username, { color: colors.text }]}>{user?.display_name}</Text>
          </View>
          <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: colors.backgroundElement }]}
            onPress={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Text style={{ fontSize: 16 }}>{theme === 'light' ? '🌙' : '☀️'}</Text>
          </TouchableOpacity>
        </View>

        {/* Global Error Banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Shared Financial Health Card - PREMIUM GRADIENT */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetCardHeader}>
            <Text style={styles.budgetCardTitle}>Budget</Text>
            <Text style={styles.budgetCardDetails}>Details ▾</Text>
          </View>
          
          <View style={styles.balanceContainer}>
            <View>
              <Text style={styles.balanceLabel}>LEFT</Text>
              <Text style={styles.balanceAmount}>${fluidBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.limitLabel}>OF</Text>
              <Text style={styles.limitAmount}>${monthlyLimit.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>
          
          {/* Days remaining helper */}
          <Text style={styles.remainingDaysText}>
            9 more days - ${Math.max(0, Math.round(fluidBalance / 9))}/day
          </Text>
        </View>

        {/* Top Spending Categories Horizontal List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Spending</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
          {categoriesToRender.map((cat) => {
            const spent = calculateCategorySpent(cat.name);
            return (
              <View key={cat.name} style={[styles.categoryCircleCard, { backgroundColor: colors.card }]}>
                <View style={[styles.categoryIconCircle, { backgroundColor: cat.bg }]}>
                  <Text style={{ fontSize: 18, color: cat.color }}>
                    {cat.name === 'House' ? '🏠' : cat.name === 'Office' ? '💼' : cat.name === 'Education' ? '🎓' : '🚗'}
                  </Text>
                </View>
                <Text style={[styles.categoryCircleName, { color: colors.text }]}>{cat.name}</Text>
                <Text style={[styles.categoryCircleAmount, { color: colors.textSecondary }]}>${spent.toFixed(0)}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Monthly Budget Category Progress List */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly Budget</Text>
        <View style={styles.budgetList}>
          {categoriesToRender.map((cat) => {
            const spent = calculateCategorySpent(cat.name);
            const progress = cat.limit > 0 ? spent / cat.limit : 0;
            return (
              <View key={cat.name} style={[styles.categoryListItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.categoryListHeader}>
                  <View style={[styles.listIconBox, { backgroundColor: cat.bg }]}>
                    <Text style={{ fontSize: 16 }}>
                      {cat.name === 'House' ? '🏠' : cat.name === 'Office' ? '💼' : cat.name === 'Education' ? '🎓' : '🚗'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.categoryListName, { color: colors.text }]}>{cat.name}</Text>
                    <Text style={[styles.categoryListDaily, { color: colors.textSecondary }]}>${cat.daily}/day</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.categoryListSpent, { color: colors.text }]}>${spent.toFixed(2)}</Text>
                    <Text style={[styles.categoryListLimit, { color: colors.textSecondary }]}>of ${cat.limit}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 12 }}>
                  <ProgressBar progress={progress} color={cat.color} backgroundColor={colors.backgroundElement} height={8} />
                </View>
              </View>
            );
          })}
        </View>

        {/* Recent Transactions History */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
        <View style={styles.transactionsList}>
          {transactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions logged yet.</Text>
          ) : (
            transactions.map((tx) => (
              <View key={tx.id} style={[styles.transactionItem, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txMemo, { color: colors.text }]}>{tx.memo}</Text>
                  <Text style={[styles.txDetails, { color: colors.textSecondary }]}>
                    {tx.category} • {new Date(tx.date).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    { color: tx.type === 'expense' ? colors.expense : colors.income },
                  ]}
                >
                  {tx.type === 'expense' ? '-' : '+'}${Number(tx.amount).toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {/* Floating Add Button (+), matches Image 1 design */}
      <TouchableOpacity
        style={[styles.fabButton, { backgroundColor: colors.primary }]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={addTransaction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Welcome page styling
  welcomeContainer: {
    flex: 1,
  },
  welcomeScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  illustrationContainer: {
    width: 260,
    height: 260,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  circleBg: {
    width: 220,
    height: 220,
    borderRadius: 110,
    position: 'absolute',
  },
  cardShape1: {
    width: 180,
    height: 100,
    borderRadius: 16,
    position: 'absolute',
    transform: [{ rotate: '-12deg' }, { translateY: -20 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardShape2: {
    width: 180,
    height: 100,
    borderRadius: 16,
    position: 'absolute',
    transform: [{ rotate: '8deg' }, { translateY: 20 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  accentCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    position: 'absolute',
    right: 20,
    bottom: 40,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  formContainer: {
    width: '100%',
  },
  formLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  formError: {
    color: '#FF5C5A',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  backBtn: {
    alignSelf: 'center',
    marginTop: 12,
    padding: 8,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Dashboard page styling
  dashboardContainer: {
    flex: 1,
  },
  dashboardScroll: {
    padding: 24,
    paddingBottom: 100, // Leave space for FAB
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  themeToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    backgroundColor: '#FFEBEA',
    borderColor: '#FFC7C4',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorBannerText: {
    color: '#D8000C',
    fontSize: 13,
    fontWeight: '500',
  },
  budgetCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#7F3DFF', // Fallback, gradient styled
    // Real gradient emulation in single color but nice look, or we can use shadow
    shadowColor: '#7F3DFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    marginBottom: 28,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  budgetCardTitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
  },
  budgetCardDetails: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  limitLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'right',
  },
  limitAmount: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 20,
    fontWeight: 'bold',
  },
  remainingDaysText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  horizontalScroll: {
    paddingRight: 10,
    gap: 12,
    marginBottom: 28,
  },
  categoryCircleCard: {
    width: 90,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryCircleName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  categoryCircleAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  budgetList: {
    gap: 12,
    marginBottom: 28,
  },
  categoryListItem: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  categoryListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryListName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  categoryListDaily: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryListSpent: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  categoryListLimit: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  transactionsList: {
    borderRadius: 20,
    paddingBottom: 24,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  txMemo: {
    fontSize: 15,
    fontWeight: '600',
  },
  txDetails: {
    fontSize: 12,
    marginTop: 4,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  fabButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F3DFF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
});
