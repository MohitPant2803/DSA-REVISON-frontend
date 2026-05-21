import api from '@/services/api';

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  profilePicture?: string;
  createdAt: string;
}

export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await api.get('/admin/users');
  return response.data?.data?.users ?? response.data?.users ?? [];
};

export const updateAdminUserRole = async (
  userId: string,
  role: AdminUser['role']
): Promise<AdminUser> => {
  const response = await api.patch(`/admin/users/${userId}/role`, { role });
  return response.data?.data?.user ?? response.data?.user;
};
