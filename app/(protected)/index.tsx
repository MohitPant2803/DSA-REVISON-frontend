import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProtectedHome() {
  return (
    <SafeAreaView className="flex-1 bg-[#09090b] items-center justify-center">
      <Text className="text-white text-lg font-bold">Protected Home</Text>
    </SafeAreaView>
  );
}
