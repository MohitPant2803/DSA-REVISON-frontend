import { useAuthStore } from '../store/useAuthStore';

const SUPERADMIN_EMAIL =
  process.env.EXPO_PUBLIC_SUPERADMIN_EMAIL ?? 'mohit.pant@1828@gmail.com';

export const useRole = () => {
  const { user } = useAuthStore();

  // Frontend override: if the user's email matches the env var, treat as superadmin
  const isSuperAdminOverride =
    !!SUPERADMIN_EMAIL && !!user?.email && user.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

  const role = isSuperAdminOverride ? 'superadmin' : (user?.role || 'user');

  return {
    role,
    isUser: role === 'user',
    isAdmin: role === 'admin',
    isSuperAdmin: role === 'superadmin',
    canManageContent: role === 'admin' || role === 'superadmin',
    canManageUsers: role === 'superadmin',
  };
};
