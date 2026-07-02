import { Platform } from 'react-native';

/**
 * Base URL for the backend API.
 *
 * Development defaults:
 * - Android emulator: http://10.0.2.2:8000
 * - iOS simulator / Web: http://localhost:8000
 *
 * Production: Set EXPO_PUBLIC_API_URL at build time, e.g.:
 *   EXPO_PUBLIC_API_URL=https://your-app.onrender.com
 */
const DEV_API_URL = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://localhost:8000',
}) as string;

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEV_API_URL).replace(
  /\/+$/,
  ''
);

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});
    
    headers.set('Content-Type', 'application/json');
    headers.set('X-SECRET-TOKEN', process.env.EXPO_PUBLIC_BACKEND_SECRET || 'my-secure-api-key-123');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const config = {
      ...options,
      headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { ...config, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'An error occurred';
        try {
          const parsed = JSON.parse(errorText);
          errorMsg = parsed.detail || parsed.message || errorMsg;
        } catch {
          errorMsg = errorText || errorMsg;
        }
        throw new Error(errorMsg);
      }

      return await response.json() as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`API Request Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Budget endpoints
  async getBudget(): Promise<{ id: string; name: string; fluid_balance: number; monthly_limit: number; profiles_count?: number }> {
    return this.request('/api/transactions/budget');
  }

  async updateBudget(data: { monthly_limit?: number; fluid_balance?: number }): Promise<any> {
    return this.request('/api/transactions/budget/update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Transactions endpoints
  async getTransactions(): Promise<any[]> {
    return this.request('/api/transactions/');
  }

  async createTransaction(data: { amount: number; type: string; category: string; memo: string }): Promise<any> {
    return this.request('/api/transactions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async registerPushToken(token: string): Promise<any> {
    return this.request('/api/transactions/register-push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // Partner endpoints
  async generatePartnerCode(): Promise<{ code: string }> {
    return this.request('/api/partner/code', {
      method: 'POST',
    });
  }

  async linkPartner(code: string): Promise<{ status: string; group_id: string }> {
    return this.request('/api/partner/link', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }
}

export const api = new ApiClient();
