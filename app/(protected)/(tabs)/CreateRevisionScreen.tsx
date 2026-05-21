import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { styled } from 'nativewind';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Toast from 'react-native-toast-message';

import { useCreateRevisionCard, useUpdateRevisionCard, IPopulatedRevisionCard } from './useRevisionCards';
import { DifficultyLevels } from '../../../src/types/revision';
import RevisionForm from '../components/forms/RevisionForm';

// Styled components
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledScrollView = styled(ScrollView);
const StyledTouchableOpacity = styled(TouchableOpacity);

// --- Navigation Types ---
// Adjust this to your actual navigation setup (e.g., RootStackParamList)
type AppStackParamList = {
  CreateRevision: { card?: IPopulatedRevisionCard };
  Reels: undefined; // Assuming Reels screen exists
  // ... other screens
};
type CreateRevisionScreenRouteProp = RouteProp<AppStackParamList, 'CreateRevision'>;
type CreateRevisionScreenNavigationProp = StackNavigationProp<AppStackParamList, 'CreateRevision'>;

// --- Zod Schema for Form Validation ---
const cardFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  topic: z.string().min(2, 'Topic is required.'),
  explanation: z.string().min(10, 'Explanation must be at least 10 characters.'),
  code: z.string().optional(),
  image: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  tags: z.string().optional(), // Handled as a comma-separated string in the UI
  difficulty: z.enum(DifficultyLevels),
});

export type CardFormData = z.infer<typeof cardFormSchema>;

// --- Main Screen Component ---
const CreateRevisionScreen = () => {
  const navigation = useNavigation<CreateRevisionScreenNavigationProp>();
  const route = useRoute<CreateRevisionScreenRouteProp>();

  const cardToEdit = route.params?.card;
  const isEditMode = !!cardToEdit;

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CardFormData>({
    resolver: zodResolver(cardFormSchema),
    defaultValues: {
      title: cardToEdit?.title || '',
      topic: cardToEdit?.topic || '',
      explanation: cardToEdit?.explanation || '',
      code: cardToEdit?.code ?? '',
      image: cardToEdit?.image ?? '',
      tags: cardToEdit?.tags?.join(', ') || '',
      difficulty: cardToEdit?.difficulty || 'Easy',
    },
  });

  const createMutation = useCreateRevisionCard();
  const updateMutation = useUpdateRevisionCard();

  const onSubmit = (data: CardFormData) => {
    const submissionData = {
      ...data,
      // Ensure empty optional fields are not sent if they are empty strings
      code: data.code || undefined,
      image: data.image || undefined,
      tags: data.tags ? data.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    };

    if (isEditMode && cardToEdit) {
      updateMutation.mutate(
        { cardId: cardToEdit._id, updateData: submissionData },
        {
          onSuccess: () => {
            Toast.show({
              type: 'success',
              text1: 'Card Updated!',
              text2: 'Your changes have been saved.',
            });
            navigation.goBack();
          },
          onError: (error) => {
            Toast.show({
              type: 'error',
              text1: 'Update Failed',
              text2: error.message || 'An unexpected error occurred.',
            });
          },
        }
      );
    } else {
      createMutation.mutate(submissionData, {
        onSuccess: () => {
          Toast.show({
            type: 'success',
            text1: 'Card Created!',
            text2: 'Your new card is ready.',
          });
          navigation.goBack();
        },
        onError: (error) => {
          Toast.show({
            type: 'error',
            text1: 'Creation Failed',
            text2: error.message || 'An unexpected error occurred.',
          });
        },
      });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || isSubmitting;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-zinc-900">
      <StyledScrollView className="p-4" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StyledText className="text-white text-3xl font-bold mb-6 pt-12">
          {isEditMode ? 'Edit Revision Card' : 'Create New Card'}
        </StyledText>

        <RevisionForm control={control} errors={errors} />

        <StyledTouchableOpacity
          onPress={handleSubmit(onSubmit)}
          disabled={isLoading}
          className="bg-blue-600 py-4 rounded-lg items-center mt-4 disabled:opacity-50"
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <StyledText className="text-white font-bold text-lg">{isEditMode ? 'Save Changes' : 'Create Card'}</StyledText>
          )}
        </StyledTouchableOpacity>
      </StyledScrollView>
    </KeyboardAvoidingView>
  );
};

export default CreateRevisionScreen;