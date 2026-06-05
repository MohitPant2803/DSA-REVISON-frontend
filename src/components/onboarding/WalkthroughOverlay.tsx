import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Platform, Vibration } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { GlassPanel } from '../motion/GlassPanel';
import { hapticFeedback } from '@/utils/haptics';
import { ReeWCharacter } from '@/components/ReeWCharacter';
import { TouchableOpacity } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const lightHaptic = () => {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  } else {
    Vibration.vibrate(6);
  }
};

export function WalkthroughOverlay() {
  const { step, setStep, completeWalkthrough, reelsShot, setReelsShot } = useWalkthroughStore();
  const { isAuthenticated, user } = useAuthStore();
  const isGuest = user?.id === 'guest-user';
  const { hasAppBeenAnimated } = useUIStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10) + 6;
  // Local copies for smooth transitions
  const [localStep, setLocalStep] = React.useState(step);
  const [isOverlayVisible, setIsOverlayVisible] = React.useState(false);

  React.useEffect(() => {
    if (hasAppBeenAnimated && step === 'point-reels') {
      const timer = setTimeout(() => {
        setIsOverlayVisible(true);
      }, 1200); // 500ms for bottom bar animation to finish + 700ms delay
      return () => clearTimeout(timer);
    } else {
      setIsOverlayVisible(true);
    }
  }, [hasAppBeenAnimated, step]);
  const [localReelsShot, setLocalReelsShot] = React.useState<1 | 2>(1);
  const panelOpacity = useSharedValue(1);
  const [typedText, setTypedText] = React.useState('');
  const [typingDone, setTypingDone] = React.useState(false);
  const typingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const targetTextRef = React.useRef('');

  React.useEffect(() => {
    setLocalStep(step);
    setLocalReelsShot(reelsShot);
  }, [step, reelsShot]);

  React.useEffect(() => {
    panelOpacity.value = 0;
    panelOpacity.value = withTiming(1, { duration: 400 });
  }, [localStep, localReelsShot]);

  React.useEffect(() => {
    let targetText = '';
    if (localStep === 'point-reels') {
      targetText = localReelsShot === 1 
        ? "Hi I am ReeW!! nice to meet you, I'll be giving you a tour of this app"
        : "Let me take you to the reels section first";
    } else if (localStep === 'point-myspace') {
      targetText = "tada! reels part is done, now let's explore My Space section for a bit";
    } else if (localStep === 'myspace-theme') {
      targetText = "Didn't like the theme???";
    } else if (localStep === 'myspace-settings-arrow') {
      targetText = "Don't worry we have more themes in the settings";
    } else if (localStep === 'myspace-hard-focus') {
      targetText = "Finally, tap the Hard Focus card below to view, study, and reorder all the cards you classified as Hard.";
    }
    targetTextRef.current = targetText;
    setTypedText(targetText);
    setTypingDone(true);
  }, [localStep, localReelsShot]);

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: panelOpacity.value,
  }));

  React.useEffect(() => {
    if (step === 'point-reels') {
      setReelsShot(1);
    }
  }, [step]);

  // Arrow bouncing animation
  const bounceY = useSharedValue(0);

  useEffect(() => {
    if (localStep === 'point-reels' || localStep === 'point-myspace') {
      bounceY.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 600 }),
          withTiming(0, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(bounceY);
    }
    return () => cancelAnimation(bounceY);
  }, [localStep]);

  const arrowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));



  if (
    !hasAppBeenAnimated ||
    !isOverlayVisible ||
    (localStep !== 'point-reels' &&
     localStep !== 'point-myspace' &&
     localStep !== 'myspace-theme' &&
     localStep !== 'myspace-settings-arrow' &&
     localStep !== 'myspace-hard-focus')
  ) {
    return null;
  }

  // Calculate Tab Dimensions
  const tabBarWidth = screenWidth - 64;
  const tabWidth = tabBarWidth / 3;

  // Horizontal coordinates for arrow alignments
  const reelsArrowLeft = (screenWidth - 50) / 2;
  const mySpaceArrowLeft = (32 + 2 * tabWidth) + (tabWidth - 50) / 2 + 10;

  const currentArrowLeft = localStep === 'point-reels' ? reelsArrowLeft : mySpaceArrowLeft;
  const currentArrowBottom = dockBottom + 64 + 10;

  const completeTyping = () => {
    if (!typingDone) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      setTypedText(targetTextRef.current);
      setTypingDone(true);
      return true; // typing was active, completed it
    }
    return false; // typing was already finished
  };

  const handleBackdropPress = () => {
    if (completeTyping()) return;
    if (step === 'point-reels') {
      if (reelsShot === 1) {
        lightHaptic();
        setReelsShot(2);
      }
      // If reelsShot is 2, only the reels icon button should be clickable, backdrop press does nothing!
    } else if (step === 'point-myspace') {
      lightHaptic();
      setStep('myspace-theme');
      router.replace('/(protected)/(tabs)/personal');
    } else if (step === 'myspace-theme') {
      lightHaptic();
      setStep('myspace-settings-arrow');
    } else if (step === 'myspace-settings-arrow') {
      // Tapping the card/backdrop does nothing. User must tap the Settings Cog.
    } else if (step === 'myspace-hard-focus') {
      lightHaptic();
      setStep('playlist-reorder');
      router.push({
        pathname: '/(protected)/playlist/[playlistId]',
        params: { playlistId: 'hard' }
      });
    }
  };

  const handleSkipTutorial = async () => {
    lightHaptic();
    hapticFeedback.selection();
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const walkthroughKey = isGuest ? 'guest-dsa-reels-walkthrough-complete' : 'dsa-reels-walkthrough-complete';
    const tutorialKey = isGuest ? 'guest-dsa-reels-tutorial-complete' : 'dsa-reels-tutorial-complete';
    await AsyncStorage.setItem(walkthroughKey, 'true');
    await AsyncStorage.setItem(tutorialKey, 'true');
    await completeWalkthrough();
    router.replace('/(protected)/(tabs)/learn');
  };

  const handleSignInPress = async () => {
    lightHaptic();
    hapticFeedback.selection();
    const { useAuthStore } = require('@/store/useAuthStore');
    await useAuthStore.getState().logout();
    router.replace('/(auth)/login');
  };

  // Target tab press handler
  const handleTabPress = () => {
    if (completeTyping()) return;
    lightHaptic();
    hapticFeedback.selection();

    if (step === 'point-reels') {
      setStep('reels-tutorial');
      router.replace('/(protected)/(tabs)/reels');
    } else if (step === 'point-myspace') {
      setStep('myspace-theme');
      router.replace('/(protected)/(tabs)/personal');
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* 1. Full-screen 95% visible backdrop wash (non-touch-intercepting) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.fullscreenBackdrop} />
      </View>

      {/* 2. Transparent Touch-blocking overlay over the entire screen */}
      {localStep !== 'myspace-settings-arrow' && (
        <Pressable 
          onPress={handleBackdropPress}
          style={styles.touchBlockingOverlay} 
        />
      )}

      {/* 2. Custom 4-panel blocking overlay for Settings Cog to leave exactly the Cog button touchable */}
      {localStep === 'myspace-settings-arrow' && (
        <>
          {/* Top Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 8,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Bottom Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 56,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Left Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              height: 48,
              left: 0,
              right: 56,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
          {/* Right Panel */}
          <Pressable
            onPress={handleBackdropPress}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              height: 48,
              right: 0,
              width: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.01)',
              zIndex: 9990,
            }}
          />
        </>
      )}

      {/* 2. Zen Guidance Message Box */}
      <Pressable 
        onPress={handleBackdropPress} 
        style={[
          styles.guidanceCardContainer,
          localStep === 'point-reels' ? { top: '35%', left: 32, right: 32 } : 
          localStep === 'myspace-hard-focus' ? { top: insets.top + 190, left: 20, right: 20 } : {}
        ]}
      >
        <GlassPanel 
          style={{
            ...styles.glassCard,
            borderRadius: 32,
            ...(localStep === 'point-reels' ? { transform: [{ scale: 1.1 }] } : {})
          }} 
          intensity={30} 
          tint="light" 
          borderColor="#EADEC9"
          borderRadius={32}
        >
          <Animated.View style={[{ width: '100%' }, panelAnimatedStyle]}>
            {localStep === 'point-reels' && (
              <View style={{ flexDirection: 'column', width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                  <View style={{ marginRight: 16 }}>
                    <ReeWCharacter state={localReelsShot === 1 ? "idle" : "v_fingers"} size={72} disableIdleCycle={true} />
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={[styles.body, { textAlign: 'left', marginBottom: 0 }]}>
                      {typedText}
                    </Text>
                  </View>
                </View>
                {typingDone && (
                  <Text style={[styles.tapHelperText, { textAlign: 'center', marginTop: 12 }]}>
                    {localReelsShot === 1 ? "Tap anywhere to continue" : "tap on the reel icons"}
                  </Text>
                )}
              </View>
            )}

            {localStep === 'point-myspace' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ marginRight: 16 }}>
                  <ReeWCharacter state="v_fingers" size={72} disableIdleCycle={true} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
                  <Text style={[styles.body, { textAlign: 'left', marginBottom: 0 }]}>
                    {typedText}
                  </Text>
                  <Text style={styles.tapHelperText}>Tap the My Space button</Text>
                </View>
              </View>
            )}

            {localStep === 'myspace-theme' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ marginRight: 16 }}>
                  <ReeWCharacter state="cute_sad" size={72} disableIdleCycle={true} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={[styles.body, { textAlign: 'left', marginBottom: 0 }]}>
                    {typedText}
                  </Text>
                </View>
              </View>
            )}

            {localStep === 'myspace-settings-arrow' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ marginRight: 16 }}>
                  <ReeWCharacter state="happy" size={72} disableIdleCycle={true} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
                  <Text style={[styles.body, { textAlign: 'left', marginBottom: 0 }]}>
                    {typedText}
                  </Text>
                  <Text style={styles.tapHelperText}>tap the settings</Text>
                </View>
              </View>
            )}

            {localStep === 'myspace-hard-focus' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <View style={{ marginRight: 16 }}>
                  <ReeWCharacter state="idle" size={72} disableIdleCycle={true} />
                </View>
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={[styles.body, { textAlign: 'left', marginBottom: 0 }]}>
                    {typedText}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>
        </GlassPanel>
      </Pressable>

      {/* 4. Bouncing Brown Pointing Arrow */}
      {((localStep === 'point-reels' && localReelsShot === 2) || localStep === 'point-myspace') && (
        <Animated.View
          style={[
            styles.arrowContainer,
            arrowAnimatedStyle,
            { left: currentArrowLeft, bottom: currentArrowBottom },
          ]}
        >
          <Svg width="50" height="70" viewBox="0 0 50 70" fill="none">
            {/* Handdrawn crayon feel brown pointing arrow */}
            <Path
              d="M25,5 Q25,30 25,50 M12,38 Q25,52 38,38"
              stroke="#8C6A5C"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      )}

      {localStep === 'myspace-settings-arrow' && (
        <Animated.View
          style={[
            styles.arrowContainer,
            arrowAnimatedStyle,
            { right: 20, top: insets.top + 60 },
          ]}
        >
          <Svg width="30" height="40" viewBox="0 0 30 40" fill="none">
            <Path
              d="M15,35 L15,10 M5,20 L15,8 L25,20"
              stroke="#8C6A5C"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      )}




      {/* 5. Isolated Transparent Touch Target matching the Tab button */}
      {((localStep === 'point-reels' && localReelsShot === 2) || localStep === 'point-myspace') && (
        <Pressable
          onPress={handleTabPress}
          style={[
            styles.touchTarget,
            {
              bottom: dockBottom,
              left: localStep === 'point-reels' ? 32 + tabWidth : 32 + 2 * tabWidth + 10,
              width: tabWidth,
            },
          ]}
        />
      )}

      {localStep === 'myspace-hard-focus' && (
        <Pressable
          onPress={() => {
            if (completeTyping()) return;
            lightHaptic();
            setStep('playlist-reorder');
            router.push({
              pathname: '/(protected)/playlist/[playlistId]',
              params: { playlistId: 'hard' }
            });
          }}
          style={{
            position: 'absolute',
            left: 24,
            top: insets.top + 360,
            width: (screenWidth - 48) * 0.48,
            height: 125,
            backgroundColor: 'transparent',
            zIndex: 9999,
          }}
        />
      )}

      {isAuthenticated && (
        <TouchableOpacity
          onPress={handleSkipTutorial}
          activeOpacity={0.8}
          style={[
            styles.skipButtonContainer,
            { bottom: insets.bottom + 85 }
          ]}
        >
          <Text style={styles.skipButtonText}>Skip Tutorial</Text>
        </TouchableOpacity>
      )}
      {isGuest && (
        <TouchableOpacity
          onPress={handleSignInPress}
          activeOpacity={0.8}
          style={[
            styles.skipButtonContainer,
            { bottom: insets.bottom + 85 }
          ]}
        >
          <Text style={styles.skipButtonText}>Sign In</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 9980,
  },
  touchBlockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.01)',
    zIndex: 9990,
  },
  guidanceCardContainer: {
    position: 'absolute',
    top: '30%',
    left: 20,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9995,
  },
  glassCard: {
    width: '100%',
    padding: 24,
    borderRadius: 24,
    borderColor: '#EADEC9',
    borderWidth: 1.5,
    backgroundColor: 'rgba(250, 246, 240, 0.95)',
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  headline: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C6A5C',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  mySpaceHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#8C6A5C',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3E3431',
    lineHeight: 24,
    textAlign: 'center',
  },
  tapHelperText: {
    fontSize: 10,
    color: '#8C6A5C',
    fontWeight: '700',
    opacity: 0.6,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  arrowContainer: {
    position: 'absolute',
    width: 50,
    height: 70,
    zIndex: 9995,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSpotlight: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#8C6A5C', // Zen accent
    backgroundColor: 'rgba(140, 106, 92, 0.1)',
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9993,
  },
  touchTarget: {
    position: 'absolute',
    height: 64,
    backgroundColor: 'transparent',
    borderRadius: 32,
    zIndex: 9999,
  },
  skipButtonContainer: {
    position: 'absolute',
    left: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.2,
    borderColor: '#EADEC9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#8C6A5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10005,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8C6A5C',
  },
});
