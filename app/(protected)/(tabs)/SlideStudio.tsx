import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StyleSheet,
} from 'react-native';
import {
  Sparkles,
  Plus,
  Trash2,
  BookOpen,
  Code,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  Eye,
  Settings,
} from 'lucide-react-native';
import { RevisionCard } from './RevisionCard';
import { IPopulatedRevisionCard } from '@/hooks/useRevisionCards';

const { width } = Dimensions.get('window');

// NativeWind v4 removed the `styled` HOC. Use a local identity wrapper instead.
const styled = <T,>(Component: T): T => Component;

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledTextInput = styled(TextInput);
const StyledTouchableOpacity = styled(TouchableOpacity);
const StyledScrollView = styled(ScrollView);


export interface SlideData {
  type: string;
  headline: string;
  body: string;
  code?: string;
  blocks?: Array<{
    type: string;
    content: string;
    meta?: Record<string, any>;
  }>;
}

interface SlideStudioProps {
  slides: SlideData[];
  onChange: (slides: SlideData[]) => void;
  cardMetaData: {
    title: string;
    topic: string;
    difficulty: string;
  };
}

const SLIDE_TYPES = [
  { value: 'intro', label: 'Intro Slide', icon: BookOpen, color: '#3b82f6' },
  { value: 'intuition', label: 'Intuition / Analogy', icon: Sparkles, color: '#8b5cf6' },
  { value: 'observation', label: 'Key Observation', icon: CheckCircle2, color: '#10b981' },
  { value: 'dryrun', label: 'Dry Run Walking', icon: Zap, color: '#f59e0b' },
  { value: 'code', label: 'Code Walkthrough', icon: Code, color: '#06b6d4' },
  { value: 'complexity', label: 'Complexity Meter', icon: TrendingUp, color: '#ec4899' },
  { value: 'mistake', label: 'Avoid Mistake', icon: AlertCircle, color: '#ef4444' },
  { value: 'summary', label: 'Summary Celebrate', icon: CheckCircle2, color: '#14b8a6' },
];

