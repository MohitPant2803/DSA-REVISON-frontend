import api from '@/services/api';
import type { User } from '@/store/useAuthStore';

export const getMe = async (): Promise<User | null> => {
  try {
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
  } catch {
    return null;
  }
};
