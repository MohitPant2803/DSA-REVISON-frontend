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
    <View 
      className={`bg-white p-6 rounded-[30px] border ${containerClassName || ''}`}
      style={{
        borderColor: 'rgba(148,163,184,0.08)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.03,
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View className="flex-row items-center mb-3">
        <View 
          className="p-2.5 rounded-2xl mr-3 border bg-[#F5F3FF]/40"
          style={{ borderColor: 'rgba(139, 92, 246, 0.04)' }}
        >
          {icon}
        </View>
        <Text className="text-[#64748B] text-[10px] font-bold uppercase tracking-wider">{label}</Text>
      </View>
      <Text className="text-[#0F172A] text-[26px] font-bold tracking-tight leading-none">{value}</Text>
    </View>
  );
}