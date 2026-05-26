import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  Platform,
  Vibration,
  BackHandler,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useUIStore } from '@/store/useUIStore';

const triggerLightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

export const ExitConfirmationModal = React.memo(() => {
  const isExitPromptOpen = useUIStore((state) => state.isExitPromptOpen);
  const setExitPromptOpen = useUIStore((state) => state.setExitPromptOpen);

  if (!isExitPromptOpen) return null;

  const handleStay = () => {
    triggerLightHaptic();
    setExitPromptOpen(false);
  };

  const handleLeave = () => {
    triggerLightHaptic();
    setExitPromptOpen(false);
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  };

  return (
    <Modal
      visible={isExitPromptOpen}
      transparent
      animationType="fade"
      onRequestClose={handleStay}
    >
      <Pressable 
        className="flex-1 bg-black/40 justify-center items-center px-6" 
        onPress={handleStay}
      >
        <View 
          className="bg-[#FAF9F7] w-full max-w-[320px] rounded-[32px] p-6 border"
          style={{
            borderColor: 'rgba(148, 163, 184, 0.15)',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.08,
            shadowRadius: 24,
            elevation: 5,
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Top aesthetic warning logout icon */}
          <View className="items-center mb-5">
            <View 
              className="w-14 h-14 rounded-[22px] items-center justify-center bg-[#F5F3FF] border"
              style={{ borderColor: 'rgba(139, 92, 246, 0.08)' }}
            >
              <LogOut color="#8B5CF6" size={24} strokeWidth={2.0} />
            </View>
          </View>

          {/* Heading */}
          <Text className="text-[#0B1327] text-lg font-black tracking-tight text-center mb-2 leading-tight">
            Exit ReeWise?
          </Text>

          {/* Subheading */}
          <Text className="text-[#7F8A9E] text-[13px] font-semibold text-center leading-relaxed mb-6 px-3">
            Are you sure you want to close the app? Your progress is synchronized and ready for your return.
          </Text>

          {/* Action CTAs */}
          <View className="gap-2.5 w-full">
            {/* Primary CTA: Stay */}
            <TouchableOpacity
              onPress={handleStay}
              activeOpacity={0.85}
              className="w-full py-3.5 rounded-2xl items-center justify-center bg-[#8B5CF6]"
              style={{
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Text className="text-white font-bold text-sm">Stay and Revise</Text>
            </TouchableOpacity>

            {/* Secondary CTA: Leave */}
            <TouchableOpacity
              onPress={handleLeave}
              activeOpacity={0.8}
              className="w-full py-3.5 rounded-2xl items-center justify-center border bg-white"
              style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}
            >
              <Text className="text-[#E11D48] font-bold text-sm">Exit App</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
});
