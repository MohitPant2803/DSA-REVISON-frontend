import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/useAuthStore';

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
    // Get token synchronously from Zustand (which stays in sync with SecureStore)
    return useAuthStore.getState().token;
  },
  clearToken: async (): Promise<void> => {
    await useAuthStore.getState().logout();
  }
};

// 3. Request Interceptor (Inject JWT Token)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await tokenManager.getToken();
    
    if (token) {
      // Safely inject the Authorization header
      config.headers.set('Authorization', `Bearer ${token}`);
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

// 5. Response Interceptor (Handle unwrapping & normalized errors)
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const normalizedError = normalizeError(error);

    if (error.response?.status === 401) {
      const { isAuthenticated, logout } = useAuthStore.getState();
      if (isAuthenticated) {
        await logout();
      }
    }

    return Promise.reject(normalizedError);
  }
);

export default api;