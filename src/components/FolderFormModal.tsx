import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import type { CreateFolderDTO, IFolder } from '@/types/folder';

const ICON_OPTIONS = ['folder', 'layers', 'graphs', 'dp', 'database', 'book', 'code', 'brain'];
const COLOR_OPTIONS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];

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
  const [color, setColor] = useState('#7c3aed');

  useEffect(() => {
    if (visible) {
      setTitle(folder?.title ?? '');
      setDescription(folder?.description ?? '');
      setIcon(folder?.icon ?? 'folder');
      setColor(folder?.color ?? '#7c3aed');
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/30">
        <View className="bg-white rounded-t-[32px] max-h-[90%]">
          <View className="flex-row justify-between items-center px-6 pt-6 pb-4 border-b border-slate-100">
            <Text className="text-slate-900 text-xl font-semibold">
              {isEdit ? 'Edit folder' : 'New folder'}
            </Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <X color="#64748b" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-6 py-4" keyboardShouldPersistTaps="handled">
            <Text className="text-slate-500 text-sm font-medium mb-2">Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Arrays & Hashing"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 mb-4"
            />

            <Text className="text-slate-500 text-sm font-medium mb-2">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional short description"
              multiline
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 mb-4 min-h-[80px]"
            />

            <Text className="text-slate-500 text-sm font-medium mb-2">Icon</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {ICON_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setIcon(opt)}
                  className={`px-3 py-2 rounded-lg border ${
                    icon === opt ? 'border-violet-500 bg-violet-50' : 'border-slate-200'
                  }`}
                >
                  <Text className="text-slate-700 text-xs font-medium">{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-slate-500 text-sm font-medium mb-2">Accent color</Text>
            <View className="flex-row flex-wrap gap-3 mb-6">
              {COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  className={`w-10 h-10 rounded-full ${color === c ? 'border-2 border-slate-900' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={isLoading || !title.trim()}
              className="bg-violet-600 rounded-full py-4 items-center mb-8 disabled:opacity-50"
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {isEdit ? 'Save changes' : 'Create folder'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
