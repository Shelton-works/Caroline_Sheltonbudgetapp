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
  TextInput,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

function TransactionRow({
  tx,
  index,
  isLast,
  colors,
  onPress,
  onLongPress,
}: {
  tx: any;
  index: number;
  isLast: boolean;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const isExpense = tx.type === 'expense';
  const amount = Number(tx.amount);
  return (
    <TouchableOpacity
      key={tx.id || index}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[
        styles.transactionItem,
        !isLast && {
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
    </TouchableOpacity>
  );
}

type EditTxData = {
  id: string;
  amount: string;
  memo: string;
  category: string;
  type: 'expense' | 'income';
};

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
    updateTransaction,
    deleteTransaction,
    lastSyncedAt,
  } = useBudgetStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalIncomeTab, setModalIncomeTab] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewAllVisible, setViewAllVisible] = useState(false);
  const [editTxVisible, setEditTxVisible] = useState(false);
  const [editTx, setEditTx] = useState<EditTxData | null>(null);
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Pull-to-refresh: manually refresh data
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const fluidBalance = budget?.fluid_balance ?? 0;
  const recentTransactions = transactions.slice(0, 6);
  const isLinked = (budget?.profiles_count ?? 1) > 1;

  // Format last synced time
  const lastSyncedStr = lastSyncedAt
    ? 'Synced ' + new Date(lastSyncedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  const openAddTransaction = useCallback((incomeTab = false) => {
    setModalIncomeTab(incomeTab);
    setModalVisible(true);
  }, []);

  const handleTransactionPress = useCallback((tx: any) => {
    // Quick view — could expand, but for now just a placeholder
  }, []);

  const handleTransactionLongPress = useCallback((tx: any) => {
    setActionTarget(tx);
  }, []);

  const handleActionEdit = useCallback(() => {
    const tx = actionTarget;
    if (!tx) return;
    setEditTx({
      id: tx.id,
      amount: tx.amount.toString(),
      memo: tx.memo,
      category: tx.category,
      type: tx.type,
    });
    setEditTxVisible(true);
    setActionTarget(null);
  }, [actionTarget]);

  const handleActionDelete = useCallback(() => {
    const tx = actionTarget;
    if (!tx) return;
    setActionTarget(null);
    setDeleteTarget(tx);
  }, [actionTarget]);

  const confirmDeleteTx = useCallback(() => {
    const tx = deleteTarget;
    if (!tx) return;
    deleteTransaction(tx.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteTransaction]);

  const cancelDeleteTx = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editTx) return;
    const parsedAmount = parseFloat(editTx.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!editTx.memo.trim()) return;

    await updateTransaction(editTx.id, {
      amount: parsedAmount,
      memo: editTx.memo.trim(),
      category: editTx.category,
      type: editTx.type,
    });
    setEditTxVisible(false);
    setEditTx(null);
  }, [editTx, updateTransaction]);

  const EXPENSE_CATS = ['Transportation', 'House', 'Office', 'Education', 'Food', 'Entertainment', 'Utilities', 'Other'];
  const INCOME_CATS = ['Salary / Injection', 'Refund', 'Gift', 'Other'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      {/* TopAppBar */}
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
        {/* Not Linked Warning Banner */}
        {!isLinked && (
          <View style={[styles.notLinkedBanner, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderLeftColor: colors.expense }]}>
            <Text style={styles.notLinkedEmoji}>🔗</Text>
            <View style={styles.notLinkedContent}>
              <Text style={[styles.notLinkedTitle, { color: colors.onSurface }]}>Not connected to partner</Text>
              <Text style={[styles.notLinkedDesc, { color: colors.onSurfaceVariant }]}>
                Go to Settings → Partner Connection to link budgets with your partner. Data you enter now is only visible to you.
              </Text>
            </View>
          </View>
        )}

        {/* Error Banner */}
        {error && (
          <View style={[styles.card, { backgroundColor: colors.errorContainer, marginBottom: Spacing.three }]}>
            <Text style={[styles.errorText, { color: colors.onErrorContainer }]}>{error}</Text>
          </View>
        )}

        {/* Shared Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.balanceLabel, { color: colors.onSurfaceVariant }]}>Our Shared Balance</Text>
          <BalanceCountUp target={fluidBalance} />
          <View style={styles.balanceButtons}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => openAddTransaction(false)}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Add Income</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.outlineVariant }]}
              onPress={() => openAddTransaction(true)}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sync indicator */}
        {lastSyncedStr && (
          <View style={styles.syncIndicatorRow}>
            <View style={[styles.syncDot, { backgroundColor: colors.income }]} />
            <Text style={[styles.syncIndicatorText, { color: colors.onSurfaceVariant }]}>{lastSyncedStr}</Text>
          </View>
        )}

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => setViewAllVisible(true)}>
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
              {recentTransactions.map((tx, index) => (
                <TransactionRow
                  key={tx.id || index}
                  tx={tx}
                  index={index}
                  isLast={index === recentTransactions.length - 1}
                  colors={colors}
                  onPress={() => handleTransactionPress(tx)}
                  onLongPress={() => handleTransactionLongPress(tx)}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => openAddTransaction(false)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <AddTransactionModal
        visible={modalVisible}
        initialTab={modalIncomeTab ? 'income' : undefined}
        onClose={() => setModalVisible(false)}
        onSave={addTransaction}
      />

      {/* Transaction Action Sheet */}
      <Modal visible={actionTarget !== null} animationType="fade" transparent>
        <Pressable style={styles.overlay} onPress={() => setActionTarget(null)}>
          <Pressable style={[styles.actionSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.actionSheetTitle, { color: colors.onSurface }]}>
              {actionTarget?.memo || 'Transaction'}
            </Text>
            <Text style={[styles.actionSheetSubtitle, { color: colors.onSurfaceVariant }]}>
              ${Number(actionTarget?.amount || 0).toFixed(2)} • {actionTarget?.category || ''}
            </Text>
            <TouchableOpacity
              style={[styles.actionSheetBtn, { backgroundColor: colors.primaryLight }]}
              onPress={handleActionEdit}
            >
              <Text style={[styles.actionSheetBtnText, { color: colors.primary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionSheetBtn, { backgroundColor: '#FFE8E5' }]}
              onPress={handleActionDelete}
            >
              <Text style={[styles.actionSheetBtnText, { color: colors.expense }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionSheetCancel, { borderColor: colors.outlineVariant }]}
              onPress={() => setActionTarget(null)}
            >
              <Text style={[styles.actionSheetCancelText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Transaction Confirmation */}
      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete Transaction"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.memo}" ($${Number(deleteTarget.amount).toFixed(2)})? This will adjust your balance.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmDeleteTx}
        onCancel={cancelDeleteTx}
      />

      {/* View All Transactions Modal */}
      <Modal visible={viewAllVisible} animationType="slide" transparent>
        <SafeAreaView style={[styles.modalOverlay, { backgroundColor: colors.background }]}>
          <View style={[styles.modalTopBar, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.onSurface }]}>All Transactions</Text>
            <TouchableOpacity onPress={() => setViewAllVisible(false)}>
              <Text style={[styles.modalClose, { color: colors.primary, fontSize: 16 }]}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalListContent} showsVerticalScrollIndicator={false}>
            {transactions.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.onSurfaceVariant }]}>
                No transactions yet.
              </Text>
            ) : (
              transactions.map((tx, index) => (
                <TransactionRow
                  key={tx.id || index}
                  tx={tx}
                  index={index}
                  isLast={index === transactions.length - 1}
                  colors={colors}
                  onPress={() => handleTransactionPress(tx)}
                  onLongPress={() => {
                    setViewAllVisible(false);
                    setTimeout(() => handleTransactionLongPress(tx), 300);
                  }}
                />
              ))
            )}
            <View style={{ height: 60 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal visible={editTxVisible} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => { setEditTxVisible(false); setEditTx(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardContainer}>
            <Pressable style={[styles.editModalContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
              <View style={[styles.dragBar, { backgroundColor: colors.outlineVariant }]} />
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Edit Transaction</Text>

              {editTx && (
                <>
                  <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Amount</Text>
                  <TextInput
                    nativeID="editTxAmount"
                    style={[styles.editInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                    keyboardType="decimal-pad"
                    value={editTx.amount}
                    onChangeText={(t) => setEditTx((prev) => prev ? { ...prev, amount: t } : null)}
                  />

                  <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Memo</Text>
                  <TextInput
                    nativeID="editTxMemo"
                    style={[styles.editInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                    value={editTx.memo}
                    onChangeText={(t) => setEditTx((prev) => prev ? { ...prev, memo: t } : null)}
                    maxLength={50}
                  />

                  <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                    <View style={styles.catRow}>
                      {(editTx.type === 'expense' ? EXPENSE_CATS : INCOME_CATS).map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.catChip, { borderColor: colors.outlineVariant }, editTx.category === cat && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                          onPress={() => setEditTx((prev) => prev ? { ...prev, category: cat } : null)}
                        >
                          <Text style={[styles.catChipText, { color: editTx.category === cat ? colors.primary : colors.onSurface }]}>
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleEditSave}>
                    <Text style={[styles.btnLabel, { color: colors.onPrimary }]}>Save Changes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.outlineVariant }]} onPress={() => { setEditTxVisible(false); setEditTx(null); }}>
                    <Text style={[styles.cancelLabel, { color: colors.onSurfaceVariant }]}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  avatarStack: { position: 'relative', width: 40, height: 40 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE5FF',
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  topBarTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Montserrat', letterSpacing: -0.02 },
  settingsBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 22 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  card: { padding: 16, borderRadius: BorderRadius.lg },
  errorText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },

  // Balance Card
  balanceCard: {
    borderRadius: 32, padding: 32, alignItems: 'center', marginBottom: 28,
    shadowColor: '#D1D9E6', shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  balanceLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.04, marginBottom: 8, textTransform: 'uppercase' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 24 },
  balanceCurrency: { fontSize: 28, fontWeight: '700', color: '#9F402D', fontFamily: 'Montserrat' },
  balanceWhole: { fontSize: 48, fontWeight: '700', color: '#9F402D', fontFamily: 'Montserrat', lineHeight: 56, letterSpacing: -0.02 },
  balanceDecimal: { fontSize: 20, fontWeight: '600', color: '#E2725B', fontFamily: 'Montserrat' },
  balanceButtons: { flexDirection: 'row', gap: 16, width: '100%' },
  primaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#9F402D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '600' },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },

  // Section
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Montserrat' },
  viewAllText: { fontSize: 14, fontWeight: '600' },

  // Transactions
  transactionsList: { borderRadius: 20, overflow: 'hidden' },
  transactionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  txIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#D1D9E6', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  txIconEmoji: { fontSize: 20 },
  txInfo: { flex: 1 },
  txMemo: { fontSize: 15, fontWeight: '600' },
  txDate: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  // Not Linked Banner
  notLinkedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, borderRadius: 14, marginBottom: 20,
    borderWidth: 1, borderLeftWidth: 4,
  },
  notLinkedEmoji: { fontSize: 16, marginTop: 2 },
  notLinkedContent: { flex: 1 },
  notLinkedTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  notLinkedDesc: { fontSize: 12, lineHeight: 17 },

  // Sync indicator
  syncIndicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncIndicatorText: { fontSize: 11, fontWeight: '500' },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 24, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#9F402D', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  fabIcon: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', lineHeight: 34 },

  // View All Modal
  modalOverlay: { flex: 1 },
  modalTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16,
    shadowColor: '#D1D9E6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Montserrat' },
  modalClose: { fontWeight: '600' },
  modalListContent: { padding: 24 },

  // Edit Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  keyboardContainer: { width: '100%' },
  editModalContainer: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24,
    shadowColor: '#D1D9E6', shadowOffset: { width: -4, height: -4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  dragBar: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  editInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  catScroll: { marginTop: 8, marginBottom: 16 },
  catRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  catChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 13, fontWeight: '600' },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnLabel: { fontSize: 16, fontWeight: '700' },
  cancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 8 },
  cancelLabel: { fontSize: 14, fontWeight: '600' },

  // Action Sheet
  actionSheet: {
    marginHorizontal: 24,
    borderRadius: 20,
    padding: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  actionSheetTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Montserrat', textAlign: 'center' },
  actionSheetSubtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 8 },
  actionSheetBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetBtnText: { fontSize: 16, fontWeight: '700' },
  actionSheetCancel: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 4,
  },
  actionSheetCancelText: { fontSize: 15, fontWeight: '600' },
});
