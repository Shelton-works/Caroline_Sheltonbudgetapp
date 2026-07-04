import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Animated,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { AddTransactionModal } from '../components/AddTransactionModal';

function BalanceCountUp({ target, decimals = 2 }: { target: number; decimals?: number }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    const listener = animatedValue.addListener(({ value }) => {
      const start = target * 0.97;
      const current = start + (target - start) * value;
      setDisplayValue(Math.min(current, target));
    });

    return () => animatedValue.removeListener(listener);
  }, [target]);

  const whole = Math.floor(displayValue);
  const decimal = ((displayValue - whole) * Math.pow(10, decimals)).toFixed(0).padStart(decimals, '0');

  return (
    <View style={styles.balanceRow}>
      <Text style={styles.balanceCurrency}>$</Text>
      <Text style={styles.balanceWhole}>{whole.toLocaleString()}</Text>
      <Text style={styles.balanceDecimal}>.{decimal}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    user,
    budget,
    transactions,
    isLoading,
    error,
    fetchData,
    addTransaction,
  } = useBudgetStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh: manually refresh data
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const fluidBalance = budget?.fluid_balance ?? 0;
  const monthlyLimit = budget?.monthly_limit ?? 2000;
  const unityGoalProgress = 0; // 0% — new goal
  const unityGoalSaved = 0;
  const unityGoalTarget = 1000;

  // Group transactions for recent list
  const recentTransactions = transactions.slice(0, 6);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      {/* TopAppBar - Neomorphic */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <View style={styles.topBarLeft}>
          <View style={styles.avatarStack}>
            <View style={[styles.avatar, { borderColor: colors.background }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.display_name?.charAt(0) || 'U'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.topBarTitle, { color: colors.primary }]}>Our Finances</Text>
        <TouchableOpacity style={styles.settingsBtn}>
          <Text style={[styles.settingsIcon, { color: colors.primary }]}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Error Banner */}
        {error && (
          <View style={[styles.card, { backgroundColor: colors.errorContainer, marginBottom: Spacing.three }]}>
            <Text style={[styles.errorText, { color: colors.onErrorContainer }]}>{error}</Text>
          </View>
        )}

        {/* Shared Balance Card - Neomorphic Extruded */}
        <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.balanceLabel, { color: colors.onSurfaceVariant }]}>Our Shared Balance</Text>
          <BalanceCountUp target={fluidBalance} />
          <View style={styles.balanceButtons}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setModalVisible(true)}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Add Income</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.outlineVariant }]}>
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Unity Goal Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Unity Goal</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>Buy Shelton's New Phone 📱</Text>
            </View>
            <Text style={[styles.goalPercent, { color: colors.primary }]}>75%</Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
            <View style={[styles.progressFill, { width: '75%', backgroundColor: colors.primary }]} />
          </View>

          <View style={styles.goalMeta}>
            <Text style={[styles.goalMetaText, { color: colors.onSurfaceVariant }]}>
              ${unityGoalSaved.toLocaleString()} saved
            </Text>
            <Text style={[styles.goalMetaText, { color: colors.onSurfaceVariant }]}>
              Goal: ${unityGoalTarget.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Recent Transactions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Recent Transactions</Text>
            <TouchableOpacity>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : recentTransactions.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
              No transactions yet. Start by adding one!
            </Text>
          ) : (
            <View style={styles.transactionsList}>
              {recentTransactions.map((tx, index) => {
                const isExpense = tx.type === 'expense';
                const amount = Number(tx.amount);
                return (
                  <View
                    key={tx.id || index}
                    style={[
                      styles.transactionItem,
                      index < recentTransactions.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.outlineVariant,
                      },
                    ]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: colors.surfaceContainerLow }]}>
                      <Text style={styles.txIconEmoji}>
                        {tx.category === 'Transportation' ? '🚗'
                          : tx.category === 'House' ? '🏠'
                          : tx.category === 'Office' ? '💼'
                          : tx.category === 'Education' ? '🎓'
                          : tx.category === 'Food' ? '🛒'
                          : tx.category === 'Entertainment' ? '🎬'
                          : tx.category === 'Utilities' ? '💡'
                          : isExpense ? '💳' : '💰'}
                      </Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={[styles.txMemo, { color: colors.onSurface }]}>{tx.memo}</Text>
                      <Text style={[styles.txDate, { color: colors.onSurfaceVariant }]}>
                        {tx.category} • {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.txAmount,
                        { color: isExpense ? colors.expense : colors.secondary },
                      ]}
                    >
                      {isExpense ? '-' : '+'}${amount.toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Harmony Insight - Neomorphic Pressed */}
        <View style={[styles.insightCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <View style={styles.insightHeader}>
            <Text style={styles.insightEmoji}>💡</Text>
            <Text style={[styles.insightTitle, { color: colors.onSurface }]}>Harmony Insight</Text>
          </View>
          <Text style={[styles.insightBody, { color: colors.onSurfaceVariant }]}>
            You're both spending{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>12% less</Text> on groceries
            this month compared to last. That's an extra{' '}
            <Text style={{ color: colors.primary }}>$120</Text> for your{' '}
            <Text style={{ fontStyle: 'italic' }}>Summer Vacation</Text> goal!
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <AddTransactionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={addTransaction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarStack: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEE5FF',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    letterSpacing: -0.02,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 22,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  card: {
    padding: 16,
    borderRadius: BorderRadius.lg,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Balance Card
  balanceCard: {
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    marginBottom: 28,
    // Neomorphic extruded
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.04,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  balanceCurrency: {
    fontSize: 28,
    fontWeight: '700',
    color: '#9F402D',
    fontFamily: 'Montserrat',
  },
  balanceWhole: {
    fontSize: 48,
    fontWeight: '700',
    color: '#9F402D',
    fontFamily: 'Montserrat',
    lineHeight: 56,
    letterSpacing: -0.02,
  },
  balanceDecimal: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E2725B',
    fontFamily: 'Montserrat',
  },
  balanceButtons: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9F402D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Montserrat',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Unity Goal
  goalPercent: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 0,
  },
  progressTrack: {
    height: 24,
    borderRadius: 12,
    padding: 4,
    overflow: 'hidden',
    marginBottom: 8,
    // Pressed effect
    shadowColor: '#D1D9E6',
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    // Extruded effect on fill
    shadowColor: '#9F402D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  goalMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalMetaText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Transactions
  transactionsList: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  txIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // Extruded
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  txIconEmoji: {
    fontSize: 20,
  },
  txInfo: {
    flex: 1,
  },
  txMemo: {
    fontSize: 15,
    fontWeight: '600',
  },
  txDate: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Harmony Insight
  insightCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E6E6E6',
    // Pressed effect
    shadowColor: '#D1D9E6',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightEmoji: {
    fontSize: 18,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Montserrat',
  },
  insightBody: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9F402D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 34,
  },
});
