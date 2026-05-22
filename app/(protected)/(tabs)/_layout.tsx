import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Layers, Bookmark } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';

function TabLayoutInner() {
  useAppBackHandler();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10) + 6;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '400',
          marginTop: -1,
          marginBottom: 2,
          letterSpacing: 0.2,
        },
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          position: 'absolute',
          bottom: dockBottom,
          left: 28,
          right: 28,
          height: 52,
          borderRadius: 26,
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          borderWidth: 1,
          borderColor: 'rgba(241, 245, 249, 0.9)',
          paddingTop: 4,
          paddingBottom: 4,
          elevation: 0,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.03,
          shadowRadius: 20,
        },
      }}
    >
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home color={color} size={19} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarIcon: ({ color }) => <Layers color={color} size={19} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="personal"
        options={{
          title: 'My Space',
          tabBarIcon: ({ color }) => <Bookmark color={color} size={19} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="CreateRevisionScreen" options={{ href: null }} />
      <Tabs.Screen name="RevisionForm" options={{ href: null }} />
      <Tabs.Screen name="RevisionCard" options={{ href: null }} />
      <Tabs.Screen name="SlideStudio" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabLayoutInner />;
}
