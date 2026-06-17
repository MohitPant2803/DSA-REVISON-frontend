import React from 'react';
import { View, Text } from 'react-native';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  containerClassName?: string;
}

export function StatsCard({ icon, label, value, containerClassName }: StatsCardProps) {
  const palette = useThemePalette();

  return (
    <View 
      className={`p-6 rounded-[30px] border ${containerClassName || ''}`}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: palette.isDark ? 0.15 : 0.03,
        shadowRadius: 18,
        elevation: 2,
      }}
    >
      <View className="flex-row items-center mb-3">
        <View 
          className="p-2.5 rounded-2xl mr-3 border"
          style={{ 
            backgroundColor: addAlpha(palette.accent, 0.08),
            borderColor: addAlpha(palette.accent, 0.12)
          }}
        >
          {icon}
        </View>
        <Text 
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: palette.textMuted }}
        >
          {label}
        </Text>
      </View>
      <Text 
        className="text-[26px] font-bold tracking-tight leading-none"
        style={{ color: palette.textPrimary }}
      >
        {value}
      </Text>
    </View>
  );
}