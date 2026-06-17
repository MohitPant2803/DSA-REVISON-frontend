import React from 'react';
import { View } from 'react-native';
import { useThemePalette } from '@/hooks/useThemePalette';

export function AppSkeleton() {
  const palette = useThemePalette();
  return <View style={{ flex: 1, backgroundColor: palette.background }} />;
}
