import { create } from 'zustand';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const USER_KEY = '@ourfinances_user';

// Track the onAuthStateChange subscription so we can clean it up
let _authListener: { data: { subscription: { unsubscribe: () => void } } } | null = null;

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

interface BudgetState {
  token: string | null;
  user: Profile | null;
  budget: Budget | null;
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  partnerCode: string | null;
  theme: 'light' | 'dark';

  // Actions
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchData: () => Promise<void>;
  addTransaction: (amount: number, type: 'expense' | 'income', category: string, memo: string) => Promise<void>;
  generatePartnerCode: () => Promise<void>;
  linkPartner: (code: string) => Promise<void>;
  updateBudgetLimit: (monthly_limit: number) => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
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

export const useBudgetStore = create<BudgetState>((set, get) => ({
  token: null,
  user: null,
  budget: null,
  transactions: [],
  isLoading: true, // Start loading while we init
  error: null,
  partnerCode: null,
  theme: 'light',

  init: async () => {
    try {
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

          set({
            token: session.access_token,
            user: profile,
            transactions,
            budget,
            isLoading: false,
          });
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

      set({
        token: session.access_token,
        user: profile,
        budget,
        transactions,
        isLoading: false,
      });
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

      set({
        token: session.access_token,
        user: profile,
        budget,
        transactions,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Sign up failed', isLoading: false });
      throw err;
    }
  },

  logout: async () => {
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
    const newBalance = type === 'expense' ? currentBalance - amount : currentBalance + amount;
    const optimisticBudget = { ...currentBudget, fluid_balance: newBalance };

    set({ transactions: [optimisticTx, ...currentTransactions], budget: optimisticBudget });

    try {
      const result = await api.createTransaction({ amount, type, category, memo });
      const serverTx = result.transaction;
      const serverBalance = result.fluid_balance;

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
}));
