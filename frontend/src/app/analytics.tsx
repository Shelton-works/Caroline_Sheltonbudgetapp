import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors } from '../constants/theme';
import { ProgressBar } from '../components/ProgressBar';

const PERIODS = ['7 Days', '1 Month', '2 Months', '1 Year'];

export default function AnalyticsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { transactions, budget } = useBudgetStore();
  const [selectedPeriod, setSelectedPeriod] = useState('7 Days');

  // Filter expenses
  const expenses = transactions.filter((t) => t.type === 'expense');
  const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount), 0);

  // Group by category
  const categoriesMap: { [key: string]: { spent: number; limit: number; color: string } } = {
    'Transportation': { spent: 0, limit: 1000, color: colors.expense },
    'House': { spent: 0, limit: 1000, color: colors.primary },
    'Office': { spent: 0, limit: 500, color: '#FF9500' },
    'Education': { spent: 0, limit: 800, color: '#007AFF' },
    'Food': { spent: 0, limit: 600, color: '#FFCC00' },
    'Utilities': { spent: 0, limit: 400, color: '#34C759' },
  };

  // Populate actual spent values
  expenses.forEach((tx) => {
    const matchedCat = Object.keys(categoriesMap).find(cat => 
      tx.category.toLowerCase().includes(cat.toLowerCase())
    );
    if (matchedCat) {
      categoriesMap[matchedCat].spent += Number(tx.amount);
    } else {
      // Default to Other
      if (!categoriesMap['Other']) {
        categoriesMap['Other'] = { spent: 0, limit: 500, color: colors.textSecondary };
      }
      categoriesMap['Other'].spent += Number(tx.amount);
    }
  });

  const categories = Object.entries(categoriesMap)
    .map(([name, data]) => ({ name, ...data }))
    .filter(c => c.spent > 0 || ['Transportation', 'House', 'Office', 'Education'].includes(c.name));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]}>Overview</Text>

        {/* Period Selector (matches bottom left of Image 1) */}
        <View style={[styles.periodSelector, { backgroundColor: colors.backgroundElement }]}>
          {PERIODS.map((period) => {
            const isSelected = selectedPeriod === period;
            return (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  isSelected && { backgroundColor: colors.background },
                ]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: isSelected ? colors.primary : colors.textSecondary },
                    isSelected && { fontWeight: 'bold' },
                  ]}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Expenses Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Expenses</Text>
          <Text style={[styles.summaryValue, { color: colors.expense }]}>
            ${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={[styles.summarySubtext, { color: colors.textSecondary }]}>
            Out of monthly budget limit of ${budget?.monthly_limit ?? 2000}
          </Text>
        </View>

        {/* Visual Category Allocation Chart */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Category Distribution</Text>
        {totalExpense > 0 ? (
          <View style={styles.chartBar}>
            {categories.map((cat) => {
              const share = totalExpense > 0 ? cat.spent / totalExpense : 0;
              if (share === 0) return null;
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
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No expense logs for this period.</Text>
        )}

        {/* Categories Details List (matches Image 2 style) */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Category Breakdown</Text>
        <View style={styles.categoryList}>
          {categories.map((cat) => {
            const progress = cat.limit > 0 ? cat.spent / cat.limit : 0;
            const remaining = cat.limit - cat.spent;
            return (
              <View key={cat.name} style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.categoryHeader}>
                  <View style={[styles.iconDot, { backgroundColor: cat.color }]} />
                  <Text style={[styles.categoryName, { color: colors.text }]}>{cat.name}</Text>
                  <Text style={[styles.categoryAmount, { color: colors.text }]}>
                    ${cat.spent.toFixed(0)}
                  </Text>
                </View>
                
                <View style={{ marginVertical: 8 }}>
                  <ProgressBar progress={progress} color={cat.color} backgroundColor={colors.backgroundElement} height={6} />
                </View>

                <View style={styles.categoryFooter}>
                  <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                    ${cat.limit} budget
                  </Text>
                  <Text
                    style={[
                      styles.footerText,
                      { color: remaining < 0 ? colors.expense : colors.income, fontWeight: '600' },
                    ]}
                  >
                    {remaining < 0 ? `Over by $${Math.abs(remaining).toFixed(0)}` : `$${remaining.toFixed(0)} left`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
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
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  periodSelector: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 28,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  summarySubtext: {
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
    gap: 12,
  },
  categoryCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  categoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footerText: {
    fontSize: 12,
  },
});
