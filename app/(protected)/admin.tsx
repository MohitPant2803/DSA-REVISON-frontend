import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminUsers, updateAdminUserRole, AdminUser } from '@/services/adminService';
import api from '@/services/api';
import { useRole } from '@/hooks/useRole';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

export default function AdminScreen() {
  useAppBackHandler();
  const router = useRouter();
  const { canManageUsers } = useRole();
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getAdminUsers,
    enabled: canManageUsers,
  });

  const { data: analytics } = useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      const res = await api.get('/admin/analytics');
      return res.data?.data?.analytics ?? res.data?.analytics;
    },
    enabled: canManageUsers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminUser['role'] }) =>
      updateAdminUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminUsers'] }),
  });

  if (!canManageUsers) {
    return (
      <SafeAreaView className="flex-1 bg-[#F5F5F7] items-center justify-center p-8">
        <Text className="text-slate-600 text-center">Superadmin access required.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-violet-600 font-semibold">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const cycleRole = (user: AdminUser) => {
    const order: AdminUser['role'][] = ['user', 'admin', 'superadmin'];
    const next = order[(order.indexOf(user.role) + 1) % order.length];
    Alert.alert('Change role', `Set ${user.name} to ${next}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => roleMutation.mutate({ id: user._id, role: next }) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F7]" edges={['top']}>
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2">
          <ChevronLeft size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-xl font-bold">Moderation</Text>
      </View>

      <ScrollView className="px-6 pb-12">
        {analytics && (
          <View className="bg-white rounded-2xl p-5 mb-6 border border-slate-100">
            <Text className="text-slate-500 text-xs uppercase tracking-widest mb-3">Overview</Text>
            <Text className="text-slate-800">Folders: {analytics.folderCount}</Text>
            <Text className="text-slate-800">Cards: {analytics.cardCount}</Text>
            <Text className="text-slate-800">Revisions today: {analytics.revisionsToday}</Text>
          </View>
        )}

        <Text className="text-slate-800 font-bold text-lg mb-3">Users</Text>
        {isLoading ? (
          <ActivityIndicator color="#7c3aed" />
        ) : (
          users?.map((u) => (
            <TouchableOpacity
              key={u._id}
              onPress={() => cycleRole(u)}
              className="bg-white rounded-2xl p-4 mb-2 border border-slate-100"
            >
              <Text className="text-slate-900 font-semibold">{u.name}</Text>
              <Text className="text-slate-500 text-sm">{u.email}</Text>
              <Text className="text-violet-600 text-xs font-bold mt-1 uppercase">{u.role}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
