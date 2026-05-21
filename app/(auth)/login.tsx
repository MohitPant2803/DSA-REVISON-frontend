import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Animated, { FadeInDown, FadeInUp, withRepeat, withTiming, withSequence, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Sparkles, ArrowRight, Layers, Network, Database, Zap } from 'lucide-react-native';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/services/api';

// Configure once at app start
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: true,
});

export default function LoginScreen() {
  const { login } = useAuthStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Simplified Login Function
  const handleGoogleLogin = async () => {
    try {
      setIsAuthenticating(true);
      await GoogleSignin.hasPlayServices();
      
      // Force account selection by clearing any existing Google session
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignore if no one was signed in
      }

      const userInfo = await GoogleSignin.signIn();
      
      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) {
          throw new Error('Google Sign-In failed: No ID Token returned.');
        }
        
        const res = await api.post('/auth/google', { idToken });
        const { token, user: rawUser } = res.data.data;  // ← fix nested data

        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
        };

        await login(token, user);
      } else {
        setIsAuthenticating(false);
      }
      
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('Cancelled');
      } else {
        console.error('Google Sign-In Error:', error);
      }
      setIsAuthenticating(false);
    }
  };

  // Infinite Floating Animation Values
  const float1 = useSharedValue(0);
  const float2 = useSharedValue(0);

  useEffect(() => {
    float1.value = withRepeat(
      withSequence(withTiming(-12, { duration: 3000 }), withTiming(0, { duration: 3000 })),
      -1,
      true
    );
    float2.value = withRepeat(
      withSequence(withTiming(12, { duration: 4000 }), withTiming(0, { duration: 4000 })),
      -1,
      true
    );
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: float1.value }] }));
  const animatedStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: float2.value }] }));

  return (
    <SafeAreaView className="flex-1 bg-[#09090b]">
      {/* Premium Background Gradients */}
      <View className="absolute top-0 left-0 right-0 bottom-0 overflow-hidden">
        <View className="absolute top-0 w-full h-[50%] bg-violet-900/10 opacity-80" />
        <View className="absolute top-[10%] -right-[20%] w-[300px] h-[300px] bg-violet-600/20 rounded-full blur-[80px]" />
        <View className="absolute top-[40%] -left-[20%] w-[250px] h-[250px] bg-fuchsia-600/10 rounded-full blur-[80px]" />
      </View>

      <View className="flex-1 px-8 justify-between pt-16 pb-8">
        
        {/* Top: Branding & Typography */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="items-center z-10 mt-4">
          <View className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 items-center justify-center mb-8 shadow-2xl shadow-violet-500/20 backdrop-blur-xl">
            <Sparkles color="#a78bfa" size={36} strokeWidth={1.5} />
          </View>
          <Text className="text-white text-5xl font-black tracking-tighter mb-4 text-center leading-tight">
            DSA Revision
          </Text>
          <Text className="text-zinc-400 text-[17px] font-medium tracking-wide text-center px-6 leading-relaxed">
            Master DSA with focused revision and intuitive interactive reels.
          </Text>
        </Animated.View>

        {/* Middle: Floating Interactive Chips Map */}
        <View className="flex-1 justify-center items-center z-10 my-8">
           <View className="relative w-full h-full items-center justify-center max-w-[320px]">
             
             {/* Center Glowing Orb */}
             <Animated.View style={[animatedStyle1]} className="absolute z-0 w-32 h-32 rounded-full border border-violet-500/20 bg-violet-500/10 items-center justify-center shadow-lg shadow-violet-500/20">
               <View className="w-24 h-24 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 items-center justify-center blur-md" />
             </Animated.View>

             {/* Floating UI Elements */}
             <Animated.View entering={FadeInDown.delay(300).springify()} style={{ position: 'absolute', top: '15%', left: '0%' }}>
               <Animated.View style={animatedStyle2}>
                 <View className="flex-row items-center bg-[#18181b]/80 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full shadow-xl">
                   <Layers size={18} color="#60a5fa" className="mr-2.5" />
                   <Text className="text-white font-bold text-[15px] tracking-wide">Arrays</Text>
                 </View>
               </Animated.View>
             </Animated.View>

             <Animated.View entering={FadeInDown.delay(400).springify()} style={{ position: 'absolute', top: '25%', right: '0%' }}>
               <Animated.View style={animatedStyle1}>
                 <View className="flex-row items-center bg-[#18181b]/80 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full shadow-xl">
                   <Network size={18} color="#f472b6" className="mr-2.5" />
                   <Text className="text-white font-bold text-[15px] tracking-wide">Graphs</Text>
                 </View>
               </Animated.View>
             </Animated.View>

             <Animated.View entering={FadeInDown.delay(500).springify()} style={{ position: 'absolute', bottom: '25%', left: '5%' }}>
               <Animated.View style={animatedStyle2}>
                 <View className="flex-row items-center bg-[#18181b]/80 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full shadow-xl">
                   <Zap size={18} color="#fbbf24" className="mr-2.5" />
                   <Text className="text-white font-bold text-[15px] tracking-wide">DP</Text>
                 </View>
               </Animated.View>
             </Animated.View>

             <Animated.View entering={FadeInDown.delay(600).springify()} style={{ position: 'absolute', bottom: '15%', right: '5%' }}>
               <Animated.View style={animatedStyle1}>
                 <View className="flex-row items-center bg-[#18181b]/80 backdrop-blur-xl border border-white/10 px-5 py-3 rounded-full shadow-xl">
                   <Database size={18} color="#a78bfa" className="mr-2.5" />
                   <Text className="text-white font-bold text-[15px] tracking-wide">DBMS</Text>
                 </View>
               </Animated.View>
             </Animated.View>
           </View>
        </View>

        {/* Bottom: Authentication Action */}
        <Animated.View entering={FadeInUp.delay(700).springify()} className="w-full z-20">
          <TouchableOpacity 
            activeOpacity={0.8} 
            disabled={isAuthenticating} 
          onPress={handleGoogleLogin} 
            className={`w-full bg-white h-[60px] rounded-full flex-row items-center justify-center shadow-[0_8px_30px_rgb(255,255,255,0.15)] ${isAuthenticating ? 'opacity-80' : ''}`}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <>
                <Text className="text-[#09090b] text-[17px] font-black tracking-tight">Continue with Google</Text>
                <ArrowRight color="#09090b" size={20} className="ml-2.5" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
          <Text className="text-zinc-600 text-[13px] font-semibold text-center mt-6 tracking-wide">By continuing, you agree to our Terms of Service.</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}