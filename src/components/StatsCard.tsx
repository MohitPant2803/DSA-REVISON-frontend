import React from 'react';
import { View, Text, ViewProps } from 'react-native';

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  containerClassName?: string;
}

export function StatsCard({ icon, label, value, containerClassName }: StatsCardProps) {
  return (
    <View className={`bg-white p-5 rounded-3xl border border-slate-100 shadow-sm shadow-slate-200/50 ${containerClassName || ''}`}>
      <View className="flex-row items-center mb-3">
        <View className="bg-slate-50 p-2.5 rounded-2xl mr-3">
          {icon}
        </View>
        <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider">{label}</Text>
      </View>
      <Text className="text-slate-900 text-3xl font-black tracking-tight">{value}</Text>
    </View>
  );
}