/**
 * In-memory mock for @react-native-async-storage/async-storage
 * Used by vitest in place of the React Native native module.
 */

const store: Record<string, string> = {};

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return store[key] ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    store[key] = value;
  },
  removeItem: async (key: string): Promise<void> => {
    delete store[key];
  },
  clear: async (): Promise<void> => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
  getAllKeys: async (): Promise<string[]> => {
    return Object.keys(store);
  },
  multiSet: async (pairs: [string, string][]): Promise<void> => {
    pairs.forEach(([key, value]) => {
      store[key] = value;
    });
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map((key) => [key, store[key] ?? null]);
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    keys.forEach((key) => delete store[key]);
  },
};

export default AsyncStorage;
