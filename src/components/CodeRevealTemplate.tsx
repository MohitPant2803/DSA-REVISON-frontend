// src/components/CodeRevealTemplate.tsx
import React from 'react';
import { View, Text } from 'react-native';

export const CodeRevealTemplate = ({ headline, body, code }: any) => (
  <View className="flex-1">
    <Text className="text-slate-600 text-base leading-relaxed font-medium">{body}</Text>
  </View>
);