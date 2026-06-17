import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { CreateFolderDTO, IFolder } from '@/types/folder';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { SpringPressable } from './SpringPressable';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

const ICON_OPTIONS = ['folder', 'layers', 'graphs', 'dp', 'database', 'book', 'code', 'brain'];

interface FolderFormModalProps {
  visible: boolean;
  folder?: IFolder | null;
  onClose: () => void;
  onSubmit: (data: CreateFolderDTO) => void;
  isLoading?: boolean;
}

export function FolderFormModal({
  visible,
  folder,
  onClose,
  onSubmit,
  isLoading,
}: FolderFormModalProps) {
  const isEdit = !!folder;
  const palette = useThemePalette();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState(palette.accent);

  const [mounted, setMounted] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const translateY = useSharedValue(100);

  const colorOptions = [
    palette.accent,
    palette.success,
    palette.info,
    palette.warning,
    palette.error
  ];

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
    } else if (mounted) {
      opacity.value = withTiming(0, { duration: 250 });
      scale.value = withSpring(0.92, { damping: 15, stiffness: 150 });
      translateY.value = withSpring(100, { damping: 15, stiffness: 150 }, () => {
        runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted]);

  useEffect(() => {
    if (visible) {
      setTitle(folder?.title ?? '');
      setDescription(folder?.description ?? '');
      setIcon(folder?.icon ?? 'folder');
      setColor(folder?.color ?? palette.accent);
    }
  }, [visible, folder, palette.accent]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      icon,
      color,
      visibility: 'public',
    });
  };

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [
        { scale: scale.value },
        { translateY: translateY.value },
      ],
    };
  });

  const buttonTextColor = palette.isDark ? palette.textPrimary : palette.surface;

  return (
    <Modal visible={mounted} transparent onRequestClose={onClose}>
      <Animated.View 
        style={[{ flex: 1, justifyContent: 'flex-end', backgroundColor: palette.overlayBg }, backdropStyle]}
      >
        <Animated.View 
          className="rounded-t-[36px] max-h-[90%] border-t"
          style={[
            {
              backgroundColor: palette.dialogBg,
              borderColor: palette.border,
              shadowColor: palette.shadow,
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: palette.isDark ? 0.20 : 0.08,
              shadowRadius: palette.isDark ? 30 : 24,
              elevation: 10,
            },
            sheetStyle,
          ]}
        >
          {/* Header row */}
          <View className="flex-row justify-between items-center px-6 pt-7 pb-4 border-b" style={{ borderBottomColor: palette.border }}>
            <View>
              <Text className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: palette.textMuted }}>
                {isEdit ? 'Update Collection' : 'New Collection'}
              </Text>
              <Text className="text-xl font-bold tracking-tight" style={{ color: palette.textPrimary }}>
                {isEdit ? 'Edit collection details' : 'Create new collection'}
              </Text>
            </View>
            <SpringPressable 
              onPress={onClose} 
              className="p-2 rounded-full border"
              style={{ backgroundColor: palette.inputBg, borderColor: palette.border }}
            >
              <X color={palette.textSecondary} size={18} strokeWidth={2.5} />
            </SpringPressable>
          </View>

          {/* Form Content */}
          <ScrollView className="px-6 py-5" keyboardShouldPersistTaps="handled">
            <Text className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: palette.textMuted }}>
              Collection Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Arrays & Hashing"
              placeholderTextColor={palette.textMuted}
              className="border rounded-2xl px-4 py-3.5 mb-5 font-semibold text-sm"
              style={{
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
                borderColor: palette.border,
              }}
            />

            <Text className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: palette.textMuted }}>
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional short description of this memory deck"
              placeholderTextColor={palette.textMuted}
              multiline
              className="border rounded-2xl px-4 py-3.5 mb-5 font-semibold text-sm min-h-[90px]"
              style={{
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
                borderColor: palette.border,
              }}
            />

            <Text className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: palette.textMuted }}>
              Collection Icon
            </Text>
            <View className="flex-row flex-wrap gap-2.5 mb-5">
              {ICON_OPTIONS.map((opt) => {
                const isActive = icon === opt;
                return (
                  <SpringPressable
                    key={opt}
                    onPress={() => setIcon(opt)}
                    className="px-4 py-2.5 rounded-full border"
                    style={{
                      borderColor: isActive ? palette.accent : palette.border,
                      backgroundColor: isActive ? addAlpha(palette.accent, 0.08) : palette.surface,
                      shadowColor: palette.accentGlow,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isActive ? 0.05 : 0,
                      shadowRadius: 4,
                    }}
                  >
                    <Text 
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: isActive ? palette.accent : palette.textSecondary }}
                    >
                      {opt}
                    </Text>
                  </SpringPressable>
                );
              })}
            </View>

            <Text className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: palette.textMuted }}>
              Accent Theme
            </Text>
            <View className="flex-row flex-wrap gap-3.5 mb-8">
              {colorOptions.map((c) => (
                <SpringPressable
                  key={c}
                  onPress={() => setColor(c)}
                  className="w-9 h-9 rounded-full justify-center items-center"
                  style={{ 
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: palette.surface,
                    shadowColor: c,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 6,
                  }}
                />
              ))}
            </View>

            <SpringPressable
              onPress={handleSave}
              disabled={isLoading || !title.trim()}
              className="rounded-full py-4 items-center mb-10 disabled:opacity-40"
              style={{
                backgroundColor: palette.accent,
                shadowColor: palette.accentGlow,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 4,
              }}
            >
              {isLoading ? (
                <ActivityIndicator color={buttonTextColor} />
              ) : (
                <Text className="font-extrabold text-sm uppercase tracking-widest" style={{ color: buttonTextColor }}>
                  {isEdit ? 'Save Changes' : 'Create Collection'}
                </Text>
              )}
            </SpringPressable>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

