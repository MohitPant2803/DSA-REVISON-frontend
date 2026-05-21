import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DomainDetailScreen() {
  // This extracts the dynamic [id] from the URL
  const { id } = useLocalSearchParams();

  return (
    <SafeAreaView className="flex-1 bg-[#09090b] items-center justify-center">
      <Text className="text-white text-xl font-bold">Domain Detail</Text>
      <Text className="text-zinc-400 mt-2">Viewing ID: {id}</Text>
    </SafeAreaView>
  );
}
