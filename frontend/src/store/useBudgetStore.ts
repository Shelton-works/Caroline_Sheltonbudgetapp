import { create } from 'zustand';
import { api } from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@ourfinances_token';
const USER_KEY = '@ourfinances_user';

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
  login: (email: string) => Promise<void>;
  signUp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchData: () => Promise<void>;
  addTransaction: (amount: number, type: 'expense' | 'income', category: string, memo: string) => Promise<void>;
  generatePartnerCode: () => Promise<void>;
  linkPartner: (code: string) => Promise<void>;
  updateBudgetLimit: (monthly_limit: number) => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
}

const toSimpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const mapEmailToMockToken = (email: string): string => {
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === 'alex@example.com') return 'mock-jwt-token-partner-a';
  if (cleanEmail === 'taylor@example.com') return 'mock-jwt-token-partner-b';
  if (cleanEmail === 'caroline@example.com') return 'mock-jwt-token-unlinked';
  // Dynamic token for any other email - use simple hash instead of btoa
  return `mock-token-${toSimpleHash(cleanEmail)}`;
};

const mapEmailToProfile = (email: string, mockToken: string): Profile => {
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === 'alex@example.com') {
    return {
      id: 'user-a-1111', email: cleanEmail, display_name: 'Alex',
      group_id: 'group-shared-123', expo_push_token: 'ExponentPushToken[mock-partner-a]',
    };
  }
  if (cleanEmail === 'taylor@example.com') {
    return {
      id: 'user-b-2222', email: cleanEmail, display_name: 'Taylor',
      group_id: 'group-shared-123', expo_push_token: 'ExponentPushToken[mock-partner-b]',
    };
  }
  // New/dynamic users
  const name = cleanEmail.split('@')[0];
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    id: mockToken.replace('mock-token-', 'user-'),
    email: cleanEmail,
    display_name: capitalized,
    group_id: 'group-unlinked-456',
    expo_push_token: null,
  };
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
      const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
      if (savedToken) {
        const savedUserStr = await AsyncStorage.getItem(USER_KEY);
        api.setToken(savedToken);

        // Fetch fresh data with timeout
        try {
          const results = await Promise.race([
            Promise.all([
              api.getTransactions(),
              api.getBudget(),
            ]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Request timed out')), 8000)
            ),
          ]);
          const [transactions, budget] = results;
          const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
          set({
            token: savedToken,
            user: savedUser,
            transactions,
            budget,
            isLoading: false,
          });
        } catch (err) {
          // Token expired, invalid, or network error - log out gracefully
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]).catch(() => {});
          api.setToken(null);
          set({ token: null, user: null, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const mockToken = mapEmailToMockToken(email);
      const userObj = mapEmailToProfile(email, mockToken);

      api.setToken(mockToken);

      // Fetch budget data as validation
      const transactions = await api.getTransactions();
      const budget = await api.getBudget();

      // Persist token and user
      await AsyncStorage.setItem(TOKEN_KEY, mockToken);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userObj));

      set({
        token: mockToken,
        user: userObj,
        budget,
        transactions,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  signUp: async (email: string) => {
    return get().login(email);
  },

  logout: async () => {
    api.setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
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
      const transactions = await api.getTransactions();
      const budget = await api.getBudget();
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
          tx.id === optimisticId ? serverTx : tx
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
      const transactions = await api.getTransactions();
      const budget = await api.getBudget();

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
