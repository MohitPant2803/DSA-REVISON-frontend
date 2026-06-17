import os

filepath = 'app/(protected)/(tabs)/reels.tsx'

if not os.path.exists(filepath):
    print("Error: file not found")
    exit(1)

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replacement 1: reels loader background
old1 = '''  if (isReelsLoading || !isTransitionReady) {
    return (
      <View className="flex-1 bg-[#FAF9F7] justify-center items-center">
        <ReeWCharacter state="loading" size={90} />
      </View>
    );
  }'''

new1 = '''  if (isReelsLoading || !isTransitionReady) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' }}>
        <ReeWCharacter state="loading" size={90} />
      </View>
    );
  }'''

# Replacement 2: reels error background & button
old2 = '''  if (isReelsError) {
    return (
      <View className="flex-1 justify-center items-center bg-[#F8FAFC] p-6">
        <Text className="text-[#64748B] text-lg text-center mb-4 font-medium">
          {reelsErrorObj?.message || 'Failed to load reels'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            refetchPlaylistCards();
          }}
          className="bg-[#8B5CF6] px-6 py-3 rounded-xl shadow-sm active:scale-95"
        >
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }'''

new2 = '''  if (isReelsError) {
    const errorTextColor = palette.isDark ? palette.textPrimary : palette.surface;
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.background, padding: 24 }}>
        <Text style={{ color: palette.textSecondary, fontSize: 18, textAlign: 'center', marginBottom: 16, fontWeight: '500' }}>
          {reelsErrorObj?.message || 'Failed to load reels'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            refetchPlaylistCards();
          }}
          style={{
            backgroundColor: palette.accent,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <Text style={{ color: errorTextColor, fontWeight: '600' }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }'''

# Replacement 3: main GestureHandlerRootView container
old3 = '    <GestureHandlerRootView style={{ flex: 1, backgroundColor: \'#F5F5F7\' }} className="bg-[#F5F5F7]">'
new3 = '    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.background }}>'

# Replacement 4: exit button style
old4 = '''            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: 'rgba(226, 232, 240, 0.6)',
            width: 38,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <ChevronLeft color="#8B5CF6" size={20} strokeWidth={2.5} />'''

new4 = '''            backgroundColor: addAlpha(palette.surface, 0.9),
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.border,
            width: 38,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: palette.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: palette.isDark ? 0.2 : 0.04,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <ChevronLeft color={palette.accent} size={20} strokeWidth={2.5} />'''

replacements = [
    (old1, new1),
    (old2, new2),
    (old3, new3),
    (old4, new4),
]

modified = content
for old_str, new_str in replacements:
    if old_str not in modified:
        print(f"Warning: could not find match for code chunk starting with:\n{old_str[:60]}...")
    modified = modified.replace(old_str, new_str)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(modified)

print("Success: replacements applied successfully!")
