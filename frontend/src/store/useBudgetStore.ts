import { create } from 'zustand';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const USER_KEY = '@ourfinances_user';

// Track the onAuthStateChange subscription so we can clean it up
let _authListener: { data: { subscription: { unsubscribe: () => void } } } | null = null;

const SAVINGS_KEY = '@ourfinances_savings';

// Polling interval for cross-device sync (milliseconds)
const SYNC_POLL_INTERVAL = 15000;
let _syncInterval: ReturnType<typeof setInterval> | null = null;

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  group_id: string;
  expo_push_token: string | null;
}

export interface Budget {
  id: string;
  name: string;
  fluid_balance: number;
  monthly_limit: number;
  profiles_count?: number;
}

export interface Transaction {
  id: string;
  group_id: string;
  profile_id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  memo: string;
  date: string;
}

export interface SavingsGoal {
  id: string;
  group_id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  auto_save_percentage: number;
  sort_order: number;
  contributions: Record<string, number>;
}

interface BudgetState {
  token: string | null;
  user: Profile | null;
  budget: Budget | null;
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  partnerCode: string | null;
  theme: 'light' | 'dark';
  savingsGoals: SavingsGoal[];

  // Actions
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchData: () => Promise<void>;
  fetchSavings: () => Promise<void>;
  addTransaction: (amount: number, type: 'expense' | 'income', category: string, memo: string) => Promise<void>;
  generatePartnerCode: () => Promise<void>;
  linkPartner: (code: string) => Promise<void>;
  updateBudgetLimit: (monthly_limit: number) => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
  createSavingsGoal: (name: string, target: number, autoSavePct?: number) => Promise<void>;
  updateSavingsGoal: (goalId: string, name: string, target: number) => Promise<void>;
  updateAutoSavePct: (goalId: string, pct: number) => Promise<void>;
  addToSavings: (goalId: string, amount: number) => Promise<void>;
  withdrawFromSavings: (goalId: string, amount: number) => Promise<void>;
  reorderSavingsGoals: (goalIds: string[]) => Promise<void>;
  deleteSavingsGoal: (goalId: string) => Promise<void>;
}

/** Build a Profile object from a Supabase auth user and optional budget group ID. */
const buildProfile = (
  supabaseUser: { id: string; email?: string | null; user_metadata?: { [key: string]: any } },
  groupId?: string,
): Profile => {
  const email = supabaseUser.email || '';
  const metadataName = supabaseUser.user_metadata?.display_name as string | undefined;
  const rawName = metadataName || email.split('@')[0] || 'User';
  // Handle dotted emails like "firstname.lastname" -> "Firstname Lastname"
  const cleanName = rawName.replace(/\./g, ' ');
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  return {
    id: supabaseUser.id,
    email,
    display_name: capitalized,
    group_id: groupId || '',
    expo_push_token: null,
  };
};

/** Extract a non-null user from a Supabase auth response, throwing if missing. */
const requireUser = (
  user: { id: string; email?: string | null; user_metadata?: { [key: string]: any } } | null,
): { id: string; email?: string | null; user_metadata?: { [key: string]: any } } => {
  if (!user) throw new Error('Authentication failed: no user data returned.');
  return user;
};

/** Persist savings goals to AsyncStorage. */
const persistSavings = async (goals: SavingsGoal[]) => {
  try {
    await AsyncStorage.setItem(SAVINGS_KEY, JSON.stringify(goals));
  } catch {}
};

