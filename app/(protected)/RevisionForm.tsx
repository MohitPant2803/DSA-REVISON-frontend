import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Controller, Control, FieldError } from 'react-hook-form';
import { z } from 'zod';
import { DifficultyLevels, ComplexityLevels } from '@/types/revision';
import type { IFolder } from '@/types/folder';
import { useThemePalette } from '@/hooks/useThemePalette';
import { addAlpha } from '@/theme/themePalettes';

export const cardFormSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  topic: z.string().min(2, 'Topic is required.'),
  explanation: z.string().min(10, 'Explanation must be at least 10 characters.'),
  code: z.string().optional(),
  image: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  folderId: z.string().min(1, 'Please select a folder.'),
  tags: z.string().optional(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  complexity: z.string().optional(),
  slides: z.array(z.object({
    type: z.string(),
    headline: z.string().min(3),
    body: z.string().min(10),
    code: z.string().optional(),
    visualType: z.string().optional(),
    image: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    accentColor: z.string().optional(),
    blocks: z.array(z.object({
      type: z.string(),
      content: z.string(),
      meta: z.record(z.any()).optional(),
    })).optional(),
  })).optional(),
});

export type CardFormData = z.infer<typeof cardFormSchema>;

interface FormInputProps {
  name: any; // Using any for robust dynamic react-hook-form paths
  label: string;
  control: any;
  error?: FieldError;
  [key: string]: unknown;
}

export const FormInput = ({ name, label, control, error, ...props }: FormInputProps) => {
  const palette = useThemePalette();
  return (
    <View className="mb-5">
      <Text className="text-xs mb-2 font-semibold uppercase tracking-wider" style={{ color: palette.textSecondary }}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="border p-4 rounded-2xl text-base shadow-sm"
            style={{
              backgroundColor: palette.inputBg,
              borderColor: error ? palette.error : palette.border,
              color: palette.textPrimary,
            }}
            placeholderTextColor={palette.textMuted}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            {...props}
          />
        )}
      />
      {error && <Text className="mt-1 text-sm font-semibold" style={{ color: palette.error }}>{error.message}</Text>}
    </View>
  );
};

const DifficultySelector = ({ 
  control, 
  folders 
}: { 
  control: any; 
  folders: IFolder[] 
}) => {
  const palette = useThemePalette();
  return (
    <View className="mb-5">
      <Text className="text-base mb-2 font-semibold" style={{ color: palette.textSecondary }}>Difficulty</Text>
      <Controller
        control={control}
        name="difficulty"
        render={({ field: { onChange, value } }) => (
          <View className="flex-row">
            {DifficultyLevels.map((level) => (
              <TouchableOpacity
                key={level}
                onPress={() => onChange(level)}
                className="flex-1 py-3 rounded-lg items-center mr-2 border"
                style={{
                  backgroundColor: value === level ? palette.accent : palette.inputBg,
                  borderColor: value === level ? palette.accent : palette.border,
                }}
              >
                <Text 
                  className="font-bold"
                  style={{ color: value === level ? (palette.isDark ? palette.textPrimary : palette.surface) : palette.textSecondary }}
                >
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
            {folders.length === 0 && (
              <Text className="text-sm mt-1 font-semibold" style={{ color: palette.warning }}>
                No folders found. Create a folder in the Learn tab first.
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
};

const FolderSelector = ({
  control,
  folders,
  error,
}: {
  control: any;
  folders: IFolder[];
  error?: FieldError;
}) => {
  const palette = useThemePalette();
  return (
    <View className="mb-5">
      <Text className="text-base mb-2 font-semibold" style={{ color: palette.textSecondary }}>Folder</Text>
      <Controller
        control={control}
        name="folderId"
        render={({ field: { onChange, value } }) => (
          <View className="flex-row flex-wrap gap-2">
            {folders.map((folder) => (
              <TouchableOpacity
                key={folder._id}
                onPress={() => onChange(folder._id)}
                className="px-4 py-2.5 rounded-full border"
                style={{
                  backgroundColor: value === folder._id ? addAlpha(palette.accent, 0.12) : palette.inputBg,
                  borderColor: value === folder._id ? palette.accent : palette.border,
                }}
              >
                <Text style={{ color: value === folder._id ? palette.accent : palette.textSecondary, fontWeight: value === folder._id ? '600' : '400' }}>
                  {folder.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
      {error && <Text className="mt-1 text-sm font-semibold" style={{ color: palette.error }}>{error.message}</Text>}
    </View>
  );
};

interface RevisionFormProps {
  control: any;
  errors: any;
  folders: IFolder[];
}

export default function RevisionForm({ control, errors, folders }: RevisionFormProps) {
  const palette = useThemePalette();
  return (
    <>
      <FormInput
        name="title"
        label="Title"
        control={control}
        error={errors.title}
        placeholder="e.g. Two Sum pattern"
      />
      <FormInput
        name="topic"
        label="Topic"
        control={control}
        error={errors.topic}
        placeholder="e.g. Arrays & Hashing"
      />
      <FolderSelector control={control} folders={folders} error={errors.folderId} />
      <DifficultySelector control={control} folders={folders} />
      <View className="mb-5">
        <Text className="text-base mb-2 font-semibold" style={{ color: palette.textSecondary }}>Complexity (optional)</Text>
        <Controller
          control={control}
          name="complexity"
          render={({ field: { onChange, value } }) => (
            <View className="flex-row flex-wrap gap-2">
              {ComplexityLevels.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => onChange(value === c ? undefined : c)}
                  className="px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: value === c ? addAlpha(palette.accent, 0.12) : palette.inputBg,
                    borderColor: value === c ? palette.accent : palette.border,
                  }}
                >
                  <Text className="text-xs font-mono" style={{ color: value === c ? palette.accent : palette.textSecondary, fontWeight: value === c ? '600' : '400' }}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      </View>
      <FormInput
        name="explanation"
        label="Explanation"
        control={control}
        error={errors.explanation}
        placeholder="Type complete concept explanation..."
        multiline
        numberOfLines={4}
      />
      <FormInput
        name="code"
        label="Code Block (optional)"
        control={control}
        error={errors.code}
        placeholder="// Write clean solution code..."
        multiline
        numberOfLines={6}
        autoCapitalize="none"
      />
      <FormInput
        name="image"
        label="Image URL (optional)"
        control={control}
        error={errors.image}
        placeholder="https://..."
        keyboardType="url"
      />
      <FormInput
        name="tags"
        label="Tags (comma-separated)"
        control={control}
        error={errors.tags}
        placeholder="arrays, hashmap"
      />
    </>
  );
}
