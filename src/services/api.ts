import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const decodeBase64 = (input: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let output = '';
  
  if (str.length % 4 === 1) {
    return '';
  }
  
  let buffer = 0;
  let bc = 0;
  
  for (let idx = 0; idx < str.length; idx++) {
    const char = str.charAt(idx);
    const pos = chars.indexOf(char);
    if (pos === -1) continue;
    
    buffer = bc % 4 ? (buffer << 6) + pos : pos;
    
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (buffer >> ((-2 * bc) & 6)));
    }
  }
  
  return output;
};

const isTokenExpiringSoon = (token: string | null): boolean => {
  if (!token) return false;
  try {
    const base64Url = token.split('.')[1];
    const decodedBase64 = decodeBase64(base64Url);
    if (!decodedBase64) return false;
    const jsonPayload = decodeURIComponent(
      decodedBase64
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    // Expiring within 5 minutes (300 seconds)
    return decoded.exp - 300 < Date.now() / 1000;
  } catch (e) {
    return false;
  }
};

// 1. Base URL strictly from Expo Environment Variables
const baseURL = process.env.EXPO_PUBLIC_API_URL;

// 2. Create Axios Instance with sane defaults
const api = axios.create({
  baseURL,
  timeout: 30000, // 30 seconds timeout to handle serverless cold starts
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Scalable Token Manager
// Abstracting this allows you to swap out SecureStore (Mobile) for localStorage/Cookies (Web) later without touching the interceptor.
export const tokenManager = {
  getToken: async (): Promise<string | null> => {
    // Dynamic import to prevent circular require cycles
    const { useAuthStore } = require('@/store/useAuthStore');
    return useAuthStore.getState().token;
  },
  clearToken: async (): Promise<void> => {
    const { useAuthStore } = require('@/store/useAuthStore');
    await useAuthStore.getState().logout();
  }
};

// 3. Request Interceptor (Inject JWT Token with Proactive Refresh)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let token = await tokenManager.getToken();
    
    if (token) {
      // Proactive silent refresh if token is expiring within 5 minutes
      if (isTokenExpiringSoon(token)) {
        console.log('[API Interceptor] Token expiring soon. Triggering proactive silent refresh...');
        try {
          const { useAuthStore } = require('@/store/useAuthStore');
          const success = await useAuthStore.getState().silentTokenRefresh();
          if (success) {
            token = await tokenManager.getToken(); // Retrieve refreshed token
          }
        } catch (err) {
          console.warn('[API Interceptor] Proactive silent refresh crashed:', err);
        }
      }

      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// 4. Normalized Error Structure
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  data?: any;
}

const normalizeError = (error: any): ApiError => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.message || error.message || 'An unexpected API error occurred',
      status: error.response?.status,
      code: error.code,
      data: error.response?.data,
    };
  }
  return {
    message: error instanceof Error ? error.message : 'An unknown error occurred',
  };
};

// 5. Response Interceptor (Handle unwrapping & soft session expiry)
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const normalizedError = normalizeError(error);

    if (error.response?.status === 401) {
      const { useAuthStore } = require('@/store/useAuthStore');
      const { isAuthenticated, setSessionExpired } = useAuthStore.getState();
      if (isAuthenticated) {
        console.log('[API Response Interceptor] 401 Unauthorized detected. Transitioning to soft-session-expired...');
        setSessionExpired(true);
      }
    }

    return Promise.reject(normalizedError);
  }
);

export default api;