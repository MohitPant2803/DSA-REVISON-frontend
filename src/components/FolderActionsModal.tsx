import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  Platform,
  Vibration,
} from 'react-native';
import {
  Pin,
  X,
  Folder,
} from 'lucide-react-native';
import type { IFolder } from '@/types/folder';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

const triggerLightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

interface FolderActionsModalProps {
  visible: boolean;
  folder: IFolder | null;
  isPinned: boolean;
  canModify: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function FolderActionsModal({
  visible,
  folder,
  isPinned,
  onClose,
  onTogglePin,
}: FolderActionsModalProps) {
  const palette = useThemePalette();

  if (!visible || !folder) return null;

  const handleClose = () => {
    triggerLightHaptic();
    onClose();
  };

  const handleTogglePinPress = () => {
    triggerLightHaptic();
    onTogglePin();
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
    >
      <Pressable
        className="flex-1 justify-center items-center px-6"
        onPress={handleClose}
        style={{ backgroundColor: palette.overlayBg }}
      >
        <View
          className="w-full max-w-[320px] rounded-[32px] p-6 border relative overflow-hidden"
          style={{
            backgroundColor: palette.dialogBg,
            borderColor: palette.border,
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: palette.isDark ? 0.25 : 0.05,
            shadowRadius: 24,
            elevation: 6,
          }}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Top-Right Red Cross Close Button */}
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.7}
            style={{
              position: 'absolute',
              right: 20,
              top: 20,
              zIndex: 10,
            }}
          >
            <X color={palette.error} size={20} strokeWidth={2.5} />
          </TouchableOpacity>

          {/* Folder Details Header */}
          <View className="items-center mb-5 mt-6">
            <View
              className="w-12 h-12 rounded-[20px] items-center justify-center border mb-3"
              style={{
                backgroundColor: addAlpha(folder.color || palette.accent, 0.08),
                borderColor: addAlpha(folder.color || palette.accent, 0.15),
              }}
            >
              <Folder color={folder.color || palette.accent} size={20} strokeWidth={2.0} />
            </View>
            <Text
              className="text-base font-bold text-center tracking-tight px-2"
              style={{ color: palette.textPrimary }}
              numberOfLines={1}
            >
              {folder.title}
            </Text>
            {folder.description ? (
              <Text
                className="text-[11px] text-center mt-1 px-4 leading-relaxed"
                style={{ color: palette.textSecondary }}
                numberOfLines={2}
              >
                {folder.description}
              </Text>
            ) : null}
          </View>

          {/* Single CTA: Pin / Unpin Button */}
          <TouchableOpacity
            onPress={handleTogglePinPress}
            activeOpacity={0.8}
            className="w-full h-[74px] rounded-full flex-row items-center justify-center border"
            style={{
              backgroundColor: palette.accent,
              borderColor: palette.border,
            }}
          >
            <View style={[{ marginRight: 8 }, isPinned ? { transform: [{ rotate: '45deg' }] } : {}]}>
              <Pin
                color={palette.isDark ? palette.textPrimary : palette.surface}
                size={18}
                strokeWidth={2.2}
              />
            </View>
            <Text
              className="font-bold text-[15px]"
              style={{ color: palette.isDark ? palette.textPrimary : palette.surface }}
            >
              {isPinned ? 'Unpin Folder' : 'Pin Folder'}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}
