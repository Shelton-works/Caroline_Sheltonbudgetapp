import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

const PERIODS = ['7 Days', '1 Month', '2 Months', '1 Year'] as const;
type Period = (typeof PERIODS)[number];

function getPeriodCutoff(period: Period): Date {
  const now = new Date();
  switch (period) {
    case '7 Days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '1 Month':
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '2 Months':
      return new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    case '1 Year':
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

// Category budgets — shared defaults; users can customize in Settings
export const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  Transportation: 1000,
  House: 1000,
  Office: 500,
  Education: 800,
  Food: 600,
  Utilities: 400,
  Entertainment: 300,
  Other: 500,
};

export const CATEGORY_COLORS: Record<string, string> = {
  Transportation: '#9F402D',
  House: '#4E635A',
  Office: '#E2725B',
  Education: '#8FA88B',
  Food: '#89726D',
  Utilities: '#97928A',
  Entertainment: '#6B5E8A',
  Other: '#B0A8A0',
};

const CATEGORY_BUDGETS_KEY = '@ourfinances_category_budgets';

export default function AnalyticsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { transactions, budget } = useBudgetStore();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1 Month');
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>({...DEFAULT_CATEGORY_BUDGETS});

  // Load custom category budgets from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(CATEGORY_BUDGETS_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          setCategoryLimits((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Filter transactions by period
  const cutoff = useMemo(() => getPeriodCutoff(selectedPeriod), [selectedPeriod]);
  const filtered = useMemo(
    () => transactions.filter((t) => new Date(t.date) >= cutoff),
    [transactions, cutoff],
  );

  // Expenses
  const expenses = useMemo(() => filtered.filter((t) => t.type === 'expense'), [filtered]);
  const totalExpense = useMemo(() => expenses.reduce((s, t) => s + Number(t.amount || 0), 0), [expenses]);

  // Income
  const incomes = useMemo(() => filtered.filter((t) => t.type === 'income'), [filtered]);
  const totalIncome = useMemo(() => incomes.reduce((s, t) => s + Number(t.amount || 0), 0), [incomes]);

  // Net flow
  const netFlow = totalIncome - totalExpense;

  // Group expenses by category
  const expenseCategories = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((tx) => {
      const cat = tx.category || 'Other';
      map[cat] = (map[cat] || 0) + Number(tx.amount || 0);
    });
    return Object.entries(map)
      .map(([name, spent]) => ({
        name,
        spent,
        limit: Number(categoryLimits[name]) || Number(categoryLimits['Other']) || 500,
        color: CATEGORY_COLORS[name] || CATEGORY_COLORS['Other'],
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [expenses, categoryLimits]);

  // Group income by category
  const incomeCategories = useMemo(() => {
    const map: Record<string, number> = {};
    incomes.forEach((tx) => {
      const cat = tx.category || 'Other';
      map[cat] = (map[cat] || 0) + Number(tx.amount || 0);
    });
    return Object.entries(map)
      .map(([name, amount]) => ({
        name,
        amount,
        color: CATEGORY_COLORS[name] || '#4E635A',
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [incomes]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Ledger</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Period Selector */}
        <View style={[styles.periodSelector, { backgroundColor: colors.surfaceContainerLow }]}>
          {PERIODS.map((period) => {
            const isSelected = selectedPeriod === period;
            return (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  isSelected && {
                    backgroundColor: colors.background,
                    shadowColor: '#D1D9E6',
                    shadowOffset: { width: 2, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                    elevation: 2,
                  },
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: isSelected ? colors.primary : colors.onSurfaceVariant },
                    isSelected && { fontWeight: '700' },
                  ]}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Totals Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          {/* Total Expense */}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryRowLabel, { color: colors.expense }]}>Total Expenses</Text>
            <Text style={[styles.summaryRowValue, { color: colors.expense }]}>
              -${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          {/* Total Income */}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryRowLabel, { color: colors.income }]}>Total Income</Text>
            <Text style={[styles.summaryRowValue, { color: colors.income }]}>
              +${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          {/* Net Flow */}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryRowLabel, { color: colors.onSurfaceVariant, fontWeight: '600' }]}>Net Flow</Text>
            <Text
              style={[
                styles.summaryRowValue,
                { fontWeight: '700', color: netFlow >= 0 ? colors.income : colors.expense },
              ]}
            >
              {netFlow >= 0 ? '+' : ''}${netFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryRowLabel, { color: colors.onSurfaceVariant }]}>Monthly Limit</Text>
            <Text style={[styles.summaryRowValue, { color: colors.onSurface }]}>
              ${(budget?.monthly_limit ?? 2000).toLocaleString()}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryRowLabel, { color: colors.onSurfaceVariant }]}>Remaining</Text>
            <Text style={[styles.summaryRowValue, { color: colors.income }]}>
              ${Math.max(0, ((budget?.monthly_limit ?? 2000) - totalExpense)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Category Distribution Bar (Expenses) */}
        {totalExpense > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Expense Distribution</Text>
            <View style={[styles.chartBar, { backgroundColor: colors.surfaceContainerHigh }]}>
              {expenseCategories.map((cat) => {
                const share = cat.spent / totalExpense;
                if (share < 0.01) return null;
                return (
                  <View
                    key={cat.name}
                    style={{ backgroundColor: cat.color, flex: share, height: '100%' }}
                  />
                );
              })}
            </View>
          </>
        )}

        {/* Expense Breakdown */}
        {expenseCategories.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Expense Breakdown</Text>
            <View style={styles.categoryList}>
              {expenseCategories.map((cat) => {
                const progress = cat.limit > 0 ? Math.min(cat.spent / cat.limit, 1) : 0;
                const remaining = cat.limit - cat.spent;
                return (
                  <View key={cat.name} style={[styles.categoryCard, { backgroundColor: colors.card }]}>
                    <View style={styles.categoryHeader}>
                      <View style={[styles.iconDot, { backgroundColor: cat.color }]} />
                      <Text style={[styles.categoryName, { color: colors.onSurface }]}>{cat.name}</Text>
                      <Text style={[styles.categoryAmount, { color: colors.onSurface }]}>
                        ${cat.spent.toFixed(0)}
                      </Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerLow }]}>
                      <View
                        style={[styles.progressFill, { backgroundColor: cat.color, width: `${progress * 100}%` }]}
                      />
                    </View>
                    <View style={styles.categoryFooter}>
                      <Text style={[styles.footerText, { color: colors.onSurfaceVariant }]}>
                        ${cat.limit} budget
                      </Text>
                      <Text
                        style={[styles.footerText, { color: remaining < 0 ? colors.expense : colors.secondary, fontWeight: '600' }]}
                      >
                        {remaining < 0
                          ? `Over by $${Math.abs(remaining).toFixed(0)}`
                          : `$${remaining.toFixed(0)} left`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Income Breakdown */}
        {incomeCategories.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Income Breakdown</Text>
            <View style={styles.categoryList}>
              {incomeCategories.map((cat) => (
                <View key={cat.name} style={[styles.categoryCard, { backgroundColor: colors.card }]}>
                  <View style={styles.categoryHeader}>
                    <View style={[styles.iconDot, { backgroundColor: cat.color }]} />
                    <Text style={[styles.categoryName, { color: colors.onSurface }]}>{cat.name}</Text>
                    <Text style={[styles.categoryAmount, { color: colors.income }]}>
                      +${cat.amount.toFixed(0)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
            No transactions logged for this period.
          </Text>
        )}

        <View style={{ height: 100 }} />
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
  scrollContent: { padding: 24 },
  periodSelector: {
    flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 24,
    shadowColor: '#D1D9E6', shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 1,
  },
  periodButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  periodText: { fontSize: 13, fontWeight: '500' },
  summaryCard: {
    padding: 24, borderRadius: 24, alignItems: 'center', marginBottom: 28,
    shadowColor: '#D1D9E6', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  divider: { height: 1, width: '100%', marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  summaryRowLabel: { fontSize: 14, fontWeight: '500' },
  summaryRowValue: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 16 },
  chartBar: { height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', width: '100%', marginBottom: 28 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 12, marginBottom: 24 },
  categoryList: { gap: 16 },
  categoryCard: {
    padding: 20, borderRadius: 20,
    shadowColor: '#D1D9E6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  iconDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  categoryName: { fontSize: 15, fontWeight: '600', flex: 1 },
  categoryAmount: { fontSize: 15, fontWeight: '700' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  categoryFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  footerText: { fontSize: 12, fontWeight: '500' },
});
