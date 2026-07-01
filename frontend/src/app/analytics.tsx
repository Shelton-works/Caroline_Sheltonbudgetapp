import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

const PERIODS = ['7 Days', '1 Month', '2 Months', '1 Year'];

export default function AnalyticsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { transactions, budget } = useBudgetStore();
  const [selectedPeriod, setSelectedPeriod] = useState('1 Month');

  const expenses = transactions.filter((t) => t.type === 'expense');
  const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Group by category
  const categoriesMap: { [key: string]: { spent: number; limit: number; color: string } } = {
    'Transportation': { spent: 0, limit: 1000, color: '#9F402D' },
    'House': { spent: 0, limit: 1000, color: '#4E635A' },
    'Office': { spent: 0, limit: 500, color: '#E2725B' },
    'Education': { spent: 0, limit: 800, color: '#8FA88B' },
    'Food': { spent: 0, limit: 600, color: '#89726D' },
    'Utilities': { spent: 0, limit: 400, color: '#97928A' },
  };

  expenses.forEach((tx) => {
    const matchedCat = Object.keys(categoriesMap).find(cat =>
      tx.category.toLowerCase().includes(cat.toLowerCase())
    );
    if (matchedCat) {
      categoriesMap[matchedCat].spent += Number(tx.amount || 0);
    } else {
      if (!categoriesMap['Other']) {
        categoriesMap['Other'] = { spent: 0, limit: 500, color: colors.onSurfaceVariant };
      }
      categoriesMap['Other'].spent += Number(tx.amount || 0);
    }
  });

  const categories = Object.entries(categoriesMap)
    .map(([name, data]) => ({ name, ...data }))
    .filter(c => c.spent > 0 || ['Transportation', 'House', 'Office', 'Education'].includes(c.name));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      {/* TopApp Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Ledger</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Period Selector - Neomorphic Pressed container */}
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

        {/* Total Expenses Summary Card - Neomorphic Extruded */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.summaryLabel, { color: colors.onSurfaceVariant }]}>Total Expenses</Text>
          <Text style={[styles.summaryValue, { color: colors.expense }]}>
            ${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
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

        {/* Category Distribution Bar */}
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Category Distribution</Text>
        {totalExpense > 0 ? (
          <View style={[styles.chartBar, { backgroundColor: colors.surfaceContainerHigh }]}>
            {categories.map((cat) => {
              const share = totalExpense > 0 ? cat.spent / totalExpense : 0;
              if (share < 0.01) return null;
              return (
                <View
                  key={cat.name}
                  style={{
                    backgroundColor: cat.color,
                    flex: share,
                    height: '100%',
                  }}
                />
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
            No expenses logged for this period.
          </Text>
        )}

        {/* Category Breakdown */}
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Category Breakdown</Text>
        <View style={styles.categoryList}>
          {categories.map((cat) => {
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

                {/* Progress Bar - Pressed track */}
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerLow }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: cat.color,
                        width: `${progress * 100}%`,
                      },
                    ]}
                  />
                </View>

                <View style={styles.categoryFooter}>
                  <Text style={[styles.footerText, { color: colors.onSurfaceVariant }]}>
                    ${cat.limit} budget
                  </Text>
                  <Text
                    style={[
                      styles.footerText,
                      { color: remaining < 0 ? colors.expense : colors.secondary, fontWeight: '600' },
                    ]}
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

        <View style={{ height: 100 }} />
      </ScrollView>
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
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Montserrat',
  },
  scrollContent: {
    padding: 24,
  },
  periodSelector: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    // Pressed effect
    shadowColor: '#D1D9E6',
    shadowOffset: { width: -2, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 1,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryCard: {
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 28,
    // Extruded
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.04,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  summaryRowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryRowValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    marginBottom: 16,
  },
  chartBar: {
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    width: '100%',
    marginBottom: 28,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
    marginBottom: 24,
  },
  categoryList: {
    gap: 16,
  },
  categoryCard: {
    padding: 20,
    borderRadius: 20,
    // Extruded
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
