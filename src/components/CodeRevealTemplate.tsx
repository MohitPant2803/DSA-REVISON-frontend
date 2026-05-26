// src/components/CodeRevealTemplate.tsx
import React from 'react';
import { View } from 'react-native';
import { RichText } from '@/components/RichText';

export const CodeRevealTemplate = ({ headline, body, code }: any) => (
  <View className="flex-1">
    <RichText text={body || ''} style={{ color: '#475569', fontSize: 16, lineHeight: 24, fontWeight: '500' }} boldStyle={{ color: '#0F172A' }} />
  </View>
);