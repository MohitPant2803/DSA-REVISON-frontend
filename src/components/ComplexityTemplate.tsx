// src/components/ComplexityTemplate.tsx
import React from 'react';
import { View } from 'react-native';
import { RichText } from '@/components/RichText';

export const ComplexityTemplate = ({ headline, body }: any) => (
  <View className="flex-1">
    <RichText text={body || ''} style={{ color: '#475569', fontSize: 16, lineHeight: 24, fontWeight: '500' }} boldStyle={{ color: '#0F172A' }} />
  </View>
);