import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { useBudgetStore, SavingsGoal } from '../store/useBudgetStore';
import { Colors } from '../constants/theme';

type ActiveSection = 'none' | 'add' | 'withdraw' | 'settings';

export default function SavingsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    user,
    savingsGoals,
    fetchSavings,
    createSavingsGoal,
    updateSavingsGoal,
    updateAutoSavePct,
    addToSavings,
    withdrawFromSavings,
    reorderSavingsGoals,
    deleteSavingsGoal,
  } = useBudgetStore();

  useEffect(() => {
    fetchSavings();
  }, []);

  const [message, setMessage] = useState<string | null>(null);
  const showMsg = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  }, []);

  // Expanded goal tracking
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('none');

  const toggleGoal = useCallback((goalId: string) => {
    setExpandedGoal((prev) => (prev === goalId ? null : goalId));
    setActiveSection('add');
  }, []);

  // New goal creation state
  const [showNewGoal, setShowNewGoal] = useState(false);
  // Use refs for add goal form to avoid re-render-on-keystroke focus loss
  const newNameRef = useRef('');
  const newTargetRef = useRef('');
  const [newGoalKey, setNewGoalKey] = useState(0); // increment to reset form

  // Edit goal state (in-place in the expanded card)
  // Use a ref to avoid focus loss while editing
  const editNameRef = useRef('');
  const editTargetRef = useRef('');

  // Uncontrolled add/withdraw inputs — use refs to avoid re-render-on-keystroke focus loss
  const addAmountText = useRef<Record<string, string>>({});
  const wdAmountText = useRef<Record<string, string>>({});
  const [addClearKey, setAddClearKey] = useState<Record<string, number>>({});
  const [wdClearKey, setWdClearKey] = useState<Record<string, number>>({});

  const handleCreateGoal = useCallback(() => {
    const name = newNameRef.current.trim();
    const target = parseFloat(newTargetRef.current);
    if (!name) { showMsg('Please enter a goal name.'); return; }
    if (isNaN(target) || target <= 0) { showMsg('Please enter a valid target amount.'); return; }
    createSavingsGoal(name, target, 0);
    newNameRef.current = '';
    newTargetRef.current = '';
    setNewGoalKey((k) => k + 1);
    setShowNewGoal(false);
    showMsg('New goal created!');
  }, [createSavingsGoal, showMsg]);

  const handleDeleteGoal = useCallback((goal: SavingsGoal) => {
    Alert.alert(
      'Delete Goal',
      `Are you sure you want to delete "${goal.name}"? All saved progress will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSavingsGoal(goal.id);
            setExpandedGoal(null);
            showMsg('Goal deleted.');
          },
        },
      ],
    );
  }, [deleteSavingsGoal, showMsg]);

  const handleAdd = useCallback((goal: SavingsGoal) => {
    const amount = parseFloat(addAmountText.current[goal.id] || '');
    if (isNaN(amount) || amount <= 0) { showMsg('Enter a valid amount.'); return; }
    addToSavings(goal.id, amount);
    addAmountText.current[goal.id] = '';
    setAddClearKey((prev) => ({ ...prev, [goal.id]: (prev[goal.id] || 0) + 1 }));
    showMsg(`Added $${amount.toFixed(2)} to "${goal.name}"!`);
  }, [addToSavings, showMsg]);

  const handleWithdraw = useCallback((goal: SavingsGoal) => {
    const amount = parseFloat(wdAmountText.current[goal.id] || '');
    if (isNaN(amount) || amount <= 0) { showMsg('Enter a valid amount.'); return; }
    if (amount > goal.saved_amount) { showMsg(`Only $${goal.saved_amount.toFixed(2)} saved in "${goal.name}".`); return; }
    withdrawFromSavings(goal.id, amount);
    wdAmountText.current[goal.id] = '';
    setWdClearKey((prev) => ({ ...prev, [goal.id]: (prev[goal.id] || 0) + 1 }));
    showMsg(`Withdrew $${amount.toFixed(2)} from "${goal.name}".`);
  }, [withdrawFromSavings, showMsg]);

  const handleQuickAdd = useCallback((goal: SavingsGoal, amount: number) => {
    addToSavings(goal.id, amount);
    showMsg(`Added $${amount} to "${goal.name}"!`);
  }, [addToSavings, showMsg]);

  const toggleAutoSave = useCallback((goal: SavingsGoal) => {
    const newPct = goal.auto_save_percentage > 0 ? 0 : 10;
    updateAutoSavePct(goal.id, newPct);
    showMsg(newPct > 0
      ? `Auto-save ${newPct}% enabled for "${goal.name}".`
      : `Auto-save disabled for "${goal.name}".`);
  }, [updateAutoSavePct, showMsg]);

  const setAutoSavePct = useCallback((goal: SavingsGoal, pct: number) => {
    updateAutoSavePct(goal.id, pct);
  }, [updateAutoSavePct]);

  const totalSaved = savingsGoals.reduce((sum, g) => sum + g.saved_amount, 0);
  const totalTarget = savingsGoals.reduce((sum, g) => sum + g.target_amount, 0);
  const overallProgress = totalTarget > 0 ? totalSaved / totalTarget : 0;

  const handleDragEnd = useCallback(({ data }: { data: SavingsGoal[] }) => {
    const goalIds = data.map((g) => g.id);
    reorderSavingsGoals(goalIds);
  }, [reorderSavingsGoals]);

  const ListHeader = useCallback(() => (
    <View style={{ gap: 16 }}>
      {/* Overall summary */}
      {savingsGoals.length > 0 && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.summaryTitle, { color: colors.onSurface }]}>Overall Progress</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(overallProgress * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <View style={styles.summaryMeta}>
            <Text style={[styles.summaryText, { color: colors.onSurfaceVariant }]}>
              ${totalSaved.toLocaleString()} saved
            </Text>
            <Text style={[styles.summaryText, { color: colors.onSurfaceVariant }]}>
              ${totalTarget.toLocaleString()} goal
            </Text>
          </View>
        </View>
      )}
    </View>
  ), [colors, savingsGoals, overallProgress, totalSaved, totalTarget]);

  const renderGoalItem = useCallback(({ item: goal, drag, isActive, getIndex }: RenderItemParams<SavingsGoal>) => {
    const progress = goal.target_amount > 0
      ? Math.min(goal.saved_amount / goal.target_amount, 1)
      : 0;
    const percent = Math.round(progress * 100);
    const remaining = Math.max(0, goal.target_amount - goal.saved_amount);
    const isExpanded = expandedGoal === goal.id;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => toggleGoal(goal.id)}
          onLongPress={drag}
          delayLongPress={200}
          style={[
            styles.goalCard,
            { backgroundColor: colors.card },
            isActive && { shadowOpacity: 0.4, elevation: 8, transform: [{ scale: 1.02 }] },
          ]}
        >
          {/* Goal header with drag handle */}
          <View style={styles.goalHeader}>
            <View style={styles.dragHandle}>
              <Text style={[styles.dragIcon, { color: colors.onSurfaceVariant }]}>≡</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.goalName, { color: colors.onSurface }]}>{goal.name}</Text>
              <Text style={[styles.goalPercent, { color: colors.primary }]}>{percent}%</Text>
            </View>
            <View style={styles.goalRight}>
              {goal.auto_save_percentage > 0 && (
                <View style={[styles.autoBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.autoBadgeText, { color: colors.primary }]}>
                    {goal.auto_save_percentage}%
                  </Text>
                </View>
              )}
              <Text style={[styles.expandIcon, { color: colors.onSurfaceVariant }]}>
                {isExpanded ? '▲' : '▼'}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${percent}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>

          <View style={styles.goalMeta}>
            <Text style={[styles.goalMetaText, { color: colors.onSurfaceVariant }]}>
              ${goal.saved_amount.toLocaleString()} saved
            </Text>
            <Text style={[styles.goalMetaText, { color: colors.onSurfaceVariant }]}>
              ${goal.target_amount.toLocaleString()}
            </Text>
          </View>

          {/* Contribution mini bar */}
          {goal.contributions && Object.keys(goal.contributions).length > 1 && (
            <ContributionMiniBar goal={goal} colors={colors} currentUserId={user?.id} />
          )}

          {goal.contributions && Object.keys(goal.contributions).length > 0 && goal.saved_amount > 0 && (
            <View style={styles.contributionRow}>
              <Text style={[styles.contributionLabel, { color: colors.onSurfaceVariant }]}>
                Contributors
              </Text>
              <View style={styles.contributionList}>
                {Object.entries(goal.contributions).map(([pid, amount]) => (
                  <Text key={pid} style={[styles.contributionItem, { color: colors.onSurfaceVariant }]}>
                    <Text style={{ fontWeight: '600', color: colors.onSurface }}>
                      {pid === user?.id ? 'You' : 'Partner'}
                    </Text>
                    : ${amount.toFixed(2)}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {remaining > 0 && (
            <Text style={[styles.remainingText, { color: colors.onSurfaceVariant }]}>
              ${remaining.toLocaleString()} to go
            </Text>
          )}

          {remaining === 0 && goal.saved_amount > 0 && (
            <Text style={[styles.completeText, { color: colors.income }]}>
              🎉 Goal reached!
            </Text>
          )}

          {/* Expanded section */}
          {isExpanded && (
            <View style={styles.expandedSection}>
              {/* Section tabs */}
              <View style={styles.tabRow}>
                {(['add', 'withdraw', 'settings'] as ActiveSection[]).map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tab,
                      activeSection === tab && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                      { borderColor: colors.outlineVariant },
                    ]}
                    onPress={() => setActiveSection(tab)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: activeSection === tab ? colors.primary : colors.onSurfaceVariant },
                      ]}
                    >
                      {tab === 'add' ? 'Add' : tab === 'withdraw' ? 'Withdraw' : 'Settings'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Add Section */}
              {activeSection === 'add' && (
                <View>
                  {/* Detailed contributions breakdown */}
                  {goal.contributions && Object.keys(goal.contributions).length > 0 && (
                    <View style={styles.contribDetailCard}>
                      <Text style={[styles.contribDetailTitle, { color: colors.onSurface }]}>
                        Who contributed
                      </Text>
                      {Object.entries(goal.contributions).map(([pid, amount], idx) => {
                        const pct = goal.saved_amount > 0
                          ? Math.round((amount / goal.saved_amount) * 100)
                          : 0;
                        const label = pid === user?.id ? 'You' : 'Partner';
                        const barWidth = goal.saved_amount > 0
                          ? `${Math.max(2, (amount / goal.saved_amount) * 100)}%` as const
                          : '0%' as const;
                        const barColor = idx === 0 ? colors.primary : colors.income;
                        return (
                          <View key={pid} style={styles.contribDetailRow}>
                            <View style={styles.contribDetailHeader}>
                              <Text style={[styles.contribDetailName, { color: colors.onSurface }]}>
                                {label}
                              </Text>
                              <Text style={[styles.contribDetailAmount, { color: colors.onSurface }]}>
                                ${amount.toFixed(2)}
                              </Text>
                              <Text style={[styles.contribDetailPct, { color: colors.onSurfaceVariant }]}>
                                {pct}%
                              </Text>
                            </View>
                            <View style={[styles.contribDetailTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
                              <View
                                style={[
                                  styles.contribDetailFill,
                                  { width: barWidth, backgroundColor: barColor },
                                ]}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.rowInput}>
                    <TextInput
                      key={`add-${goal.id}-${addClearKey[goal.id] || 0}`}
                      style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.onSurfaceVariant}
                      keyboardType="decimal-pad"
                      defaultValue=""
                      onChangeText={(t) => { addAmountText.current[goal.id] = t; }}
                    />
                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.income }]} onPress={() => handleAdd(goal)}>
                      <Text style={styles.btnText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.quickAddRow}>
                    {[20, 50, 100, 200].map((a) => (
                      <TouchableOpacity
                        key={a}
                        style={[styles.quickBtn, { borderColor: colors.primary }]}
                        onPress={() => handleQuickAdd(goal, a)}
                      >
                        <Text style={[styles.quickBtnText, { color: colors.primary }]}>+${a}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Withdraw Section */}
              {activeSection === 'withdraw' && (
                <View>
                  <View style={styles.rowInput}>
                    <TextInput
                      key={`wd-${goal.id}-${wdClearKey[goal.id] || 0}`}
                      style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                      placeholder="Amount"
                      placeholderTextColor={colors.onSurfaceVariant}
                      keyboardType="decimal-pad"
                      defaultValue=""
                      onChangeText={(t) => { wdAmountText.current[goal.id] = t; }}
                    />
                    <TouchableOpacity style={[styles.btn, { backgroundColor: colors.expense }]} onPress={() => handleWithdraw(goal)}>
                      <Text style={styles.btnText}>Withdraw</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.balanceHint, { color: colors.onSurfaceVariant }]}>
                    Available: ${goal.saved_amount.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Settings Section */}
              {activeSection === 'settings' && (
                <View>
                  <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Goal Name</Text>
                  <TextInput
                    key={`edit-name-${goal.id}`}
                    style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                    placeholder="Goal name"
                    placeholderTextColor={colors.onSurfaceVariant}
                    defaultValue={goal.name}
                    onChangeText={(t) => { editNameRef.current = t; }}
                  />
                  <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Target Amount ($)</Text>
                  <TextInput
                    key={`edit-target-${goal.id}`}
                    style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                    placeholder="1000"
                    placeholderTextColor={colors.onSurfaceVariant}
                    keyboardType="decimal-pad"
                    defaultValue={goal.target_amount.toString()}
                    onChangeText={(t) => { editTargetRef.current = t; }}
                  />

                  {/* Auto-Save per goal */}
                  <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Auto-Save</Text>
                  <View style={styles.toggleRow}>
                    <Text style={[styles.toggleLabel, { color: colors.onSurface }]}>
                      Auto-save income to this goal
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        { backgroundColor: goal.auto_save_percentage > 0 ? colors.primary : colors.surfaceContainerLow },
                      ]}
                      onPress={() => toggleAutoSave(goal)}
                    >
                      <Text style={{ color: goal.auto_save_percentage > 0 ? '#FFFFFF' : colors.onSurfaceVariant, fontSize: 13, fontWeight: '700' }}>
                        {goal.auto_save_percentage > 0 ? 'ON' : 'OFF'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {goal.auto_save_percentage > 0 && (
                    <>
                      <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Percentage</Text>
                      <View style={styles.percentRow}>
                        {[5, 10, 15, 20, 25].map((pct) => (
                          <TouchableOpacity
                            key={pct}
                            style={[
                              styles.pctBtn,
                              {
                                borderColor: goal.auto_save_percentage === pct ? colors.primary : colors.outlineVariant,
                              },
                            ]}
                            onPress={() => setAutoSavePct(goal, pct)}
                          >
                            <Text
                              style={[
                                styles.pctBtnText,
                                { color: goal.auto_save_percentage === pct ? colors.primary : colors.onSurfaceVariant },
                              ]}
                            >
                              {pct}%
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Save and Delete buttons */}
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const name = editNameRef.current.trim() || goal.name;
                      const target = parseFloat(editTargetRef.current) || goal.target_amount;
                      if (!name) { showMsg('Goal name is required.'); return; }
                      if (target <= 0) { showMsg('Enter a valid target amount.'); return; }
                      updateSavingsGoal(goal.id, name, target);
                      editNameRef.current = '';
                      editTargetRef.current = '';
                      showMsg('Goal updated!');
                    }}
                  >
                    <Text style={styles.btnText}>Save Goal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteBtn, { borderColor: colors.expense }]}
                    onPress={() => handleDeleteGoal(goal)}
                  >
                    <Text style={[styles.deleteBtnText, { color: colors.expense }]}>Delete Goal</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [colors, expandedGoal, activeSection, user,
      toggleGoal, handleAdd, handleWithdraw, handleQuickAdd, toggleAutoSave, setAutoSavePct,
      updateSavingsGoal, handleDeleteGoal, showMsg]);

  const ListFooter = useCallback(() => (
    <View>
      {savingsGoals.length === 0 && !showNewGoal && (
        <View style={[styles.card, { backgroundColor: colors.card, alignItems: 'center', paddingVertical: 40 }]}>
          <Text style={[styles.emptyTitle, { color: colors.onSurfaceVariant }]}>No savings goals yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
            Tap "Add New Goal" to start saving for something great!
          </Text>
        </View>
      )}
      <View style={{ height: 40 }} />
    </View>
  ), [savingsGoals, showNewGoal, colors]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Savings</Text>
      </View>

      {/* Message banner (outside FlatList so typing doesn't remount header) */}
      {message && (
        <View style={[styles.messageCard, { backgroundColor: colors.primaryLight, marginHorizontal: 24, marginBottom: 4 }]}>
          <Text style={[styles.messageText, { color: colors.onPrimary }]}>{message}</Text>
        </View>
      )}

      {/* New Goal Card (outside FlatList to avoid TextInput focus loss on re-render) */}
      {showNewGoal ? (
        <View style={[styles.card, { backgroundColor: colors.card, marginHorizontal: 24, marginBottom: 12 }]}>
          <Text style={[styles.cardTitle, { color: colors.onSurface }]}>New Savings Goal</Text>
          <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Goal Name</Text>
          <TextInput
            key={`new-name-${newGoalKey}`}
            style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
            placeholder="What are you saving for?"
            placeholderTextColor={colors.onSurfaceVariant}
            defaultValue=""
            onChangeText={(t) => { newNameRef.current = t; }}
          />
          <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Target Amount ($)</Text>
          <TextInput
            key={`new-target-${newGoalKey}`}
            style={[styles.input, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
            placeholder="1000"
            placeholderTextColor={colors.onSurfaceVariant}
            keyboardType="decimal-pad"
            defaultValue=""
            onChangeText={(t) => { newTargetRef.current = t; }}
          />
          <View style={styles.newGoalActions}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreateGoal}
            >
              <Text style={styles.btnText}>Create Goal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.outlineVariant }]}
              onPress={() => { setShowNewGoal(false); newNameRef.current = ''; newTargetRef.current = ''; setNewGoalKey((k) => k + 1); }}
            >
              <Text style={[styles.cancelBtnText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addGoalCard, { borderColor: colors.primary, backgroundColor: colors.primaryLight, marginHorizontal: 24, marginBottom: 12 }]}
          onPress={() => setShowNewGoal(true)}
        >
          <Text style={[styles.addGoalIcon, { color: colors.primary }]}>+</Text>
          <Text style={[styles.addGoalText, { color: colors.primary }]}>Add New Goal</Text>
        </TouchableOpacity>
      )}

      <DraggableFlatList
        data={savingsGoals}
        renderItem={renderGoalItem}
        keyExtractor={(goal) => goal.id}
        onDragEnd={handleDragEnd}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        activationDistance={10}                extraData={{ expandedGoal, activeSection }}
        containerStyle={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

function ContributionMiniBar({ goal, colors, currentUserId }: { goal: SavingsGoal; colors: any; currentUserId?: string }) {
  const entries = Object.entries(goal.contributions);
  if (entries.length === 0 || goal.saved_amount <= 0) return null;

  // Partner colors — we use primary for the first contributor, income for the second
  const barColors = [colors.primary, colors.income, colors.expense, colors.onSurfaceVariant];

  return (
    <View style={styles.contribMiniContainer}>
      <View style={[styles.contribMiniTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
        {entries.map(([pid, amount], idx) => {
          const widthPct = Math.max(4, (amount / goal.saved_amount) * 100);
          return (
            <View
              key={pid}
              style={[
                styles.contribMiniFill,
                {
                  width: `${Math.min(widthPct, Math.max(0, 100 - entries.slice(0, idx).reduce((s, [_, a]) => s + (a / goal.saved_amount) * 100, 0)))}%` as const,
                  backgroundColor: barColors[idx % barColors.length],
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.contribMiniLabels}>
        {entries.map(([pid, amount], idx) => (
          <View key={pid} style={styles.contribMiniLabelItem}>
            <View style={[styles.contribMiniDot, { backgroundColor: barColors[idx % barColors.length] }]} />
            <Text style={[styles.contribMiniLabelText, { color: colors.onSurfaceVariant }]}>
              {pid === currentUserId ? 'You' : 'Partner'}: ${amount.toFixed(0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  title: { fontSize: 20, fontWeight: '700', fontFamily: 'Montserrat' },
  listContent: { padding: 24, gap: 16 },

  // Message
  messageCard: { padding: 16, borderRadius: 12 },
  messageText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Summary
  summaryCard: { padding: 20, borderRadius: 20 },
  summaryTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 12, textAlign: 'center' },
  summaryMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  summaryText: { fontSize: 13, fontWeight: '500' },

  // Add goal card
  addGoalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 8,
  },
  addGoalIcon: { fontSize: 24, fontWeight: '700' },
  addGoalText: { fontSize: 16, fontWeight: '700' },

  // Goal card
  goalCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  dragHandle: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  dragIcon: { fontSize: 22, fontWeight: '700', lineHeight: 24 },
  goalName: { fontSize: 17, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 4 },
  goalPercent: { fontSize: 24, fontWeight: '800', fontFamily: 'Montserrat' },
  goalRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  autoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  autoBadgeText: { fontSize: 11, fontWeight: '700' },
  expandIcon: { fontSize: 12, fontWeight: '600' },

  progressTrack: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', borderRadius: 7 },

  goalMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  goalMetaText: { fontSize: 12, fontWeight: '500' },
  remainingText: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 4 },
  completeText: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4 },

  // Expanded section
  expandedSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#E8E8E8', paddingTop: 16 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '600' },

  // Inputs / buttons
  rowInput: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  btn: { paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  saveBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  cancelBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flex: 1 },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },

  // Contribution mini bar
  contribMiniContainer: { marginTop: 12, marginBottom: 4 },
  contribMiniTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  contribMiniFill: { height: '100%' },
  contribMiniLabels: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  contribMiniLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contribMiniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  contribMiniLabelText: { fontSize: 11, fontWeight: '500' },

  // Contribution text row (collapsed card)
  contributionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  contributionLabel: { fontSize: 12, fontWeight: '500' },
  contributionList: { flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  contributionItem: { fontSize: 12 },

  // Detailed contributions (expanded add section)
  contribDetailCard: {
    backgroundColor: '#00000008',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  contribDetailTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  contribDetailRow: { marginBottom: 10 },
  contribDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  contribDetailName: { fontSize: 13, fontWeight: '600', flex: 1 },
  contribDetailAmount: { fontSize: 13, fontWeight: '700' },
  contribDetailPct: { fontSize: 12, fontWeight: '500', minWidth: 36, textAlign: 'right' },
  contribDetailTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  contribDetailFill: { height: '100%', borderRadius: 4 },

  // Quick add
  quickAddRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  quickBtn: { flex: 1, minWidth: 60, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  quickBtnText: { fontSize: 13, fontWeight: '700' },

  balanceHint: { fontSize: 12, fontWeight: '500', marginTop: 8, textAlign: 'center' },

  // Auto-save per goal
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleLabel: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, minWidth: 60, alignItems: 'center' },
  percentRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pctBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  pctBtnText: { fontSize: 13, fontWeight: '700' },

  // Delete
  deleteBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 12 },
  deleteBtnText: { fontSize: 14, fontWeight: '600' },

  // New goal actions
  newGoalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },

  // Empty state
  emptyTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  card: { padding: 20, borderRadius: 20 },
  cardTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Montserrat', marginBottom: 16 },
});