export const useBudgetStore = create<BudgetState>((set, get) => ({
  token: null,
  user: null,
  budget: null,
  transactions: [],
  isLoading: true, // Start loading while we init
  error: null,
  partnerCode: null,
  theme: 'light',
  savingsGoals: [],

  init: async () => {
    try {
      // Load persisted savings goals
      try {
        const savedData = await AsyncStorage.getItem(SAVINGS_KEY);
        if (savedData) {
          const parsed = JSON.parse(savedData);
          if (Array.isArray(parsed)) {
            set({ savingsGoals: parsed });
          }
        }
      } catch {}

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        api.setToken(session.access_token);

        // Clean up any previous listener to prevent memory leaks on re-init
        if (_authListener) {
          _authListener.data.subscription.unsubscribe();
        }

        // Subscribe to token refresh — keep api.token in sync
        _authListener = supabase.auth.onAuthStateChange(
          (_event: AuthChangeEvent, newSession: Session | null) => {
            if (newSession?.access_token) {
              api.setToken(newSession.access_token);
            }
          },
        );

        // Fetch fresh data
        try {
          const [transactions, budget] = await Promise.all([
            api.getTransactions(),
            api.getBudget(),
          ]);

          const profile = buildProfile(session.user, budget.id);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));

          // Fetch latest savings from backend
          get().fetchSavings();

          set({
            token: session.access_token,
            user: profile,
            transactions,
            budget,
            isLoading: false,
          });

          // Start background sync polling for cross-device real-time updates
          startSyncPolling();
        } catch (err) {
          // Session expired or network error — sign out cleanly
          await supabase.auth.signOut().catch(() => {});
          api.setToken(null);
          await AsyncStorage.removeItem(USER_KEY).catch(() => {});
          set({ token: null, user: null, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No session returned from login');

      const session = data.session;
      const user = requireUser(data.user);
      api.setToken(session.access_token);

      // Fetch budget & transactions
      const [transactions, budget] = await Promise.all([
        api.getTransactions(),
        api.getBudget(),
      ]);

      const profile = buildProfile(user, budget.id);

      // Persist user profile locally
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));

      // Fetch latest savings from backend
      get().fetchSavings();

      set({
        token: session.access_token,
        user: profile,
        budget,
        transactions,
        isLoading: false,
      });

      // Start background sync for cross-device real-time updates
      startSyncPolling();
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        // If email confirmation is required, the session may be null.
        throw new Error(
          'Check your email for a confirmation link, then come back and sign in.',
        );
      }

      const session = data.session;
      const user = requireUser(data.user);
      api.setToken(session.access_token);

      // Fetch budget & transactions (backend auto-creates profile on first request)
      const [transactions, budget] = await Promise.all([
        api.getTransactions(),
        api.getBudget(),
      ]);

      const profile = buildProfile(user, budget.id);

      // Persist user profile locally
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));

      // Sync savings from backend
      get().fetchSavings();

      set({
        token: session.access_token,
        user: profile,
        budget,
        transactions,
        isLoading: false,
      });

      // Start background sync for cross-device real-time updates
      startSyncPolling();
    } catch (err: any) {
      set({ error: err.message || 'Sign up failed', isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    // Stop background sync polling
    stopSyncPolling();

    // Clean up auth listener
    if (_authListener) {
      _authListener.data.subscription.unsubscribe();
      _authListener = null;
    }
    await supabase.auth.signOut().catch(() => {});
    api.setToken(null);
    await AsyncStorage.removeItem(USER_KEY).catch(() => {});
    set({
      token: null,
      user: null,
      budget: null,
      transactions: [],
      partnerCode: null,
    });
  },

  fetchSavings: async () => {
    if (!get().token) return;
    try {
      const goals = await api.getSavingsGoals();
      set({ savingsGoals: goals });
      persistSavings(goals);
    } catch {
      // Backend unavailable — keep local state
    }
  },

  fetchData: async () => {
    if (!get().token) return;
    // Don't show loading spinner for background refresh if already has data
    const hasData = get().transactions.length > 0 && get().budget !== null;
    if (!hasData) {
      set({ isLoading: true, error: null });
    }
    try {
      const [transactions, budget] = await Promise.all([
        api.getTransactions(),
        api.getBudget(),
      ]);
      set({ transactions, budget, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch data', isLoading: false });
    }
  },

  addTransaction: async (amount: number, type: 'expense' | 'income', category: string, memo: string) => {
    const currentBudget = get().budget;
    const currentTransactions = get().transactions;
    const currentUser = get().user;

    if (!currentBudget || !currentUser) {
      set({ error: 'Cannot add transaction: budget or profile not loaded' });
      return;
    }

    // Compute effective amount: subtract auto-save for income transactions
    let effectiveAmount = type === 'income' ? amount : amount;
    let totalAutoSave = 0;
    if (type === 'income') {
      const goals = get().savingsGoals;
      for (const goal of goals) {
        const pct = goal.auto_save_percentage;
        if (pct > 0) {
          totalAutoSave += (amount * pct) / 100;
        }
      }
      effectiveAmount = amount - totalAutoSave;
    }

    // Optimistic update
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticTx: Transaction = {
      id: optimisticId,
      group_id: currentBudget.id,
      profile_id: currentUser.id,
      amount,
      type,
      category,
      memo,
      date: new Date().toISOString(),
    };

    const currentBalance = Number(currentBudget.fluid_balance);
    const newBalance = type === 'expense' ? currentBalance - effectiveAmount : currentBalance + effectiveAmount;
    const optimisticBudget = { ...currentBudget, fluid_balance: newBalance };

    set({ transactions: [optimisticTx, ...currentTransactions], budget: optimisticBudget });

    try {
      const result = await api.createTransaction({ amount: effectiveAmount, type, category, memo });
      const serverTx = result.transaction;
      const serverBalance = result.fluid_balance;

      // Apply auto-save to each goal after successful income transaction
      if (type === 'income' && totalAutoSave > 0) {
        const prevGoals = get().savingsGoals;
        const updatedGoals = prevGoals.map((goal) => {
          const pct = goal.auto_save_percentage;
          if (pct > 0) {
            const savedNow = (amount * pct) / 100;
            return { ...goal, saved_amount: goal.saved_amount + savedNow };
          }
          return goal;
        });
        set({ savingsGoals: updatedGoals });
        persistSavings(updatedGoals);

        // Also sync each deposit to backend
        for (const goal of updatedGoals) {
          if (goal.auto_save_percentage > 0) {
            const savedNow = (amount * goal.auto_save_percentage) / 100;
            try {
              await api.savingsDeposit(goal.id, savedNow);
            } catch {}
          }
        }
      }

      set((state) => ({
        transactions: state.transactions.map((tx) =>
          tx.id === optimisticId ? serverTx : tx,
        ),
        budget: state.budget ? { ...state.budget, fluid_balance: serverBalance } : null,
      }));
    } catch (err: any) {
      set({
        transactions: currentTransactions,
        budget: currentBudget,
        error: `Failed to save transaction: ${err.message}. Rolled back.`,
      });
      throw err;
    }
  },

  generatePartnerCode: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.generatePartnerCode();
      set({ partnerCode: res.code, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to generate code', isLoading: false });
    }
  },

  linkPartner: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.linkPartner(code);

      // Refresh state after linking
      const [transactions, budget] = await Promise.all([
        api.getTransactions(),
        api.getBudget(),
      ]);

      // Sync savings for the new group
      get().fetchSavings();

      const currentUser = get().user;
      const updatedUser = currentUser ? { ...currentUser, group_id: res.group_id } : null;

      // Persist updated user
      if (updatedUser) {
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      }

      set({
        user: updatedUser,
        budget,
        transactions,
        partnerCode: null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Linking failed', isLoading: false });
      throw err;
    }
  },

  updateBudgetLimit: async (monthly_limit: number) => {
    const currentBudget = get().budget;
    if (!currentBudget) return;

    set({ budget: { ...currentBudget, monthly_limit } });

    try {
      await api.updateBudget({ monthly_limit });
    } catch (err: any) {
      set({ budget: currentBudget, error: `Failed to update limit: ${err.message}` });
    }
  },

  setTheme: (theme: 'light' | 'dark') => {
    set({ theme });
  },

  createSavingsGoal: async (name: string, target: number, autoSavePct = 0) => {
    const prev = get().savingsGoals;
    const newGoal: SavingsGoal = {
      id: `local-${Date.now()}`,
      group_id: get().user?.group_id || '',
      name,
      target_amount: target,
      saved_amount: 0,
      auto_save_percentage: Math.max(0, Math.min(100, autoSavePct)),
      sort_order: prev.length,
      contributions: {},
    };
    const updated = [...prev, newGoal];
    set({ savingsGoals: updated });
    persistSavings(updated);

    // Sync to backend
    try {
      const serverGoal = await api.createSavingsGoal({
        name,
        target_amount: target,
        auto_save_percentage: newGoal.auto_save_percentage,
      });
      set({ savingsGoals: get().savingsGoals.map((g) => (g.id === newGoal.id ? serverGoal : g)) });
      persistSavings(get().savingsGoals);
    } catch {}
  },

  updateSavingsGoal: async (goalId: string, name: string, target: number) => {
    const prev = get().savingsGoals;
    const updated = prev.map((g) =>
      g.id === goalId ? { ...g, name, target_amount: target } : g,
    );
    set({ savingsGoals: updated });
    persistSavings(updated);

    try {
      await api.updateSavingsGoal(goalId, { name, target_amount: target });
    } catch {}
  },

  updateAutoSavePct: async (goalId: string, pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const prev = get().savingsGoals;
    const updated = prev.map((g) =>
      g.id === goalId ? { ...g, auto_save_percentage: clamped } : g,
    );
    set({ savingsGoals: updated });
    persistSavings(updated);

    try {
      await api.updateSavingsGoal(goalId, { auto_save_percentage: clamped });
    } catch {}
  },

  addToSavings: async (goalId: string, amount: number) => {
    const prev = get().savingsGoals;
    const updated = prev.map((g) =>
      g.id === goalId ? { ...g, saved_amount: g.saved_amount + amount } : g,
    );
    set({ savingsGoals: updated });
    persistSavings(updated);

    try {
      await api.savingsDeposit(goalId, amount);
    } catch {}
  },

  withdrawFromSavings: async (goalId: string, amount: number) => {
    const prev = get().savingsGoals;
    const goal = prev.find((g) => g.id === goalId);
    if (!goal) return;
    const newSaved = Math.max(0, goal.saved_amount - amount);
    const updated = prev.map((g) =>
      g.id === goalId ? { ...g, saved_amount: newSaved } : g,
    );
    set({ savingsGoals: updated });
    persistSavings(updated);

    try {
      await api.savingsWithdraw(goalId, amount);
    } catch {}
  },

  reorderSavingsGoals: async (goalIds: string[]) => {
    const currentGoals = get().savingsGoals;
    // Build a map of current goals keyed by id
    const goalMap = new Map(currentGoals.map((g) => [g.id, g]));
    const reordered = goalIds
      .map((id, idx) => {
        const g = goalMap.get(id);
        return g ? { ...g, sort_order: idx } : null;
      })
      .filter(Boolean) as SavingsGoal[];
    // Append any goals not in the list (shouldn't happen, but safe fallback)
    const seen = new Set(goalIds);
    for (const g of currentGoals) {
      if (!seen.has(g.id)) {
        reordered.push({ ...g, sort_order: reordered.length });
      }
    }
    set({ savingsGoals: reordered });
    persistSavings(reordered);

    try {
      await api.reorderSavingsGoals(goalIds);
    } catch {}
  },

  deleteSavingsGoal: async (goalId: string) => {
    const prev = get().savingsGoals;
    const updated = prev.filter((g) => g.id !== goalId);
    set({ savingsGoals: updated });
    persistSavings(updated);

    try {
      await api.deleteSavingsGoal(goalId);
    } catch {}
  },
}));

/** Start background polling so both partners see each other's changes in near real-time. */
function startSyncPolling() {
  stopSyncPolling();
  _syncInterval = setInterval(async () => {
    try {
      const store = useBudgetStore.getState();
      if (!store.token) return;

      const [transactions, budget, savingsGoals] = await Promise.all([
        api.getTransactions(),
        api.getBudget(),
        api.getSavingsGoals(),
      ]);

      useBudgetStore.setState({
        transactions,
        budget,
        savingsGoals,
      });
      persistSavings(savingsGoals);
    } catch {
      // Silently retry on next interval
    }
  }, SYNC_POLL_INTERVAL);
}

/** Stop the background sync polling. */
function stopSyncPolling() {
  if (_syncInterval !== null) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}
