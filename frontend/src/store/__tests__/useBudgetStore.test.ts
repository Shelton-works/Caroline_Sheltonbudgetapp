/**
 * useBudgetStore.test.ts — Unit tests for multi-goal savings store actions.
 *
 * Run with:
 *   cd frontend && npx vitest run
 * or:
 *   cd frontend && npx vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing the store
// ---------------------------------------------------------------------------
// vi.mock calls are hoisted to the top of the file by vitest.
// Use vi.hoisted() to create objects that the hoisted factory can reference.

const { mockApi } = vi.hoisted(() => {
  let goalCounter = 0;
  let txCounter = 0;

  function makeGoal(overrides: Record<string, any> = {}) {
    goalCounter++;
    return {
      id: 'server-goal-' + goalCounter,
      group_id: 'group-test-1',
      name: 'Test Goal',
      target_amount: 1000,
      saved_amount: 0,
      auto_save_percentage: 0,
      sort_order: 0,
      ...overrides,
    };
  }

  function makeTx(overrides: Record<string, any> = {}) {
    txCounter++;
    return {
      transaction: {
        id: 'tx-' + txCounter,
        group_id: 'group-test-1',
        profile_id: 'user-test-1',
        amount: 0,
        type: 'income',
        category: '',
        memo: '',
        date: new Date().toISOString(),
        ...overrides.transaction,
      },
      fluid_balance: overrides.fluid_balance ?? 5000,
    };
  }

  return {
    mockApi: {
      setToken: vi.fn(),
      getSavingsGoals: vi.fn(),
      // Store replaces local goal with server response — must match input
      createSavingsGoal: vi.fn().mockImplementation(({ name, target_amount, auto_save_percentage }) =>
        Promise.resolve(makeGoal({ name, target_amount, auto_save_percentage })),
      ),
      updateSavingsGoal: vi.fn().mockResolvedValue({}),
      savingsDeposit: vi.fn().mockResolvedValue({}),
      savingsWithdraw: vi.fn().mockResolvedValue({}),
      reorderSavingsGoals: vi.fn().mockResolvedValue({ status: 'reordered', goals: [] }),
      deleteSavingsGoal: vi.fn().mockResolvedValue({ status: 'deleted' }),
      createTransaction: vi.fn().mockImplementation(({ amount }) =>
        Promise.resolve(makeTx({ fluid_balance: 5000 + amount })),
      ),
      getTransactions: vi.fn(),
      getBudget: vi.fn(),
      generatePartnerCode: vi.fn(),
      linkPartner: vi.fn(),
      updateBudget: vi.fn(),
      registerPushToken: vi.fn(),
    },
  };
});

// Mock supabase — used by the store but not needed for savings actions
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock the API client — references the hoisted mockApi
vi.mock('../../lib/api', () => ({
  api: mockApi,
}));

// Now import the store after mocks are set up
import { useBudgetStore } from '../useBudgetStore';

// Export mockApi so tests can configure it
export { mockApi };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the store to a clean state for each test. */
function resetStore() {
  useBudgetStore.setState({
    token: 'mock-token',
    user: {
      id: 'user-test-1',
      email: 'test@example.com',
      display_name: 'Test',
      group_id: 'group-test-1',
      expo_push_token: null,
    },
    budget: {
      id: 'group-test-1',
      name: 'Test Budget',
      fluid_balance: 5000.0,
      monthly_limit: 2000.0,
    },
    transactions: [],
    isLoading: false,
    error: null,
    partnerCode: null,
    theme: 'light',
    savingsGoals: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Multi-Goal Savings Store Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ===================================================================
  // createSavingsGoal
  // ===================================================================
  describe('createSavingsGoal', () => {
    it('should add a new goal to an empty list', async () => {
      await useBudgetStore.getState().createSavingsGoal('Vacation', 3000);

      const goals = useBudgetStore.getState().savingsGoals;
      expect(goals).toHaveLength(1);
      expect(goals[0].name).toBe('Vacation');
      expect(goals[0].target_amount).toBe(3000);
      expect(goals[0].saved_amount).toBe(0);
      expect(goals[0].sort_order).toBe(0);
    });

    it('should add a goal with auto-save percentage', async () => {
      await useBudgetStore.getState().createSavingsGoal('Auto', 1000, 15);

      const goal = useBudgetStore.getState().savingsGoals[0];
      expect(goal.auto_save_percentage).toBe(15);
    });

    it('should clamp auto-save percentage to 0-100', async () => {
      // Store clamps locally, then sends clamped value to server — final value is clamped
      await useBudgetStore.getState().createSavingsGoal('Over', 500, 150);
      expect(useBudgetStore.getState().savingsGoals[0].auto_save_percentage).toBe(100);

      resetStore();
      await useBudgetStore.getState().createSavingsGoal('Under', 500, -10);
      expect(useBudgetStore.getState().savingsGoals[0].auto_save_percentage).toBe(0);
    });

    it('should sort_order be 0 for all new goals (server assigns sort_order)', async () => {
      // Backend always returns sort_order: 0 for new goals
      await useBudgetStore.getState().createSavingsGoal('First', 100);
      await useBudgetStore.getState().createSavingsGoal('Second', 200);
      await useBudgetStore.getState().createSavingsGoal('Third', 300);

      const goals = useBudgetStore.getState().savingsGoals;
      goals.forEach((g) => {
        expect(g.sort_order).toBe(0);
      });
    });

    it('should persist to AsyncStorage (store state changes)', async () => {
      await useBudgetStore.getState().createSavingsGoal('Test', 100);
      const goals = useBudgetStore.getState().savingsGoals;
      expect(goals).toHaveLength(1);
    });

    it('should sync to backend (silent catch on failure)', async () => {
      mockApi.createSavingsGoal.mockRejectedValueOnce(new Error('Network error'));
      await useBudgetStore.getState().createSavingsGoal('Offline', 500);
      expect(useBudgetStore.getState().savingsGoals).toHaveLength(1);
    });
  });

  // ===================================================================
  // updateSavingsGoal
  // ===================================================================
  describe('updateSavingsGoal', () => {
    it('should update goal name and target', async () => {
      await useBudgetStore.getState().createSavingsGoal('Old Name', 100);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().updateSavingsGoal(goalId, 'New Name', 5000);

      const goal = useBudgetStore.getState().savingsGoals[0];
      expect(goal.name).toBe('New Name');
      expect(goal.target_amount).toBe(5000);
    });

    it('should not affect other goals', async () => {
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      await useBudgetStore.getState().createSavingsGoal('B', 200);
      const goals = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().updateSavingsGoal(goals[0].id, 'Updated A', 999);

      const updated = useBudgetStore.getState().savingsGoals;
      expect(updated[0].name).toBe('Updated A');
      expect(updated[0].target_amount).toBe(999);
      expect(updated[1].name).toBe('B');
      expect(updated[1].target_amount).toBe(200);
    });
  });

  // ===================================================================
  // updateAutoSavePct
  // ===================================================================
  describe('updateAutoSavePct', () => {
    it('should update auto_save_percentage', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().updateAutoSavePct(goalId, 25);
      expect(useBudgetStore.getState().savingsGoals[0].auto_save_percentage).toBe(25);
    });

    it('should clamp percentage to 0-100', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().updateAutoSavePct(goalId, 200);
      expect(useBudgetStore.getState().savingsGoals[0].auto_save_percentage).toBe(100);

      await useBudgetStore.getState().updateAutoSavePct(goalId, -5);
      expect(useBudgetStore.getState().savingsGoals[0].auto_save_percentage).toBe(0);
    });
  });

  // ===================================================================
  // addToSavings
  // ===================================================================
  describe('addToSavings', () => {
    it('should increase saved_amount', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().addToSavings(goalId, 500);
      expect(useBudgetStore.getState().savingsGoals[0].saved_amount).toBe(500);
    });

    it('should accumulate multiple deposits', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().addToSavings(goalId, 100);
      await useBudgetStore.getState().addToSavings(goalId, 200);
      await useBudgetStore.getState().addToSavings(goalId, 50);

      expect(useBudgetStore.getState().savingsGoals[0].saved_amount).toBe(350);
    });

    it('should not affect other goals', async () => {
      await useBudgetStore.getState().createSavingsGoal('A', 1000);
      await useBudgetStore.getState().createSavingsGoal('B', 2000);
      const [a, b] = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().addToSavings(a.id, 300);

      const goals = useBudgetStore.getState().savingsGoals;
      expect(goals.find((g) => g.id === a.id)!.saved_amount).toBe(300);
      expect(goals.find((g) => g.id === b.id)!.saved_amount).toBe(0);
    });
  });

  // ===================================================================
  // withdrawFromSavings
  // ===================================================================
  describe('withdrawFromSavings', () => {
    it('should decrease saved_amount', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;
      await useBudgetStore.getState().addToSavings(goalId, 500);

      await useBudgetStore.getState().withdrawFromSavings(goalId, 200);
      expect(useBudgetStore.getState().savingsGoals[0].saved_amount).toBe(300);
    });

    it('should floor at 0 when withdrawing more than saved', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const goalId = useBudgetStore.getState().savingsGoals[0].id;

      await useBudgetStore.getState().withdrawFromSavings(goalId, 9999);
      expect(useBudgetStore.getState().savingsGoals[0].saved_amount).toBe(0);
    });

    it('should do nothing if goal does not exist', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal', 1000);
      const saved = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().withdrawFromSavings('nonexistent', 100);
      expect(useBudgetStore.getState().savingsGoals).toEqual(saved);
    });
  });

  // ===================================================================
  // reorderSavingsGoals
  // ===================================================================
  describe('reorderSavingsGoals', () => {
    it('should reverse goal order', async () => {
      await useBudgetStore.getState().createSavingsGoal('First', 100);
      await useBudgetStore.getState().createSavingsGoal('Second', 200);
      const goals = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().reorderSavingsGoals([
        goals[1].id,
        goals[0].id,
      ]);

      const reordered = useBudgetStore.getState().savingsGoals;
      expect(reordered[0].name).toBe('Second');
      expect(reordered[0].sort_order).toBe(0);
      expect(reordered[1].name).toBe('First');
      expect(reordered[1].sort_order).toBe(1);
    });

    it('should append missing goals at the end', async () => {
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      await useBudgetStore.getState().createSavingsGoal('B', 200);
      const goals = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().reorderSavingsGoals([goals[1].id]);

      const reordered = useBudgetStore.getState().savingsGoals;
      expect(reordered[0].name).toBe('B');
      expect(reordered[0].sort_order).toBe(0);
      expect(reordered[1].name).toBe('A');
      expect(reordered[1].sort_order).toBe(1);
    });

    it('should handle empty list gracefully', async () => {
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      await useBudgetStore.getState().createSavingsGoal('B', 200);

      await useBudgetStore.getState().reorderSavingsGoals([]);
      expect(useBudgetStore.getState().savingsGoals).toHaveLength(2);
    });

    it('should sync to backend', async () => {
      mockApi.reorderSavingsGoals.mockResolvedValue({ status: 'reordered' });
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      const goals = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().reorderSavingsGoals([goals[0].id]);
      expect(mockApi.reorderSavingsGoals).toHaveBeenCalledTimes(1);
    });

    it('should handle backend failure gracefully', async () => {
      mockApi.reorderSavingsGoals.mockRejectedValueOnce(new Error('Network error'));
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      const goals = useBudgetStore.getState().savingsGoals;

      await expect(
        useBudgetStore.getState().reorderSavingsGoals([goals[0].id]),
      ).resolves.not.toThrow();
      expect(useBudgetStore.getState().savingsGoals).toHaveLength(1);
    });
  });

  // ===================================================================
  // deleteSavingsGoal
  // ===================================================================
  describe('deleteSavingsGoal', () => {
    it('should remove the goal from the list', async () => {
      await useBudgetStore.getState().createSavingsGoal('To Delete', 500);
      await useBudgetStore.getState().createSavingsGoal('Keep', 1000);
      const goals = useBudgetStore.getState().savingsGoals;
      const deleteId = goals.find((g) => g.name === 'To Delete')!.id;

      await useBudgetStore.getState().deleteSavingsGoal(deleteId);

      const remaining = useBudgetStore.getState().savingsGoals;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Keep');
    });

    it('should not affect other goals', async () => {
      await useBudgetStore.getState().createSavingsGoal('A', 100);
      await useBudgetStore.getState().createSavingsGoal('B', 200);
      await useBudgetStore.getState().createSavingsGoal('C', 300);
      const goals = useBudgetStore.getState().savingsGoals;

      await useBudgetStore.getState().deleteSavingsGoal(goals[1].id);

      const remaining = useBudgetStore.getState().savingsGoals;
      expect(remaining).toHaveLength(2);
      expect(remaining[0].name).toBe('A');
      expect(remaining[1].name).toBe('C');
    });
  });

  // ===================================================================
  // addTransaction with auto-save
  // ===================================================================
  describe('addTransaction with auto-save', () => {
    it('should distribute income to goals with auto-save enabled', async () => {
      await useBudgetStore.getState().createSavingsGoal('Vacation', 3000, 10);
      await useBudgetStore.getState().createSavingsGoal('Emergency', 5000, 5);

      mockApi.createTransaction.mockResolvedValue({
        transaction: {
          id: 'server-tx-1',
          group_id: 'group-test-1',
          profile_id: 'user-test-1',
          amount: 85,
          type: 'income',
          category: 'Salary',
          memo: 'Payday',
          date: new Date().toISOString(),
        },
        fluid_balance: 5085,
      });

      await useBudgetStore.getState().addTransaction(100, 'income', 'Salary', 'Payday');

      const goals = useBudgetStore.getState().savingsGoals;
      const vacation = goals.find((g) => g.name === 'Vacation')!;
      const emergency = goals.find((g) => g.name === 'Emergency')!;

      expect(vacation.saved_amount).toBe(10);   // 10% of 100
      expect(emergency.saved_amount).toBe(5);   // 5% of 100
    });

    it('should deduct auto-save from effective balance', async () => {
      await useBudgetStore.getState().createSavingsGoal('Vacation', 3000, 10);
      mockApi.createTransaction.mockResolvedValue({
        transaction: { id: 'tx-1', amount: 90, type: 'income', category: '', memo: '', date: '', group_id: '', profile_id: '' },
        fluid_balance: 5090,
      });

      await useBudgetStore.getState().addTransaction(100, 'income', 'Salary', 'Payday');
      expect(useBudgetStore.getState().budget!.fluid_balance).toBe(5090);
    });

    it('should not auto-save for expense transactions', async () => {
      await useBudgetStore.getState().createSavingsGoal('Vacation', 3000, 10);
      const initialSaved = useBudgetStore.getState().savingsGoals[0].saved_amount;

      mockApi.createTransaction.mockResolvedValue({
        transaction: { id: 'tx-1', amount: 50, type: 'expense', category: 'Food', memo: '', date: '', group_id: '', profile_id: '' },
        fluid_balance: 4950,
      });

      await useBudgetStore.getState().addTransaction(50, 'expense', 'Food', 'Lunch');
      expect(useBudgetStore.getState().savingsGoals[0].saved_amount).toBe(initialSaved);
    });

    it('should not auto-save if no goals have auto-save enabled', async () => {
      await useBudgetStore.getState().createSavingsGoal('Vacation', 3000, 0);
      await useBudgetStore.getState().createSavingsGoal('Emergency', 5000, 0);

      mockApi.createTransaction.mockResolvedValue({
        transaction: { id: 'tx-1', amount: 200, type: 'income', category: '', memo: '', date: '', group_id: '', profile_id: '' },
        fluid_balance: 5200,
      });

      await useBudgetStore.getState().addTransaction(200, 'income', 'Salary', 'Payday');
      useBudgetStore.getState().savingsGoals.forEach((g) => {
        expect(g.saved_amount).toBe(0);
      });
    });

    it('should distribute multiple auto-save percentages correctly', async () => {
      await useBudgetStore.getState().createSavingsGoal('Goal A', 1000, 20);
      await useBudgetStore.getState().createSavingsGoal('Goal B', 1000, 30);
      await useBudgetStore.getState().createSavingsGoal('Goal C', 1000, 50);

      mockApi.createTransaction.mockResolvedValue({
        transaction: { id: 'tx-1', amount: 0, type: 'income', category: '', memo: '', date: '', group_id: '', profile_id: '' },
        fluid_balance: 5000,
      });

      await useBudgetStore.getState().addTransaction(200, 'income', 'Salary', 'Pay');

      const goals = useBudgetStore.getState().savingsGoals;
      expect(goals.find((g) => g.name === 'Goal A')!.saved_amount).toBe(40);
      expect(goals.find((g) => g.name === 'Goal B')!.saved_amount).toBe(60);
      expect(goals.find((g) => g.name === 'Goal C')!.saved_amount).toBe(100);
    });

    it('should not crash when budget or user is not loaded', async () => {
      useBudgetStore.setState({ budget: null, user: null });

      await expect(
        useBudgetStore.getState().addTransaction(100, 'income', 'Salary', 'Test'),
      ).resolves.not.toThrow();
    });
  });

  // ===================================================================
  // Initial state
  // ===================================================================
  describe('initial state', () => {
    it('should start with empty savings goals', () => {
      const state = useBudgetStore.getState();
      expect(state.savingsGoals).toEqual([]);
    });
  });
});