export default function SlideStudio({ slides, onChange, cardMetaData }: SlideStudioProps) {
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [showPreview, setShowPreview] = useState<boolean>(true);

  // Initialize slides with default template if none exist
  useEffect(() => {
    if (!slides || slides.length === 0) {
      applyPreset(3);
    }
  }, []);

  const updateSlide = (index: number, updatedData: Partial<SlideData>) => {
    if (!slides) return;
    const newSlides = [...slides];
    newSlides[index] = { ...(newSlides[index] || {}), ...updatedData };
    onChange(newSlides);
  };

  const addSlide = () => {
    const newSlides = [
      ...slides,
      { type: 'observation', headline: 'New Insight', body: 'Add context or key takeaways here.' }
    ];
    onChange(newSlides);
    setSelectedSlideIndex(newSlides.length - 1);
  };

  const removeSlide = (index: number) => {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    onChange(newSlides);
    setSelectedSlideIndex(Math.max(0, index - 1));
  };

  const applyPreset = (count: number) => {
    let presetSlides: SlideData[] = [];
    if (count === 3) {
      presetSlides = [
        { type: 'intro', headline: cardMetaData?.title || 'Introduction to Pattern', body: 'Unlock the primary intuition of the problem pattern.' },
        { type: 'observation', headline: 'Key Observations', body: 'Note key invariants, constraints, or sorting indicators.' },
        { type: 'summary', headline: 'Summary checklist', body: 'Review space and time complexities, edge cases.' },
      ];
    } else if (count === 5) {
      presetSlides = [
        { type: 'intro', headline: cardMetaData?.title || 'Core Problem Concept', body: 'Welcome to this cinematic revision deck.' },
        { type: 'intuition', headline: 'The Analogy', body: 'Understand the concept using an elegant visual explanation.' },
        { type: 'code', headline: 'Optimal Code Walkthrough', body: 'Inspect the optimized code with full syntax highlighted line blocks.', code: '// Write code here' },
        { type: 'complexity', headline: 'Complexity Analysis', body: 'Observe time vs space growth trade-offs.' },
        { type: 'summary', headline: 'Unlocking Checklist', body: 'Ready to crush this interview problem pattern!' },
      ];
    } else {
      // 7 slides
      presetSlides = [
        { type: 'intro', headline: cardMetaData?.title || 'Comprehensive Concept', body: 'Welcome to the deep-dive revision deck.' },
        { type: 'intuition', headline: 'The Core Intuition', body: 'Why does this pattern work?' },
        { type: 'observation', headline: 'Critical Observations', body: 'Watch out for indexing, pointers, or states.' },
        { type: 'dryrun', headline: 'Dry Run Walking', body: 'Tracing the state step-by-step.' },
        { type: 'code', headline: 'Clean Implementation', body: 'Review optimized clean implementation.', code: '// Write code here' },
        { type: 'complexity', headline: 'Complexity Bounds', body: 'Understand Big O bounds.' },
        { type: 'summary', headline: 'Final Summary Checklist', body: 'All takeaways unlocked successfully.' },
      ];
    }
    onChange(presetSlides);
    setSelectedSlideIndex(0);
  };

  // Add Notion block to current slide
  const addBlockToSlide = (type: 'code' | 'mistake' | 'complexity' | 'analogy') => {
    const currentSlide = slides[selectedSlideIndex];
    const newBlocks = currentSlide.blocks ? [...currentSlide.blocks] : [];
    
    if (type === 'code') {
      newBlocks.push({ type: 'code', content: '// Write solution code here' });
    } else if (type === 'mistake') {
      newBlocks.push({ type: 'mistake', content: 'Avoid: Using O(N^2) double loops', meta: { prefer: 'Prefer: Using O(N) Hashmap tracking' } });
    } else if (type === 'complexity') {
      newBlocks.push({ type: 'complexity', content: 'O(N)', meta: { space: 'O(N)' } });
    } else if (type === 'analogy') {
      newBlocks.push({ type: 'analogy', content: 'Imagine pointer left and right meeting in the middle like curtains closing.' });
    }

    updateSlide(selectedSlideIndex, { blocks: newBlocks });
  };

  // Update block properties
  const updateBlock = (blockIndex: number, field: string, value: any) => {
    const currentSlide = slides[selectedSlideIndex];
    if (!currentSlide.blocks) return;
    const newBlocks = [...currentSlide.blocks];
    
    if (field === 'content') {
      newBlocks[blockIndex].content = value;
    } else if (field === 'meta_prefer') {
      newBlocks[blockIndex].meta = { ...(newBlocks[blockIndex].meta || {}), prefer: value }; // Safely initialize meta if undefined
    } else if (field === 'meta_space') {
      newBlocks[blockIndex].meta = { ...(newBlocks[blockIndex].meta || {}), space: value }; // Safely initialize meta if undefined
    }
    
    updateSlide(selectedSlideIndex, { blocks: newBlocks });
  };

  // Remove block
  const removeBlock = (blockIndex: number) => {
    const currentSlide = slides[selectedSlideIndex];
    if (!currentSlide.blocks) return;
    const newBlocks = currentSlide.blocks.filter((_, i) => i !== blockIndex);
    updateSlide(selectedSlideIndex, { blocks: newBlocks });
  };

  const currentActiveSlide = slides[selectedSlideIndex];

  // Helper to compile a temporary populated card for preview
  const compileMockCard = (): IPopulatedRevisionCard => {
    return {
      _id: 'mock_preview_card_id',
      title: cardMetaData?.title || 'Dynamic Pattern Preview',
      topic: cardMetaData?.topic || 'General DSA',
      difficulty: (cardMetaData?.difficulty as any) || 'Medium',
      explanation: currentActiveSlide?.body || 'Add context or key takeaways here.',
      code: currentActiveSlide?.code || '',
      tags: [],
      examples: [],
      folderId: 'mock_folder_id',
      createdBy: { _id: 'user_preview', name: 'Creator', email: '', role: 'admin' },
      visibility: 'public',
      order: 0,
      createdAt: '',
      updatedAt: '',
    };
  };

  return (
    <StyledView className="w-full bg-[#161619] rounded-[32px] p-6 border border-zinc-800 shadow-xl mt-6">
      
      {/* Studio Header */}
      <StyledView className="flex-row items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
        <StyledView className="flex-row items-center gap-2">
          <Sparkles color="#a78bfa" size={18} />
          <StyledText className="text-zinc-100 font-bold text-lg">Revision Slide Studio</StyledText>
        </StyledView>
        <StyledTouchableOpacity 
          onPress={() => setShowPreview(!showPreview)}
          className="flex-row items-center gap-1.5 bg-zinc-800/80 px-3 py-1.5 rounded-full"
        >
          <Eye color={showPreview ? '#a78bfa' : '#a1a1aa'} size={13} />
          <StyledText className="text-zinc-300 font-bold text-[10px] uppercase tracking-wider">
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </StyledText>
        </StyledTouchableOpacity>
      </StyledView>

      {/* STEP 1: Presets Quick Setup */}
      {slides.length === 0 ? (
        <StyledView className="items-center py-6">
          <StyledText className="text-zinc-400 text-sm mb-4 text-center">Choose slide count template setup:</StyledText>
          <StyledView className="flex-row gap-2">
            <StyledTouchableOpacity onPress={() => applyPreset(3)} className="bg-zinc-800 px-4 py-2.5 rounded-xl border border-zinc-700">
              <StyledText className="text-zinc-200 font-bold text-xs">3 Slides Preset</StyledText>
            </StyledTouchableOpacity>
            <StyledTouchableOpacity onPress={() => applyPreset(5)} className="bg-zinc-800 px-4 py-2.5 rounded-xl border border-zinc-700">
              <StyledText className="text-zinc-200 font-bold text-xs">5 Slides Preset</StyledText>
            </StyledTouchableOpacity>
            <StyledTouchableOpacity onPress={() => applyPreset(7)} className="bg-zinc-800 px-4 py-2.5 rounded-xl border border-zinc-700">
              <StyledText className="text-zinc-200 font-bold text-xs">7 Slides Preset</StyledText>
            </StyledTouchableOpacity>
          </StyledView>
        </StyledView>
      ) : (
        <StyledView>
          {/* STEP 2: Keynote Horizontal Slide Sorter / Nav */}
          <StyledText className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider mb-2">Slide Outline Navigator</StyledText>
          <StyledScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 flex-row gap-2 pb-2">
            {slides.map((slide, index) => {
              const isActive = index === selectedSlideIndex;
              const currentType = SLIDE_TYPES.find((t) => t.value === slide.type) || SLIDE_TYPES[0];
              const IconComp = currentType.icon;

              return (
                <StyledTouchableOpacity
                  key={index}
                  onPress={() => setSelectedSlideIndex(index)}
                  className={`px-3.5 py-3 rounded-2xl flex-row items-center gap-2 border min-w-[100px] ${
                    isActive ? 'bg-violet-600/30 border-violet-500' : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <StyledView className="p-1 rounded-lg bg-zinc-800">
                    <IconComp size={12} color={currentType.color} />
                  </StyledView>
                  <StyledView>
                    <StyledText className="text-zinc-400 font-black text-[9px] uppercase">Slide {index + 1}</StyledText>
                    <StyledText className="text-zinc-100 font-bold text-xs" numberOfLines={1}>
                      {slide.headline || 'Title'}
                    </StyledText>
                  </StyledView>
                  {slides.length > 1 && (
                    <StyledTouchableOpacity onPress={() => removeSlide(index)} className="ml-1 opacity-60 hover:opacity-100">
                      <Trash2 size={11} color="#ef4444" />
                    </StyledTouchableOpacity>
                  )}
                </StyledTouchableOpacity>
              );
            })}
            
            <StyledTouchableOpacity
              onPress={addSlide}
              className="bg-zinc-900 border border-zinc-800 border-dashed rounded-2xl px-4 py-3 flex-row items-center gap-1.5 justify-center"
            >
              <Plus size={13} color="#a1a1aa" />
              <StyledText className="text-zinc-400 font-bold text-xs">Add</StyledText>
            </StyledTouchableOpacity>
          </StyledScrollView>

          {/* Dual Split View Editor & Realtime Preview */}
          <StyledView className="flex-col gap-6">
            
            {/* Live mockup card preview */}
            {showPreview && currentActiveSlide && (
              <StyledView className="w-full bg-[#F5F7FB] border border-zinc-800 rounded-[28px] overflow-hidden p-5" style={{ height: 420 }}>
                <StyledView className="absolute top-2 left-6 z-10">
                  <StyledText className="text-[10px] text-violet-600 font-black tracking-widest uppercase">Live Preview Mockup</StyledText>
                </StyledView>
                <RevisionCard
                  slide={{
                    ...currentActiveSlide,
                    card: compileMockCard(),
                    slideIndex: selectedSlideIndex,
                    totalSlides: slides.length,
                  }}
                  currentIndex={selectedSlideIndex}
                  totalCount={slides.length}
                />
              </StyledView>
            )}

            {/* Active Slide Form Editor Panel */}
            {currentActiveSlide && (
              <StyledView className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 gap-4">
                <StyledView className="flex-row items-center justify-between border-b border-zinc-800/80 pb-3">
                  <StyledText className="text-zinc-100 font-bold text-sm">Editing Slide {selectedSlideIndex + 1}</StyledText>
                  <StyledText className="text-zinc-500 font-mono text-[10px]">Type: {currentActiveSlide.type}</StyledText>
                </StyledView>

                {/* Visual Slide Type Picker */}
                <StyledView>
                  <StyledText className="text-zinc-500 font-bold text-[9px] uppercase tracking-wider mb-2">Slide Template style</StyledText>
                  <StyledScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-1.5">
                    {SLIDE_TYPES.map((type) => {
                      const isSelected = currentActiveSlide.type === type.value;
                      const IconComp = type.icon;
                      return (
                        <StyledTouchableOpacity
                          key={type.value}
                          onPress={() => updateSlide(selectedSlideIndex, { type: type.value })}
                          className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                            isSelected ? 'bg-zinc-800 border-zinc-600' : 'bg-[#161619] border-zinc-800'
                          }`}
                        >
                          <IconComp size={11} color={type.color} />
                          <StyledText className={`text-[10px] font-bold ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                            {type.label.split(' ')[0]}
                          </StyledText>
                        </StyledTouchableOpacity>
                      );
                    })}
                  </StyledScrollView>
                </StyledView>

                {/* Input Fields */}
                <StyledView className="gap-3">
                  <StyledView>
                    <StyledText className="text-zinc-400 font-bold text-[9px] uppercase mb-1">Slide Headline</StyledText>
                    <StyledTextInput
                      className="bg-[#161619] border border-zinc-800 text-zinc-100 p-3 rounded-xl text-sm"
                      value={currentActiveSlide.headline}
                      onChangeText={(text: string) => updateSlide(selectedSlideIndex, { headline: text })}
                      placeholder="Enter slide core headline..."
                      placeholderTextColor="#52525b"
                    />
                  </StyledView>

                  <StyledView>
                    <StyledText className="text-zinc-400 font-bold text-[9px] uppercase mb-1">Slide Body / Insight Explanation</StyledText>
                    <StyledTextInput
                      className="bg-[#161619] border border-zinc-800 text-zinc-100 p-3 rounded-xl text-sm min-h-[60px]"
                      value={currentActiveSlide.body}
                      onChangeText={(text: string) => updateSlide(selectedSlideIndex, { body: text })}
                      placeholder="Explain the slide concept cleanly..."
                      placeholderTextColor="#52525b"
                      multiline
                    />
                  </StyledView>

                  {/* Standard Slide code fallback input if code type */}
                  {currentActiveSlide.type === 'code' && (
                    <StyledView>
                      <StyledText className="text-zinc-400 font-bold text-[9px] uppercase mb-1">Walkthrough Code Block</StyledText>
                      <StyledTextInput
                        className="bg-[#161619] border border-zinc-800 text-zinc-100 p-3 rounded-xl font-mono text-xs min-h-[80px]"
                        value={currentActiveSlide.code}
                        onChangeText={(text: string) => updateSlide(selectedSlideIndex, { code: text })}
                        placeholder="// code solution snippet"
                        placeholderTextColor="#52525b"
                        multiline
                        autoCapitalize="none"
                      />
                    </StyledView>
                  )}
                </StyledView>

                {/* STEP 3: Notion Block System Editor */}
                <StyledView className="border-t border-zinc-800/80 pt-4">
                  <StyledText className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider mb-2">Notion Blocks Layer</StyledText>
                  
                  {/* List slide custom blocks */}
                  {currentActiveSlide.blocks && currentActiveSlide.blocks.length > 0 ? (
                    <StyledView className="gap-3.5 mb-4">
                      {currentActiveSlide.blocks.map((block, idx) => (
                        <StyledView key={idx} className="bg-[#161619] border border-zinc-800 rounded-xl p-3 relative gap-2">
                          <StyledView className="flex-row items-center justify-between">
                            <StyledText className="text-violet-400 font-bold text-[9px] uppercase">
                              Block: {block.type}
                            </StyledText>
                            <StyledTouchableOpacity onPress={() => removeBlock(idx)} className="p-0.5">
                              <Trash2 size={11} color="#ef4444" />
                            </StyledTouchableOpacity>
                          </StyledView>

                          <StyledTextInput
                            className="bg-zinc-900 border border-zinc-800 text-zinc-200 p-2 rounded-lg text-xs"
                            value={block.content}
                            onChangeText={(text: string) => updateBlock(idx, 'content', text)}
                            placeholder="Type content..."
                            placeholderTextColor="#52525b"
                            multiline
                          />

                          {block.type === 'mistake' && (
                            <StyledTextInput
                              className="bg-zinc-900 border border-zinc-800 text-emerald-300 p-2 rounded-lg text-xs"
                              value={block.meta?.prefer || ''}
                              onChangeText={(text: string) => updateBlock(idx, 'meta_prefer', text)}
                              placeholder="Prefer: type correct alternative..."
                              placeholderTextColor="#52525b"
                            />
                          )}

                          {block.type === 'complexity' && (
                            <StyledTextInput
                              className="bg-zinc-900 border border-zinc-800 text-blue-300 p-2 rounded-lg text-xs"
                              value={block.meta?.space || ''}
                              onChangeText={(text: string) => updateBlock(idx, 'meta_space', text)}
                              placeholder="Space complexity (e.g. O(1))"
                              placeholderTextColor="#52525b"
                            />
                          )}
                        </StyledView>
                      ))}
                    </StyledView>
                  ) : (
                    <StyledText className="text-zinc-500 text-xs italic mb-4">No custom blocks added yet. Use standard inputs above or add Notion blocks below.</StyledText>
                  )}

                  {/* Add Block Row */}
                  <StyledView className="flex-row flex-wrap gap-2">
                    <StyledTouchableOpacity
                      onPress={() => addBlockToSlide('code')}
                      className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl flex-row items-center gap-1 border border-zinc-700"
                    >
                      <PlusCircle size={10} color="#a1a1aa" />
                      <StyledText className="text-zinc-300 text-[10px] font-bold">Add Code</StyledText>
                    </StyledTouchableOpacity>

                    <StyledTouchableOpacity
                      onPress={() => addBlockToSlide('analogy')}
                      className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl flex-row items-center gap-1 border border-zinc-700"
                    >
                      <PlusCircle size={10} color="#a1a1aa" />
                      <StyledText className="text-zinc-300 text-[10px] font-bold">Add Analogy</StyledText>
                    </StyledTouchableOpacity>

                    <StyledTouchableOpacity
                      onPress={() => addBlockToSlide('mistake')}
                      className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl flex-row items-center gap-1 border border-zinc-700"
                    >
                      <PlusCircle size={10} color="#a1a1aa" />
                      <StyledText className="text-zinc-300 text-[10px] font-bold">Add Mistake</StyledText>
                    </StyledTouchableOpacity>

                    <StyledTouchableOpacity
                      onPress={() => addBlockToSlide('complexity')}
                      className="bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl flex-row items-center gap-1 border border-zinc-700"
                    >
                      <PlusCircle size={10} color="#a1a1aa" />
                      <StyledText className="text-zinc-300 text-[10px] font-bold">Add Complexity</StyledText>
                    </StyledTouchableOpacity>
                  </StyledView>
                </StyledView>
              </StyledView>
            )}

            {/* Config Presets Quick Reset */}
            <StyledView className="flex-row items-center gap-2 mt-2">
              <Settings size={12} color="#71717a" />
              <StyledText className="text-zinc-500 font-bold text-[9px] uppercase">Reset template setup presets:</StyledText>
              <StyledTouchableOpacity onPress={() => applyPreset(3)}>
                <StyledText className="text-violet-400 font-bold text-[9px] hover:underline uppercase">3 Slides</StyledText>
              </StyledTouchableOpacity>
              <StyledText className="text-zinc-600 font-mono text-[9px]">•</StyledText>
              <StyledTouchableOpacity onPress={() => applyPreset(5)}>
                <StyledText className="text-violet-400 font-bold text-[9px] hover:underline uppercase">5 Slides</StyledText>
              </StyledTouchableOpacity>
              <StyledText className="text-zinc-600 font-mono text-[9px]">•</StyledText>
              <StyledTouchableOpacity onPress={() => applyPreset(7)}>
                <StyledText className="text-violet-400 font-bold text-[9px] hover:underline uppercase">7 Slides</StyledText>
              </StyledTouchableOpacity>
            </StyledView>
            
          </StyledView>
        </StyledView>
      )}
    </StyledView>
  );
}
