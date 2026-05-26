import api from '@/services/api';
import type { User } from '@/store/useAuthStore';

export const getMe = async (): Promise<User | null> => {
  // Do not wrap in try-catch to swallow errors! 
  // We want Network Errors / 500s to throw so restoreSession can fallback to offline mode.
  // Returning null here incorrectly tells restoreSession that the user is definitively gone.
  const response = await api.get('/auth/me');
  const raw = response.data?.data?.user ?? response.data?.user;
  if (!raw) return null;
  return {
    id: String(raw._id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    avatarUrl: raw.profilePicture ?? raw.avatarUrl,
    role: raw.role ?? 'user',
  };
};
