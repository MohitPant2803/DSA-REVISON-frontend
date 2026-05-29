import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import {
  useCreateRevisionCard,
  useUpdateRevisionCard,
  useGetRevisionCard,
} from '@/hooks/useRevisionCards';
import { useGetFolders } from '@/hooks/useFolders';
import { DifficultyLevels, ComplexityLevels } from '@/types/revision';
import RevisionForm from './RevisionForm';
import { useAppBackHandler } from '@/hooks/useAppBackHandler';
import { normalizeParam } from '@/utils/routeParams';

const cardFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  topic: z.string().min(2, 'Topic is required.'),
  explanation: z.string().min(10, 'Explanation must be at least 10 characters.'),
  code: z.string().optional(),
  image: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  tags: z.string().optional(),
  examples: z.string().optional(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  complexity: z.string().optional(),
  folderId: z.string().min(1, 'Select a folder'),
});

export type CardFormData = z.infer<typeof cardFormSchema>;

export default function CreateRevisionScreen() {
  useAppBackHandler();
  const router = useRouter();
  const params = useLocalSearchParams<{
    cardId?: string;
    folderId?: string;
  }>();
  const cardId = normalizeParam(params.cardId);
  const defaultFolderId = normalizeParam(params.folderId);

  const { data: cardToEdit, isLoading: loadingCard } = useGetRevisionCard(cardId);
  const { data: foldersData } = useGetFolders({ limit: 100 });
  const folders = foldersData?.results ?? [];
  const isEditMode = !!cardId && !!cardToEdit;

  const resolvedFolderId =
    (typeof cardToEdit?.folderId === 'object' && cardToEdit.folderId !== null
      ? cardToEdit.folderId._id
      : cardToEdit?.folderId) ||
    defaultFolderId ||
    folders[0]?._id ||
    '';

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<CardFormData>({
    resolver: zodResolver(cardFormSchema),
    defaultValues: {
      title: '',
      topic: '',
      explanation: '',
      code: '',
      image: '',
      tags: '',
      examples: '',
      difficulty: 'Easy',
      folderId: resolvedFolderId,
    },
  });

  React.useEffect(() => {
    if (cardToEdit) {
      reset({
        title: cardToEdit.title,
        topic: cardToEdit.topic,
        explanation: cardToEdit.explanation,
        code: cardToEdit.code ?? '',
        image: cardToEdit.image ?? '',
        tags: cardToEdit.tags?.join(', ') || '',
        examples: cardToEdit.examples?.join('\n') || '',
        difficulty: cardToEdit.difficulty,
        complexity: cardToEdit.complexity,
        folderId:
          typeof cardToEdit.folderId === 'object' && cardToEdit.folderId !== null
            ? cardToEdit.folderId._id
            : String(cardToEdit.folderId || ''),
      });
    } else if (resolvedFolderId) {
      reset((prev) => ({ ...prev, folderId: resolvedFolderId }));
    }
  }, [cardToEdit, resolvedFolderId, reset]);

  const createMutation = useCreateRevisionCard();
  const updateMutation = useUpdateRevisionCard();

  const parseList = (raw?: string) =>
    raw
      ? raw
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const onSubmit = (data: CardFormData) => {
    // Safely compile backend compatible payload
    const submissionData = {
      title: data.title,
      topic: data.topic,
      explanation: data.explanation || data.title, // safe fallback for backend validation schema
      code: data.code || undefined, // safe fallback
      image: data.image || undefined,
      tags: parseList(data.tags),
      examples: parseList(data.examples),
      difficulty: data.difficulty,
      complexity: data.complexity,
      folderId: data.folderId,
      // Automatically generate a single-slide structure for backwards compatibility
      slides: [
        {
          type: 'intro',
          headline: data.title,
          body: data.explanation || data.title,
          code: data.code || '',
          blocks: []
        }
      ]
    };

    const onDone = () => {
      Toast.show({ type: 'success', text1: isEditMode ? 'Card updated successfully' : 'Card created successfully' });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(protected)/(tabs)/learn');
      }
    };

    if (isEditMode && cardToEdit) {
      updateMutation.mutate(
        { cardId: cardToEdit._id, updateData: submissionData },
        { onSuccess: onDone, onError: (e) => Toast.show({ type: 'error', text1: e.message }) }
      );
    } else {
      createMutation.mutate(submissionData, {
        onSuccess: onDone,
        onError: (e) => Toast.show({ type: 'error', text1: e.message }),
      });
    }
  };

  const isLoading =
    createMutation.isPending || updateMutation.isPending || isSubmitting || loadingCard;

  if (cardId && loadingCard) {
    return (
      <View className="flex-1 bg-[#0c0c0e] justify-center items-center">
        <ActivityIndicator color="#a78bfa" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#0c0c0e]"
    >
      <ScrollView
        className="p-5 animate-fade-in"
        contentContainerStyle={{ paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-zinc-100 text-2xl font-black mb-6 pt-12">
          {isEditMode ? 'Edit card details' : 'New revision deck'}
        </Text>
        
        {/* Core Metadata */}
        <RevisionForm control={control} errors={errors} folders={folders} />

        {/* Save/Submit Action */}
        <TouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading || folders.length === 0}
          className="bg-violet-600 py-4 rounded-2xl items-center mt-6 disabled:opacity-50 shadow-md shadow-violet-800/20"
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-base">
              {isEditMode ? 'Save changes & compile deck' : 'Create revision card deck'}
            </Text>
          )}
        </TouchableOpacity>

        {folders.length === 0 && (
          <Text className="text-amber-400/90 text-center mt-4 text-xs font-semibold">
            Create a folder in Learn before adding cards.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
