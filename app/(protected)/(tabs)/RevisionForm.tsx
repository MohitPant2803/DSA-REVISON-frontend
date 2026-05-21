import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { styled } from 'nativewind';
import { Controller, Control, FieldError } from 'react-hook-form';
import { CardFormData } from './CreateRevisionScreen';
import { DifficultyLevels } from '../../../src/types/revision';

// Styled components
const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTextInput = styled(TextInput);
const StyledTouchableOpacity = styled(TouchableOpacity);

// --- Reusable Form Input Component ---
interface FormInputProps {
  name: keyof CardFormData;
  label: string;
  control: Control<CardFormData>;
  error?: FieldError;
  [key: string]: any; // for other TextInput props
}

const FormInput = ({ name, label, control, error, ...props }: FormInputProps) => (
  <StyledView className="mb-5">
    <StyledText className="text-zinc-400 text-base mb-2 font-semibold">{label}</StyledText>
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <StyledTextInput
          className={`bg-zinc-800 border ${
            error ? 'border-red-500' : 'border-zinc-700'
          } text-white p-4 rounded-lg text-base`}
          placeholderTextColor="#a1a1aa"
          onBlur={onBlur}
          onChangeText={onChange}
          value={value}
          {...props}
        />
      )}
    />
    {error && <StyledText className="text-red-500 mt-1">{error.message}</StyledText>}
  </StyledView>
);

// --- Difficulty Selector Component ---
interface DifficultySelectorProps {
  control: Control<CardFormData>;
  name: 'difficulty';
}

const DifficultySelector = ({ control, name }: DifficultySelectorProps) => (
  <StyledView className="mb-5">
    <StyledText className="text-zinc-400 text-base mb-2 font-semibold">Difficulty</StyledText>
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => (
        <StyledView className="flex-row">
          {DifficultyLevels.map((level) => (
            <StyledTouchableOpacity
              key={level}
              onPress={() => onChange(level)}
              className={`flex-1 py-3 rounded-lg items-center mr-2 last:mr-0 ${
                value === level ? 'bg-blue-600' : 'bg-zinc-800'
              }`}
            >
              <StyledText className={`font-bold ${value === level ? 'text-white' : 'text-zinc-400'}`}>
                {level}
              </StyledText>
            </StyledTouchableOpacity>
          ))}
        </StyledView>
      )}
    />
  </StyledView>
);

// --- Main Form Component ---
interface RevisionFormProps {
  control: Control<CardFormData>;
  errors: { [K in keyof CardFormData]?: FieldError };
}

const RevisionForm = ({ control, errors }: RevisionFormProps) => {
  return (
    <>
      <FormInput name="title" label="Title" control={control} error={errors.title} placeholder="e.g., What is a Binary Tree?" />
      <FormInput name="topic" label="Topic" control={control} error={errors.topic} placeholder="e.g., Data Structures" />
      <DifficultySelector control={control} name="difficulty" />
      <FormInput
        name="explanation"
        label="Explanation"
        control={control}
        error={errors.explanation}
        multiline
        placeholder="Explain the concept clearly..."
        style={{ height: 120, textAlignVertical: 'top' }}
      />
      <FormInput
        name="code"
        label="Code Snippet (Optional)"
        control={control}
        error={errors.code}
        multiline
        placeholder="console.log('Hello, World!');"
        style={{ height: 150, textAlignVertical: 'top' }}
        autoCapitalize="none"
      />
      <FormInput name="image" label="Image URL (Optional)" control={control} error={errors.image} placeholder="https://example.com/image.png" keyboardType="url" />
      <FormInput name="tags" label="Tags (Optional, comma-separated)" control={control} error={errors.tags} placeholder="e.g., trees, algorithms, interview" />
    </>
  );
};

export default RevisionForm;