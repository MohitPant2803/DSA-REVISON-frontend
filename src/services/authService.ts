import api from '@/services/api';
import type { User } from '@/store/useAuthStore';

export const getMe = async (deviceId?: string, clockEpoch?: string): Promise<User | null> => {
  // Do not wrap in try-catch to swallow errors! 
  // We want Network Errors / 500s to throw so restoreSession can fallback to offline mode.
  // Returning null here incorrectly tells restoreSession that the user is definitively gone.
  const params = deviceId ? { deviceId, clockEpoch } : undefined;
  const response = await api.get('/auth/me', { params });
  const raw = response.data?.data?.user ?? response.data?.user;
  if (!raw) return null;
  return {
    id: String(raw._id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    avatarUrl: raw.profilePicture ?? raw.avatarUrl,
    role: raw.role ?? 'user',
    totalSwipes: typeof raw.totalSwipes === 'number' ? raw.totalSwipes : 0,
    totalScrolls: typeof raw.totalScrolls === 'number' ? raw.totalScrolls : 0,
    streakCount: typeof raw.streakCount === 'number' ? raw.streakCount : 0,
    maxStreakCount: typeof raw.maxStreakCount === 'number' ? raw.maxStreakCount : 0,
    lastCompletedDate: raw.lastCompletedDate ? String(raw.lastCompletedDate) : undefined,
  };
};

export const deleteAccount = async (): Promise<void> => {
  await api.delete('/auth/delete-account');
};
