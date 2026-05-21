import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Controller, Control, FieldError } from 'react-hook-form';
import { CardFormData } from './CreateRevisionScreen';
import { DifficultyLevels, ComplexityLevels } from '@/types/revision';
import type { IFolder } from '@/types/folder';

interface FormInputProps {
  name: keyof CardFormData;
  label: string;
  control: Control<CardFormData>;
  error?: FieldError;
  [key: string]: unknown;
}

const FormInput = ({ name, label, control, error, ...props }: FormInputProps) => (
  <View className="mb-5">
    <Text className="text-zinc-400 text-base mb-2 font-semibold">{label}</Text>
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <TextInput
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
    {error && <Text className="text-red-500 mt-1">{error.message}</Text>}
  </View>
);

const DifficultySelector = ({ 
  control, 
  folders 
}: { 
  control: Control<CardFormData>; 
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
  control: Control<CardFormData>;
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
  control: Control<CardFormData>;
  errors: { [K in keyof CardFormData]?: FieldError };
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
        label="Code (optional)"
        control={control}
        error={errors.code}
        multiline
        placeholder="// solution"
        style={{ height: 140, textAlignVertical: 'top' }}
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
      <FormInput
        name="examples"
        label="Examples (one per line)"
        control={control}
        error={errors.examples}
        multiline
        placeholder={'Input: nums = [2,7]\nOutput: [0,1]'}
        style={{ height: 100, textAlignVertical: 'top' }}
      />
    </>
  );
}
