import { create } from 'zustand';
import { api } from '../lib/api';

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
  login: (email: string) => Promise<void>;
  signUp: (email: string) => Promise<void>;
  logout: () => void;
  fetchData: () => Promise<void>;
  addTransaction: (amount: number, type: 'expense' | 'income', category: string, memo: string) => Promise<void>;
  generatePartnerCode: () => Promise<void>;
  linkPartner: (code: string) => Promise<void>;
  updateBudgetLimit: (monthly_limit: number) => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  token: null,
  user: null,
  budget: null,
  transactions: [],
  isLoading: false,
  error: null,
  partnerCode: null,
  theme: 'light',

  login: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      // Map mock users
      let mockToken = 'mock-jwt-token-unlinked';
      const cleanEmail = email.toLowerCase().trim();
      
      if (cleanEmail === 'alex@example.com') {
        mockToken = 'mock-jwt-token-partner-a';
      } else if (cleanEmail === 'taylor@example.com') {
        mockToken = 'mock-jwt-token-partner-b';
      } else if (cleanEmail === 'caroline@example.com') {
        mockToken = 'mock-jwt-token-unlinked';
      } else {
        // Dynamic user for others
        mockToken = `mock-token-${cleanEmail}`;
      }

      api.setToken(mockToken);
      
      // Fetch budget data as validation
      const transactions = await api.getTransactions();
      const budget = await api.getBudget();
      
      // In mock, get current profile details (using Caroline as base for new users)
      let userObj: Profile = {
        id: 'user-c-3333',
        email: email,
        display_name: email.split('@')[0],
        group_id: 'group-unlinked-456',
        expo_push_token: null
      };

      if (cleanEmail === 'alex@example.com') {
        userObj = {
          id: 'user-a-1111',
          email: 'alex@example.com',
          display_name: 'Alex',
          group_id: 'group-shared-123',
          expo_push_token: 'ExponentPushToken[mock-partner-a]'
        };
      } else if (cleanEmail === 'taylor@example.com') {
        userObj = {
          id: 'user-b-2222',
          email: 'taylor@example.com',
          display_name: 'Taylor',
          group_id: 'group-shared-123',
          expo_push_token: 'ExponentPushToken[mock-partner-b]'
        };
      }

      set({
        token: mockToken,
        user: userObj,
        budget: budget,
        transactions: transactions,
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  signUp: async (email: string) => {
    // Simply proxy to login for mock purposes
    return get().login(email);
  },

  logout: () => {
    api.setToken(null);
    set({
      token: null,
      user: null,
      budget: null,
      transactions: [],
      partnerCode: null
    });
  },

  fetchData: async () => {
    if (!get().token) return;
    set({ isLoading: true, error: null });
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

    // 1. Prepare optimistic transaction
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

    // Calculate optimistic budget balance
    const currentBalance = Number(currentBudget.fluid_balance);
    const newBalance = type === 'expense' ? currentBalance - amount : currentBalance + amount;
    const optimisticBudget = {
      ...currentBudget,
      fluid_balance: newBalance,
    };

    // 2. Perform optimistic update in state
    set({
      transactions: [optimisticTx, ...currentTransactions],
      budget: optimisticBudget,
    });

    try {
      // 3. Dispatch to API
      const result = await api.createTransaction({ amount, type, category, memo });
      
      // 4. Update state with actual server response
      const serverTx = result.transaction;
      const serverBalance = result.fluid_balance;

      set((state) => ({
        transactions: state.transactions.map((tx) => 
          tx.id === optimisticId ? serverTx : tx
        ),
        budget: state.budget ? { ...state.budget, fluid_balance: serverBalance } : null
      }));
    } catch (err: any) {
      // 5. Rollback state on failure
      set({
        transactions: currentTransactions,
        budget: currentBudget,
        error: `Failed to save transaction: ${err.message}. UI rolled back.`,
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
      // Refresh the budget and transaction records after linking
      api.setToken(get().token);
      
      // Refresh state
      const transactions = await api.getTransactions();
      const budget = await api.getBudget();
      
      set((state) => ({
        user: state.user ? { ...state.user, group_id: res.group_id } : null,
        budget: budget,
        transactions: transactions,
        partnerCode: null,
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'Linking failed', isLoading: false });
      throw err;
    }
  },

  updateBudgetLimit: async (monthly_limit: number) => {
    const currentBudget = get().budget;
    if (!currentBudget) return;

    set({
      budget: { ...currentBudget, monthly_limit }
    });

    try {
      await api.updateBudget({ monthly_limit });
    } catch (err: any) {
      set({
        budget: currentBudget,
        error: `Failed to update limit: ${err.message}`
      });
    }
  },

  setTheme: (theme: 'light' | 'dark') => {
    set({ theme });
  }
}));
