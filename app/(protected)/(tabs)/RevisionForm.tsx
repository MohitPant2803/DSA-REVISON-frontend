import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Controller, Control, FieldError } from 'react-hook-form';
import { z } from 'zod';
import { DifficultyLevels, ComplexityLevels } from '../../../src/types/revision';
import type { IFolder } from '@/types/folder';

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

export const FormInput = ({ name, label, control, error, ...props }: FormInputProps) => (
  <View className="mb-5">
    <Text className="text-slate-500 text-sm mb-2 font-semibold uppercase tracking-wider">{label}</Text>
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
          className={`bg-white border ${
            error ? 'border-rose-300' : 'border-slate-100'
          } text-slate-900 p-4 rounded-2xl text-base shadow-sm`}
          placeholderTextColor="#94a3b8"
          onBlur={onBlur}
          onChangeText={onChange}
          value={value}
          {...props}
        />
      )}
    />
    {error && <Text className="text-red-500 mt-1">{error.message}</Text>}
  </View>
);

const DifficultySelector = ({ 
  control, 
  folders 
}: { 
  control: any; 
  folders: IFolder[] 
}) => (
  <View className="mb-5">
    <Text className="text-zinc-400 text-base mb-2 font-semibold">Difficulty</Text>
    <Controller
      control={control}
      name="difficulty"
      render={({ field: { onChange, value } }) => (
        <View className="flex-row">
          {DifficultyLevels.map((level) => (
            <TouchableOpacity
              key={level}
              onPress={() => onChange(level)}
              className={`flex-1 py-3 rounded-lg items-center mr-2 ${
                value === level ? 'bg-violet-600' : 'bg-zinc-800'
              }`}
            >
              <Text className={`font-bold ${value === level ? 'text-white' : 'text-zinc-400'}`}>
                {level}
              </Text>
            </TouchableOpacity>
          ))}
            {folders.length === 0 && (
              <Text className="text-amber-500 text-sm mt-1">No folders found. Create a folder in the Learn tab first.</Text>
            )}
        </View>
      )}
    />
  </View>
);

const FolderSelector = ({
  control,
  folders,
  error,
}: {
  control: any;
  folders: IFolder[];
  error?: FieldError;
}) => (
  <View className="mb-5">
    <Text className="text-zinc-400 text-base mb-2 font-semibold">Folder</Text>
    <Controller
      control={control}
      name="folderId"
      render={({ field: { onChange, value } }) => (
        <View className="flex-row flex-wrap gap-2">
          {folders.map((folder) => (
            <TouchableOpacity
              key={folder._id}
              onPress={() => onChange(folder._id)}
              className={`px-4 py-2.5 rounded-full border ${
                value === folder._id
                  ? 'border-violet-500 bg-violet-600/30'
                  : 'border-zinc-700 bg-zinc-800'
              }`}
            >
              <Text className={value === folder._id ? 'text-violet-200' : 'text-zinc-400'}>
                {folder.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    />
    {error && <Text className="text-red-500 mt-1">{error.message}</Text>}
  </View>
);

interface RevisionFormProps {
  control: any;
  errors: any;
  folders: IFolder[];
}

export default function RevisionForm({ control, errors, folders }: RevisionFormProps) {
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
        <Text className="text-zinc-400 text-base mb-2 font-semibold">Complexity (optional)</Text>
        <Controller
          control={control}
          name="complexity"
          render={({ field: { onChange, value } }) => (
            <View className="flex-row flex-wrap gap-2">
              {ComplexityLevels.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => onChange(value === c ? undefined : c)}
                  className={`px-3 py-2 rounded-lg border ${
                    value === c ? 'border-violet-500 bg-violet-600/20' : 'border-zinc-700'
                  }`}
                >
                  <Text className={`text-xs font-mono ${value === c ? 'text-violet-200' : 'text-zinc-500'}`}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      </View>
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
