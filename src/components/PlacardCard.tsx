import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Placard } from '../types';
import { HelpCircle, BookOpen, CheckCircle, Sparkles, Lightbulb, ChevronRight, Target, Heart } from 'lucide-react-native';
import Animated, { FadeInDown, SlideInDown, BounceIn, FadeIn } from 'react-native-reanimated';
interface PlacardCardProps {
  placard: Placard;
  onActionPress: () => void;
  onBookmarkPress?: () => void;
  onBookmarkLongPress?: () => void;
  index?: number;
  total?: number;
}

const PlacardCardComponent = ({ placard, onActionPress, onBookmarkPress, onBookmarkLongPress, index, total }: PlacardCardProps) => {
  const isBookmarked = false;

  const difficultyStyles = {
    Easy: {
      container: 'bg-emerald-100/50 border border-emerald-200/50',
      text: 'text-emerald-700',
      iconColor: '#047857', // emerald-700
    },
    Medium: {
      container: 'bg-amber-100/50 border border-amber-200/50',
      text: 'text-amber-700',
      iconColor: '#b45309', // amber-700
    },
    Hard: {
      container: 'bg-rose-100/50 border border-rose-200/50',
      text: 'text-rose-700',
      iconColor: '#be123c', // rose-700
    },
  }[placard.difficulty];

  // Dynamically generate a vibrant soft background pair based on topic length to create variety safely
  const [color1, color2] = useMemo(() => {
    const len = placard.topic.length;
    if (len % 4 === 0) return ['rgba(224, 231, 255, 0.7)', 'rgba(252, 231, 243, 0.7)']; // Indigo / Pink
    if (len % 4 === 1) return ['rgba(220, 252, 231, 0.7)', 'rgba(224, 242, 254, 0.7)']; // Green / Sky
    if (len % 4 === 2) return ['rgba(254, 243, 199, 0.7)', 'rgba(255, 237, 213, 0.7)']; // Amber / Orange
    return ['rgba(237, 233, 254, 0.7)', 'rgba(250, 232, 255, 0.7)']; // Violet / Fuchsia
  }, [placard.topic]);

  return (
    <View className="flex-1 bg-slate-50 relative justify-center pt-28 pb-6 px-4 overflow-hidden">
        
      {/* Dynamic Immersive Background Orbs */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#f8fafc' }]} />
      <View className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-3xl opacity-80" style={{ backgroundColor: color1 }} />
      <View className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-3xl opacity-80" style={{ backgroundColor: color2 }} />

      <View className="flex-1 bg-white/80 rounded-[48px] p-7 shadow-2xl shadow-slate-300/40 border border-white justify-between overflow-hidden relative backdrop-blur-3xl">
        <View className="z-10 flex-1">
          {total !== undefined && index !== undefined && (
            <Animated.View entering={FadeIn.delay(50)} className="flex-row items-center justify-between mb-8">
              <View className="flex-row items-center">
                <Text className="text-slate-900 font-black text-lg tracking-tight">{index + 1}</Text>
                <Text className="text-slate-400 font-bold text-sm tracking-tight ml-1">/ {total}</Text>
              </View>
              <View className="w-24 h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                <View className="bg-slate-800 h-full rounded-full" style={{ width: `${((index + 1) / total) * 100}%` }} />
              </View>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(100).springify()} className="flex-row items-center justify-between mb-7">
            <View className="flex-row items-center">
              <View className={`px-3.5 py-1.5 rounded-full flex-row items-center shadow-sm shadow-slate-100 mr-2 ${difficultyStyles.container}`}>
                <Target color={difficultyStyles.iconColor} size={12} className="mr-1.5 opacity-80" />
                <Text className={`font-black text-[10px] uppercase tracking-widest ${difficultyStyles.text}`}>{placard.difficulty}</Text>
              </View>
              
              {placard.isCompleted && (
                <Animated.View entering={BounceIn.delay(500).springify()}>
                  <View className="bg-emerald-50 border border-emerald-100/80 px-3 py-1.5 rounded-full flex-row items-center shadow-sm shadow-emerald-100/50">
                    <CheckCircle color="#10b981" size={12} className="mr-1.5" />
                    <Text className="text-emerald-700 font-black text-[10px] uppercase tracking-widest">Mastered</Text>
                  </View>
                </Animated.View>
              )}
            </View>

            <TouchableOpacity 
              activeOpacity={0.7}
              onPress={onBookmarkPress}
              onLongPress={onBookmarkLongPress}
              className="p-2.5 bg-white/60 rounded-full border border-white shadow-sm shadow-slate-200/50"
            >
              <Heart color={isBookmarked ? "#e11d48" : "#94a3b8"} fill={isBookmarked ? "#e11d48" : "transparent"} size={20} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).springify()} className="flex-1">
            <View className="flex-row items-center mb-4 bg-white/60 self-start px-3 py-1.5 rounded-xl border border-white/80">
              <Sparkles color="#7c3aed" size={16} className="mr-2" />
              <Text className="text-violet-700 font-bold text-[11px] uppercase tracking-widest">{placard.topic}</Text>
            </View>

            <Text className="text-slate-900 text-[38px] font-black mb-6 leading-[1.1] tracking-tighter" numberOfLines={4}>
              {placard.title}
            </Text>

            <Text className="text-slate-600 text-[18px] leading-[1.6] font-medium" numberOfLines={5}>
              {placard.questionText}
            </Text>
          </Animated.View>
        </View>

        <Animated.View entering={SlideInDown.delay(300).springify().damping(18)} className="gap-3.5 z-10 mt-2">
          <TouchableOpacity 
            activeOpacity={0.85}
            onPress={onActionPress} 
            className="w-full bg-slate-900 flex-row items-center justify-between p-5 rounded-[28px] shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-transform"
          >
            <View className="flex-row items-center">
              <HelpCircle color="#fff" size={22} className="mr-3" />
              <Text className="text-white text-[18px] font-black tracking-wide">Explore Concept</Text>
            </View>
            <View className="bg-white/20 p-2 rounded-full">
              <ChevronRight color="#fff" size={20} />
            </View>
          </TouchableOpacity>

          <View className="flex-row gap-3">
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={onActionPress} 
              className="flex-1 bg-white flex-row items-center justify-center p-4 rounded-[24px] border border-slate-100 shadow-sm shadow-slate-200/50 active:scale-[0.97] transition-transform"
            >
              <BookOpen color="#64748b" size={18} className="mr-2" />
              <Text className="text-slate-700 font-bold text-[15px]">Quick Quiz</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={onActionPress} 
              className="flex-1 bg-white flex-row items-center justify-center p-4 rounded-[24px] border border-slate-100 shadow-sm shadow-slate-200/50 active:scale-[0.97] transition-transform"
            >
              <Lightbulb color="#64748b" size={18} className="mr-2" />
              <Text className="text-slate-700 font-bold text-[15px]">Solution</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

export const PlacardCard = memo(PlacardCardComponent);