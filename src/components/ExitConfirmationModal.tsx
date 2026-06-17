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
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

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
  const palette = useThemePalette();

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

  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <Modal
      visible={isExitPromptOpen}
      transparent
      animationType="fade"
      onRequestClose={handleStay}
    >
      <Pressable 
        className="flex-1 justify-center items-center px-6" 
        style={{ backgroundColor: palette.overlayBg }}
        onPress={handleStay}
      >
        <View 
          className="w-full max-w-[320px] rounded-[32px] p-6 border"
          style={{
            backgroundColor: palette.dialogBg,
            borderColor: palette.border,
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: palette.isDark ? 10 : 4 },
            shadowOpacity: palette.isDark ? 0.20 : 0.04,
            shadowRadius: palette.isDark ? 30 : 16,
            elevation: 5,
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Top aesthetic warning logout icon */}
          <View className="items-center mb-5">
            <View 
              className="w-14 h-14 rounded-[22px] items-center justify-center border"
              style={{ 
                backgroundColor: addAlpha(palette.accent, 0.08),
                borderColor: addAlpha(palette.accent, 0.15) 
              }}
            >
              <LogOut color={palette.accent} size={24} strokeWidth={2.0} />
            </View>
          </View>

          {/* Heading */}
          <Text 
            className="text-lg font-semibold tracking-tight text-center mb-2 leading-tight"
            style={{ color: palette.textPrimary }}
          >
            Exit ReeWise?
          </Text>

          {/* Subheading */}
          <Text 
            className="text-[13px] text-center leading-relaxed mb-6 px-3"
            style={{ color: palette.textSecondary }}
          >
            Are you sure you want to close the app? Your progress is synchronized and ready for your return.
          </Text>

          {/* Action CTAs */}
          <View className="gap-2.5 w-full">
            {/* Primary CTA: Stay */}
            <TouchableOpacity
              onPress={handleStay}
              activeOpacity={0.85}
              className="w-full py-3.5 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: palette.accent,
                shadowColor: palette.accentGlow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <Text className="font-bold text-sm" style={{ color: buttonTextColor }}>Stay and Revise</Text>
            </TouchableOpacity>

            {/* Secondary CTA: Leave */}
            <TouchableOpacity
              onPress={handleLeave}
              activeOpacity={0.8}
              className="w-full py-3.5 rounded-2xl items-center justify-center border"
              style={{ 
                backgroundColor: palette.inputBg,
                borderColor: palette.border 
              }}
            >
              <Text className="font-bold text-sm" style={{ color: palette.error }}>Exit App</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
});

