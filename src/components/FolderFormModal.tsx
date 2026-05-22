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

const ICON_OPTIONS = ['folder', 'layers', 'graphs', 'dp', 'database', 'book', 'code', 'brain'];
const COLOR_OPTIONS = ['#7C3AED', '#3B82F6', '#10B981', '#F97316', '#EC4899', '#6366F1'];

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#7C3AED');

  const [mounted, setMounted] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const translateY = useSharedValue(100);

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
      setColor(folder?.color ?? '#7C3AED');
    }
  }, [visible, folder]);

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

  return (
    <Modal visible={mounted} transparent onRequestClose={onClose}>
      <Animated.View 
        style={[{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.35)' }, backdropStyle]}
      >
        <Animated.View 
          className="bg-white rounded-t-[36px] max-h-[90%] shadow-2xl"
          style={[
            {
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: -12 },
              shadowOpacity: 0.08,
              shadowRadius: 24,
              elevation: 10,
            },
            sheetStyle,
          ]}
        >
          {/* Header row */}
          <View className="flex-row justify-between items-center px-6 pt-7 pb-4 border-b border-slate-50">
            <View>
              <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-0.5">
                {isEdit ? 'Update Collection' : 'New Collection'}
              </Text>
              <Text className="text-slate-900 text-xl font-black tracking-tight">
                {isEdit ? 'Edit collection details' : 'Create new collection'}
              </Text>
            </View>
            <SpringPressable 
              onPress={onClose} 
              className="p-2 bg-slate-50 rounded-full border border-slate-100"
            >
              <X color="#64748B" size={18} strokeWidth={2.5} />
            </SpringPressable>
          </View>

          {/* Form Content */}
          <ScrollView className="px-6 py-5" keyboardShouldPersistTaps="handled">
            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
              Collection Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Arrays & Hashing"
              placeholderTextColor="#94A3B8"
              className="border border-slate-100 rounded-2xl px-4 py-3.5 text-slate-900 mb-5 font-semibold text-sm shadow-inner"
              style={{
                backgroundColor: 'rgba(248, 250, 252, 0.7)',
              }}
            />

            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional short description of this memory deck"
              placeholderTextColor="#94A3B8"
              multiline
              className="border border-slate-100 rounded-2xl px-4 py-3.5 text-slate-900 mb-5 font-semibold text-sm min-h-[90px] shadow-inner"
              style={{
                backgroundColor: 'rgba(248, 250, 252, 0.7)',
              }}
            />

            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
              Collection Icon
            </Text>
            <View className="flex-row flex-wrap gap-2.5 mb-5">
              {ICON_OPTIONS.map((opt) => (
                <SpringPressable
                  key={opt}
                  onPress={() => setIcon(opt)}
                  className={`px-4 py-2.5 rounded-full border shadow-sm ${
                    icon === opt 
                      ? 'border-violet-500 bg-violet-50' 
                      : 'border-slate-100 bg-white/80'
                  }`}
                  style={{
                    shadowColor: '#8B5CF6',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: icon === opt ? 0.05 : 0,
                    shadowRadius: 4,
                  }}
                >
                  <Text className={`text-xs font-black uppercase tracking-wider ${
                    icon === opt ? 'text-violet-600' : 'text-slate-500'
                  }`}>
                    {opt}
                  </Text>
                </SpringPressable>
              ))}
            </View>

            <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
              Accent Theme
            </Text>
            <View className="flex-row flex-wrap gap-3.5 mb-8">
              {COLOR_OPTIONS.map((c) => (
                <SpringPressable
                  key={c}
                  onPress={() => setColor(c)}
                  className="w-9 h-9 rounded-full justify-center items-center shadow-sm"
                  style={{ 
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: '#ffffff',
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
              className="rounded-full py-4 items-center mb-10 disabled:opacity-40 shadow-lg"
              style={{
                backgroundColor: '#7C3AED',
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 4,
              }}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-extrabold text-sm uppercase tracking-widest">
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
