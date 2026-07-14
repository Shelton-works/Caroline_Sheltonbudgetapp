import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (amount: number, type: 'expense' | 'income', category: string, memo: string) => Promise<void>;
  initialTab?: 'expense' | 'income';
}

const EXPENSE_CATEGORIES = ['Transportation', 'House', 'Office', 'Education', 'Food', 'Entertainment', 'Utilities', 'Other'];
const INCOME_CATEGORIES = ['Salary / Injection', 'Refund', 'Gift', 'Other'];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  visible,
  onClose,
  onSave,
  initialTab = 'expense',
}) => {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [activeTab, setActiveTab] = useState<'expense' | 'income'>(initialTab);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = activeTab === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleTabChange = (tab: 'expense' | 'income') => {
    setActiveTab(tab);
    setCategory(tab === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than $0.');
      return;
    }
    if (!memo.trim()) {
      setError('Please add a short memo description.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave(parsedAmount, activeTab, category, memo.trim());
      setAmount('');
      setMemo('');
      setCategory(activeTab === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          <Pressable
            style={[styles.modalContainer, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Drag indicator */}
            <View style={[styles.dragBar, { backgroundColor: colors.outlineVariant }]} />

            <Text style={[styles.title, { color: colors.onSurface }]}>Add Transaction</Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* Tab Selector - Pressed style */}
            <View style={[styles.tabContainer, { backgroundColor: colors.surfaceContainerLow }]}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'expense' && { backgroundColor: colors.expense }]}
                onPress={() => handleTabChange('expense')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'expense' ? '#FFFFFF' : colors.onSurfaceVariant }]}>
                  Expense
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'income' && { backgroundColor: colors.income }]}
                onPress={() => handleTabChange('income')}
              >
                <Text style={[styles.tabText, { color: activeTab === 'income' ? '#FFFFFF' : colors.onSurfaceVariant }]}>
                  Income
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
              {/* Amount Input */}
              <View style={styles.inputWrapper}>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Amount</Text>
                <TextInput
                  nativeID="txAmount"
                  style={[styles.amountInput, { color: colors.onSurface, borderBottomColor: colors.primary }]}
                  placeholder="$0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  autoFocus
                />
              </View>

              {/* Memo Input */}
              <View style={styles.inputWrapper}>
                <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Memo (Required)</Text>
                <TextInput
                  nativeID="txMemo"
                  style={[styles.memoInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                  placeholder="What is this for?"
                  placeholderTextColor={colors.onSurfaceVariant}
                  maxLength={50}
                  value={memo}
                  onChangeText={setMemo}
                />
              </View>

              {/* Category Grid */}
              <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Category</Text>
              <View style={styles.categoryGrid}>
                {categories.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryItem,
                        { borderColor: colors.outlineVariant },
                        isSelected && {
                          backgroundColor: colors.primaryLight,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[styles.categoryText, { color: isSelected ? colors.primary : colors.onSurface }, isSelected && { fontWeight: '700' }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel, { borderColor: colors.outlineVariant }]}
                onPress={onClose}
                disabled={isSubmitting}
              >
                <Text style={[styles.btnText, { color: colors.onSurface }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSave, { backgroundColor: activeTab === 'expense' ? colors.expense : colors.income }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF' }]}>
                  {isSubmitting ? 'Saving...' : 'Log'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  keyboardContainer: { width: '100%' },
  modalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '90%',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  dragBar: {
    width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', fontFamily: 'Montserrat', textAlign: 'center', marginBottom: 16 },
  errorText: { color: '#BA1A1A', textAlign: 'center', marginBottom: 12, fontWeight: '600' },
  tabContainer: {
    flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 20,
    shadowColor: '#D1D9E6', shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 1,
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { paddingBottom: 20 },
  inputWrapper: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  amountInput: { fontSize: 32, fontWeight: '700', textAlign: 'center', paddingVertical: 8, borderBottomWidth: 2, fontFamily: 'Montserrat' },
  memoInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryItem: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  categoryText: { fontSize: 14 },
  actionContainer: { flexDirection: 'row', gap: 12, marginTop: 10 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1 },
  btnSave: {},
  btnText: { fontSize: 16, fontWeight: '700' },
});
