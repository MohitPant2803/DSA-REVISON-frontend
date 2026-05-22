import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Sparkles, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/services/api';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: true,
});

export default function LoginScreen() {
  const { login } = useAuthStore();
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSkipLogin = async () => {
    try {
      setIsAuthenticating(true);
      
      // Use an empty string token to prevent backend JWT validation from throwing 401 errors on public guest routes
      const mockToken = "";
      const mockUser = {
        id: "guest-user",
        name: "Guest Explorer",
        email: "guest@dsa-reels.com",
        avatarUrl: "https://ui-avatars.com/api/?name=Guest",
        role: "user" as const,
      };

      // Update store state
      await login(mockToken, mockUser);

      // Navigate immediately and then reset local loading state
      // This prevents the layout from seeing a "partially logged in" state
      router.replace('/(protected)/(tabs)/learn');
      setIsAuthenticating(false);
    } catch (error) {
      console.error('Skip login error:', error);
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsAuthenticating(true);

      await GoogleSignin.hasPlayServices();
      try {
        await GoogleSignin.signOut();
      } catch {
      }

      const userInfo = await GoogleSignin.signIn();

      if (userInfo.type === 'success') {
        const { idToken } = userInfo.data;
        if (!idToken) {
          throw new Error('Google Sign-In failed: No ID Token returned.');
        }

        const res = await api.post('/auth/google', { idToken });
        const { token, user: rawUser } = res.data.data;

        const user = {
          id: rawUser._id,
          name: rawUser.name,
          email: rawUser.email,
          avatarUrl: rawUser.profilePicture,
          role: rawUser.role,
        };

        await login(token, user);
        
        // Navigate to the main app screen
        router.replace('/(protected)/(tabs)/reels');
      } else {
        setIsAuthenticating(false);
      }
    } catch (error: any) {
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.error('Google Sign-In Error:', error);
      }
      setIsAuthenticating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-8 justify-between pt-20 pb-10">
        <Animated.View entering={FadeInDown.duration(400)} className="items-center mt-8">
          <View
            className="w-16 h-16 rounded-2xl border border-slate-100 items-center justify-center mb-8"
            style={{ backgroundColor: 'rgba(255,255,255,0.82)' }}
          >
            <Sparkles color="#8B5CF6" size={28} strokeWidth={1.5} />
          </View>
          <Text className="text-[#0F172A] text-[36px] font-normal tracking-tight mb-4 text-center">
            DSA Revision
          </Text>
          <Text className="text-[#64748B] text-[17px] leading-relaxed text-center px-4">
            A calm, focused companion for mastering algorithms.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(400)} className="w-full">
          <TouchableOpacity
            activeOpacity={0.92}
            disabled={isAuthenticating}
            onPress={handleGoogleLogin}
            className={`w-full h-[56px] rounded-full flex-row items-center justify-center ${
              isAuthenticating ? 'opacity-80' : ''
            }`}
            style={{ backgroundColor: '#0F172A' }}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text className="text-white text-[16px] font-normal tracking-tight">
                  Continue with Google
                </Text>
                <ArrowRight color="#fff" size={18} className="ml-2" strokeWidth={2} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isAuthenticating}
            onPress={handleSkipLogin}
            className="w-full h-[56px] rounded-full flex-row items-center justify-center mt-4 border border-slate-200"
            style={{ backgroundColor: 'transparent' }}
          >
            <Text className="text-[#64748B] text-[16px] font-medium">
              Skip for now
            </Text>
          </TouchableOpacity>

          <Text className="text-[#94A3B8] text-[13px] text-center mt-6">
            By continuing, you agree to our Terms of Service.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
