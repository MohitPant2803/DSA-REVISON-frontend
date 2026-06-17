import React from 'react';
import { View, StyleSheet, Dimensions, Platform, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop, G, Mask, Text, Ellipse, RadialGradient } from 'react-native-svg';
import { useThemePalette } from '@/hooks/useThemePalette';
import { themePalettes } from '@/theme/themePalettes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ThemeBackgroundProps {
  children?: React.ReactNode;
  style?: any;
  themeId?: 'default' | 'zen' | 'rain' | 'matcha' | 'sunset' | 'midnight';
}

interface StaticBackgroundArtProps {
  themeId: string;
}

const StaticBackgroundArt = React.memo(({ themeId }: StaticBackgroundArtProps) => {
  const palette = useThemePalette();
  const activeTheme = themeId;

  const airplaneAnim = React.useRef(new Animated.Value(-60)).current;
  const birdsAnim = React.useRef(new Animated.Value(screenWidth + 100)).current;
  const birdsFlapAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let isMounted = true;

    const animateAirplane = () => {
      if (!isMounted || activeTheme !== 'sunset') return;

      airplaneAnim.setValue(-60);
      Animated.timing(airplaneAnim, {
        toValue: screenWidth + 60,
        duration: 55000, // slow plane speed: 55 seconds
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        if (isMounted && activeTheme === 'sunset') {
          animateAirplane();
        }
      });
    };

    const animateBirds = () => {
      if (!isMounted || activeTheme !== 'sunset') return;

      birdsAnim.setValue(screenWidth + 100);
      Animated.timing(birdsAnim, {
        toValue: -100,
        duration: 16000, // faster birds speed: 16 seconds
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        if (isMounted && activeTheme === 'sunset') {
          animateBirds();
        }
      });
    };

    let flapAnimation: Animated.CompositeAnimation | null = null;

    if (activeTheme === 'sunset') {
      animateAirplane();
      animateBirds();

      birdsFlapAnim.setValue(0);
      flapAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(birdsFlapAnim, {
            toValue: 1,
            duration: 180,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(birdsFlapAnim, {
            toValue: 0,
            duration: 180,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ])
      );
      flapAnimation.start();
    }

    return () => {
      isMounted = false;
      airplaneAnim.stopAnimation();
      birdsAnim.stopAnimation();
      if (flapAnimation) {
        flapAnimation.stop();
      }
    };
  }, [activeTheme]);

  const renderBackgroundArt = () => {
    switch (activeTheme) {
      case 'zen':
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            <Defs>
              <LinearGradient id="zenSunGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#E9967A" stopOpacity="0.22" />
                <Stop offset="100%" stopColor="#FFFDF9" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            
            {/* Concentric Sand Ripple Waves in bottom-left */}
            <G opacity="0.32">
              <Circle cx="20" cy={screenHeight - 20} r="60" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="3, 4" />
              <Circle cx="20" cy={screenHeight - 20} r="100" stroke="#8C6A5C" strokeWidth="1" fill="none" />
              <Circle cx="20" cy={screenHeight - 20} r="140" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="4, 5" />
              <Circle cx="20" cy={screenHeight - 20} r="180" stroke="#8C6A5C" strokeWidth="1.5" fill="none" />
              <Circle cx="20" cy={screenHeight - 20} r="230" stroke="#8C6A5C" strokeWidth="1" fill="none" strokeDasharray="3, 3" />
            </G>

            {/* Zen Stone Outline at bottom-left */}
            <G transform={`translate(15, ${screenHeight - 65})`} opacity="0.25">
              <Path d="M 0 35 Q 20 5 45 35 Z" fill="#8C6A5C" />
              <Path d="M 28 20 Q 42 0 58 20 Z" fill="#8C6A5C" opacity="0.8" />
              <Path d="M 12 12 Q 22 2 34 12 Z" fill="#8C6A5C" opacity="0.6" />
            </G>

            {/* Glowing Sun at the top center */}
            <Circle cx={screenWidth * 0.5} cy="100" r="70" fill="url(#zenSunGlow)" />

            {/* Elegant Bamboo stalk and leaves on the top-right */}
            <G opacity="0.26" transform={`translate(${screenWidth - 100}, 20)`}>
              {/* Bamboo Stem 1 */}
              <Path d="M80,0 Q75,100 70,220" stroke="#8C6A5C" strokeWidth="2.5" fill="none" />
              <Path d="M80,0 L70,220" stroke="#FFFDF9" strokeWidth="0.8" fill="none" />
              
              {/* Bamboo Stem 2 */}
              <Path d="M92,-10 Q88,80 82,180" stroke="#8C6A5C" strokeWidth="1.8" fill="none" />

              {/* Bamboo Nodes */}
              <Circle cx="77.5" cy="50" r="2" fill="#8C6A5C" />
              <Circle cx="75" cy="110" r="2.2" fill="#8C6A5C" />
              <Circle cx="72.5" cy="170" r="2" fill="#8C6A5C" />

              {/* Bamboo Leaves */}
              <Path d="M77,50 Q40,30 20,40 Q45,55 77,50" fill="#8C6A5C" />
              <Path d="M77,50 Q50,70 30,95 Q55,80 77,50" fill="#8C6A5C" />
              
              <Path d="M75,110 Q35,105 10,125 Q35,135 75,110" fill="#8C6A5C" />
              <Path d="M75,110 Q45,130 25,165 Q50,145 75,110" fill="#8C6A5C" />
              
              <Path d="M72.5,170 Q40,180 18,210 Q42,200 72.5,170" fill="#8C6A5C" />
              <Path d="M85,30 Q110,15 125,5 Q115,25 85,30" fill="#8C6A5C" />
              <Path d="M83,90 Q115,85 130,80 Q115,100 83,90" fill="#8C6A5C" />
            </G>

            {/* Torii Gate and Hanging Yin-Yang Symbol (Centered Bottom) */}
            <G transform={`translate(${screenWidth * 0.5}, ${screenHeight}) scale(3) translate(${-screenWidth * 0.5}, ${-screenHeight * 0.88})`}>
              {/* Suspension Ropes */}
              <Path
                d={`M ${screenWidth * 0.5 - screenWidth * 0.027},${screenHeight * 0.71} L ${screenWidth * 0.5 - screenWidth * 0.018},${screenHeight * 0.80 - screenWidth * 0.05}`}
                stroke="#8C6A5C"
                strokeWidth="1.2"
                opacity={0.16}
              />
              <Path
                d={`M ${screenWidth * 0.5 + screenWidth * 0.027},${screenHeight * 0.71} L ${screenWidth * 0.5 + screenWidth * 0.018},${screenHeight * 0.80 - screenWidth * 0.05}`}
                stroke="#8C6A5C"
                strokeWidth="1.2"
                opacity={0.16}
              />

              {/* Yin-Yang Symbol */}
              {/* Outer boundary */}
              <Circle cx={screenWidth * 0.5} cy={screenHeight * 0.80} r={screenWidth * 0.055} stroke="#8C6A5C" strokeWidth="1.8" fill="none" opacity={0.16} />
              {/* Curved partition */}
              <Path
                d={`M ${screenWidth * 0.5},${screenHeight * 0.80 - screenWidth * 0.055} 
                   A ${screenWidth * 0.055},${screenWidth * 0.055} 0 0,1 ${screenWidth * 0.5},${screenHeight * 0.80 + screenWidth * 0.055} 
                   A ${screenWidth * 0.0275},${screenWidth * 0.0275} 0 0,1 ${screenWidth * 0.5},${screenHeight * 0.80} 
                   A ${screenWidth * 0.0275},${screenWidth * 0.0275} 0 0,0 ${screenWidth * 0.5},${screenHeight * 0.80 - screenWidth * 0.055} Z`}
                fill="#8C6A5C"
                opacity={0.16}
              />
              {/* Yin Eye (Dark dot matching the line color #8C6A5C - set to 0.16 opacity to be complementary) */}
              <Circle cx={screenWidth * 0.5} cy={screenHeight * 0.80 - screenWidth * 0.0275} r={screenWidth * 0.009} fill="#8C6A5C" opacity={0.16} />
              {/* Yang Eye (Light dot matching the background color #FAF6F0 - set to 0.45 opacity to be complementary and stand out) */}
              <Circle cx={screenWidth * 0.5} cy={screenHeight * 0.80 + screenWidth * 0.0275} r={screenWidth * 0.009} fill="#FAF6F0" opacity={0.45} />

              {/* Torii Gate Structure */}
              {/* Left Vertical Pillar */}
              <Rect x={screenWidth * 0.41} y={screenHeight * 0.69} width={screenWidth * 0.015} height={screenHeight * 0.19} fill="#8C6A5C" opacity={0.16} />
              {/* Right Vertical Pillar */}
              <Rect x={screenWidth * 0.575} y={screenHeight * 0.69} width={screenWidth * 0.015} height={screenHeight * 0.19} fill="#8C6A5C" opacity={0.16} />

              {/* Lower Straight Beam (Nuki) */}
              <Rect x={screenWidth * 0.37} y={screenHeight * 0.71} width={screenWidth * 0.26} height={screenHeight * 0.012} fill="#8C6A5C" opacity={0.16} />

              {/* Center Gakuzuka Strut */}
              <Rect x={screenWidth * 0.49} y={screenHeight * 0.67} width={screenWidth * 0.02} height={screenHeight * 0.04} fill="#8C6A5C" opacity={0.16} />

              {/* Top Curved Beam (Kasagi) */}
              <Path
                d={`M ${screenWidth * 0.34},${screenHeight * 0.65} 
                   Q ${screenWidth * 0.5},${screenHeight * 0.662} ${screenWidth * 0.66},${screenHeight * 0.65} 
                   L ${screenWidth * 0.66},${screenHeight * 0.672} 
                   Q ${screenWidth * 0.5},${screenHeight * 0.684} ${screenWidth * 0.34},${screenHeight * 0.672} Z`}
                fill="#8C6A5C"
                opacity={0.16}
              />
            </G>
          </Svg>
        );

      case 'rain':
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            <Defs>
              <LinearGradient id="sunnySky" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#38BDF8" />
                <Stop offset="55%" stopColor="#7DD3FC" />
                <Stop offset="100%" stopColor="#BAE6FD" />
              </LinearGradient>
            </Defs>
            
            {/* Sky Background */}
            <Rect width="100%" height="100%" fill="url(#sunnySky)" />

            {/* Glowing cartoonish bright yellow sun */}
            <G transform="translate(65, 110)">
              {/* Outer rays glow rings */}
              <Circle cx="0" cy="0" r="50" fill="#FDE047" opacity="0.08" />
              <Circle cx="0" cy="0" r="42" fill="#FDE047" opacity="0.14" />
              
              {/* Sun Core */}
              <Circle cx="0" cy="0" r="30" fill="#FBBF24" />
              
              {/* Stylized Sun Rays */}
              <Rect x="-3" y="-46" width="6" height="10" rx="3" fill="#FBBF24" />
              <Rect x="-3" y="36" width="6" height="10" rx="3" fill="#FBBF24" />
              <Rect x="-46" y="-3" width="10" height="6" rx="3" fill="#FBBF24" />
              <Rect x="36" y="-3" width="10" height="6" rx="3" fill="#FBBF24" />
              <Rect x="-3" y="-46" width="6" height="10" rx="3" fill="#FBBF24" transform="rotate(45)" />
              <Rect x="-3" y="-46" width="6" height="10" rx="3" fill="#FBBF24" transform="rotate(135)" />
              <Rect x="-3" y="-46" width="6" height="10" rx="3" fill="#FBBF24" transform="rotate(225)" />
              <Rect x="-3" y="-46" width="6" height="10" rx="3" fill="#FBBF24" transform="rotate(315)" />
            </G>

            {/* Soft white clouds floating in the sky */}
            <G opacity="0.55" transform="translate(180, 80)">
              <Path d="M 0,20 A 12,12 0 0,1 15,6 A 18,18 0 0,1 45,6 A 12,12 0 0,1 60,20 A 8,8 0 0,1 67,27 L -7,27 Z" fill="#FFFFFF" />
            </G>
            <G opacity="0.4" transform={`translate(${screenWidth - 95}, 140)`}>
              <Path d="M 0,15 A 9,9 0 0,1 11,4 A 14,14 0 0,1 33,4 A 9,9 0 0,1 44,15 L -5,15 Z" fill="#FFFFFF" />
            </G>

            {/* Cartoon layered mountains with snow caps */}
            <G opacity="0.45">
              {/* Back Mountain 1 */}
              <Path d={`M -40,${screenHeight - 120} L 80,${screenHeight - 280} L 220,${screenHeight - 120} Z`} fill="#0D9488" />
              {/* Snow cap 1 */}
              <Path d={`M 80,${screenHeight - 280} L 55,${screenHeight - 227} L 68,${screenHeight - 232} L 80,${screenHeight - 220} L 92,${screenHeight - 232} L 105,${screenHeight - 227} Z`} fill="#FFFFFF" />
            </G>
            <G opacity="0.38">
              {/* Back Mountain 2 */}
              <Path d={`M 130,${screenHeight - 90} L 260,${screenHeight - 310} L 390,${screenHeight - 90} Z`} fill="#0D9488" />
              {/* Snow cap 2 */}
              <Path d={`M 260,${screenHeight - 310} L 230,${screenHeight - 248} L 245,${screenHeight - 254} L 260,${screenHeight - 240} L 275,${screenHeight - 254} L 290,${screenHeight - 248} Z`} fill="#FFFFFF" />
            </G>

            {/* Cozy cartoon rolling green hills */}
            {/* Hill 1 */}
            <Path d={`M -50,${screenHeight - 100} Q ${screenWidth * 0.3},${screenHeight - 210} ${screenWidth * 0.75},${screenHeight - 100} L ${screenWidth * 0.75},${screenHeight} L -50,${screenHeight} Z`} fill="#16A34A" opacity="0.4" />
            {/* Hill 2 */}
            <Path d={`M ${screenWidth * 0.25},${screenHeight - 80} Q ${screenWidth * 0.7},${screenHeight - 180} ${screenWidth + 50},${screenHeight - 80} L ${screenWidth + 50},${screenHeight} L ${screenWidth * 0.25},${screenHeight} Z`} fill="#22C55E" opacity="0.55" />
            {/* Hill 3 (Main Foreground Hill) */}
            <Path d={`M -30,${screenHeight - 40} Q ${screenWidth * 0.45},${screenHeight - 130} ${screenWidth + 30},${screenHeight - 60} L ${screenWidth + 30},${screenHeight + 10} L -30,${screenHeight + 10} Z`} fill="#15803D" />

            {/* Grazing Cartoon Cows firmly grounded on the land fields */}
            {/* Cow 1: Left Grazing Cow (seated perfectly on Main Hill slope) */}
            <G transform={`translate(45, ${screenHeight - 84})`}>
              {/* Four Standing Legs */}
              <Rect x="6" y="24" width="3.5" height="10" rx="1" fill="#FFFFFF" />
              <Rect x="14" y="24" width="3.5" height="10" rx="1" fill="#FFFFFF" />
              <Rect x="30" y="24" width="3.5" height="10" rx="1" fill="#FFFFFF" />
              <Rect x="38" y="24" width="3.5" height="10" rx="1" fill="#FFFFFF" />
              {/* Hooves */}
              <Rect x="6" y="32" width="3.5" height="2.2" fill="#475569" />
              <Rect x="14" y="32" width="3.5" height="2.2" fill="#475569" />
              <Rect x="30" y="32" width="3.5" height="2.2" fill="#475569" />
              <Rect x="38" y="32" width="3.5" height="2.2" fill="#475569" />

              {/* Realistic Cow Body Contour (curved back and shoulder hump) */}
              <Path d="M0,15 C0,4 8,0 20,2 C28,3 34,6 40,3 C46,0 50,4 50,15 C50,22 46,26 40,26 C30,26 20,26 0,22 Z" fill="#FFFFFF" />
              {/* Spots */}
              <Circle cx="12" cy="7" r="4.5" fill="#1E293B" />
              <Circle cx="32" cy="16" r="6" fill="#1E293B" />
              <Circle cx="44" cy="9" r="4" fill="#1E293B" />
              
              {/* Tail with dark tip */}
              <Path d="M48,6 C52,10 52,18 50,22" stroke="#1E293B" strokeWidth="1.5" fill="none" />
              <Circle cx="50" cy="23" r="2.2" fill="#1E293B" />

              {/* Grazing Neck */}
              <Path d="M4,10 L-6,18 L-2,23 L10,12 Z" fill="#FFFFFF" />

              {/* Grazing Realistic Tapered Cow Head (rotated grazing) */}
              <G transform="rotate(25, -2, 18)">
                {/* Tapered face shape */}
                <Path d="M-8,4 C-8,-3 8,-3 8,4 C8,11 5,16 5,20 C5,22 -5,22 -5,20 C-5,16 -8,11 -8,4 Z" fill="#FFFFFF" />
                {/* Pink Muzzle Snout */}
                <Path d="M-5,16 C-5,21 5,21 5,16 C5,14 -5,14 -5,16" fill="#FDA4AF" />
                {/* Cow Eyes */}
                <Circle cx="-4.5" cy="6" r="1" fill="#1E293B" />
                <Circle cx="4.5" cy="6" r="1" fill="#1E293B" />
                {/* Horns */}
                <Path d="M-7,-1 C-10,-7 -5,-9 -3,-5 Z" fill="#E2E8F0" />
                <Path d="M7,-1 C10,-7 5,-9 3,-5 Z" fill="#E2E8F0" />
                {/* Outward Drooping Ears */}
                <Path d="M-8,1 C-12,3 -13,7 -9,6 Z" fill="#FDA4AF" />
                <Path d="M8,1 C12,3 13,7 9,6 Z" fill="#FDA4AF" />
              </G>

              {/* Cowbell */}
              <Circle cx="-2" cy="22" r="2.5" fill="#F59E0B" />
            </G>

            {/* Cow 2: Right Standing Cow (grounded securely on Hill 2 slope, scaled down for depth) */}
            <G transform={`translate(${screenWidth - 90}, ${screenHeight - 82})`} scale={0.78}>
              {/* Four Standing Legs */}
              <Rect x="4" y="18" width="2.8" height="9" rx="0.8" fill="#FFFFFF" />
              <Rect x="10" y="18" width="2.8" height="9" rx="0.8" fill="#FFFFFF" />
              <Rect x="24" y="18" width="2.8" height="9" rx="0.8" fill="#FFFFFF" />
              <Rect x="30" y="18" width="2.8" height="9" rx="0.8" fill="#FFFFFF" />
              {/* Hooves */}
              <Rect x="4" y="25" width="2.8" height="2" fill="#475569" />
              <Rect x="10" y="25" width="2.8" height="2" fill="#475569" />
              <Rect x="24" y="25" width="2.8" height="2" fill="#475569" />
              <Rect x="30" y="25" width="2.8" height="2" fill="#475569" />
              
              {/* Cow Body Contour */}
              <Path d="M0,12 C0,3 6,0 16,1 C22,2 26,4 32,2 C37,0 41,3 41,12 C41,17 38,20 32,20 C24,20 16,20 0,18 Z" fill="#FFFFFF" />
              {/* Spots */}
              <Circle cx="8" cy="5" r="3.5" fill="#1E293B" />
              <Circle cx="25" cy="12" r="5" fill="#1E293B" />
              
              {/* Tail */}
              <Path d="M38,4 C41,8 41,14 39,17" stroke="#1E293B" strokeWidth="1.2" fill="none" />
              <Circle cx="39" cy="18" r="1.8" fill="#1E293B" />

              {/* Neck & Head Connector */}
              <Path d="M1,9 L-4,3 L3,3 L5,9 Z" fill="#FFFFFF" />

              {/* Head facing forward with realistic features */}
              <G transform="translate(-4, 0)">
                {/* Tapered head structure */}
                <Path d="M-6,3 C-6,-2 6,-2 6,3 C6,9 4,13 4,16 C4,18 -4,18 -4,16 C-4,13 -6,9 -6,3 Z" fill="#FFFFFF" />
                {/* Muzzle Snout */}
                <Path d="M-4,13 C-4,17 4,17 4,13 C4,11 -4,11 -4,13" fill="#FDA4AF" />
                {/* Eyes */}
                <Circle cx="-3" cy="5" r="0.8" fill="#1E293B" />
                <Circle cx="3" cy="5" r="0.8" fill="#1E293B" />
                {/* Horns */}
                <Path d="M-5,-1 C-7,-5 -3,-6 -2,-3 Z" fill="#E2E8F0" />
                <Path d="M5,-1 C7,-5 3,-6 2,-3 Z" fill="#E2E8F0" />
                {/* Drooping Ears */}
                <Path d="M-6,0 C-9,1 -10,4 -7,3 Z" fill="#FDA4AF" />
                <Path d="M6,0 C9,1 10,4 7,3 Z" fill="#FDA4AF" />
              </G>
            </G>
          </Svg>
        );

      case 'matcha':
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            {/* Elegant tea leaves at the top-right */}
            <G opacity="0.18" transform={`translate(${screenWidth - 120}, -20)`}>
              <Path d="M0,80 C60,40 100,40 140,80 C100,120 60,120 0,80" fill="#4A704C" />
              <Path d="M0,80 C60,40 120,60 140,80" stroke="#F1F5E9" strokeWidth="1" fill="none" />
              
              <Path d="M20,130 C70,100 110,110 130,140 C90,170 50,160 20,130" fill="#4A704C" transform="rotate(-15, 20, 130)" />
              <Path d="M30,50 C80,20 110,40 130,70 C90,90 60,80 30,50" fill="#4A704C" transform="rotate(30, 30, 50)" />
            </G>

            {/* Cozy tea whisk and matcha bowl illustration in bottom-right */}
            <G opacity="0.12" transform={`translate(${screenWidth - 130}, ${screenHeight - 165})`}>
              {/* Matcha Bowl */}
              <Path d="M 10,70 Q 10,115 55,115 Q 100,115 100,70 L 90,70 Q 90,103 55,103 Q 20,103 20,70 Z" fill="#4A704C" />
              <Rect x="43" y="115" width="24" height="4" rx="2" fill="#4A704C" />

              {/* Tea Spoon / Whisk handle stick resting */}
              <Path d="M-22,64 L50,86 L48,91 L-24,69 Z" fill="#4A704C" transform="rotate(-15, 14, 75)" />
            </G>
            
            {/* Bottom Left decorative leaf */}
            <G opacity="0.13" transform="translate(-10, 480)">
              <Path d="M0,40 C40,20 80,30 100,60 C70,80 30,70 0,40" fill="#4A704C" transform="rotate(25, 0, 40)" />
            </G>
          </Svg>
        );

      case 'sunset':
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            <Defs>
              <LinearGradient id="sunsetGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#FFE4D6" stopOpacity="0.8" />
                <Stop offset="45%" stopColor="#FFD3C4" />
                <Stop offset="100%" stopColor="#FFF3EE" />
              </LinearGradient>
            </Defs>
            
            <Rect width="100%" height="100%" fill="url(#sunsetGradient)" />

            {/* Glowing Sunset Sun on Horizon */}
            <Circle cx={screenWidth * 0.3} cy="180" r="42" fill="#E05A47" opacity="0.14" />
            <Circle cx={screenWidth * 0.3} cy="180" r="30" fill="#E05A47" opacity="0.16" />

            {/* Distant Mountain Silhouettes at bottom */}
            <G opacity="0.18">
              <Path d={`M 0,${screenHeight - 110} Q ${screenWidth * 0.3},${screenHeight - 160} ${screenWidth * 0.65},${screenHeight - 110} T ${screenWidth},${screenHeight - 90} L ${screenWidth},${screenHeight} L 0,${screenHeight} Z`} fill="#D9534F" />
              <Path d={`M 0,${screenHeight - 70} Q ${screenWidth * 0.5},${screenHeight - 110} ${screenWidth},${screenHeight - 65} L ${screenWidth},${screenHeight} L 0,${screenHeight} Z`} fill="#4A2A20" opacity="0.25" />
            </G>

            {/* Delicate Japanese Maple Autumn Leaves top-right */}
            <G opacity="0.24" transform={`translate(${screenWidth - 90}, 20)`}>
              {/* Branch */}
              <Path d="M90,-10 C60,40 30,70 -10,90" stroke="#7D574E" strokeWidth="1.5" fill="none" />
              
              {/* Maple Leaf 1 */}
              <Path d="M40,50 L42,38 L30,45 L32,32 L20,30 L32,24 L28,12 L38,20 L48,15 L44,28 L54,34 L44,38 Z" fill="#E05A47" transform="rotate(-15, 40, 50)" />
              <Path d="M40,50 L52,58 M40,50 L42,38 M40,50 L30,45 M40,50 L32,32 M40,50 L20,30" stroke="#7D574E" strokeWidth="0.6" />

              {/* Maple Leaf 2 */}
              <Path d="M72,22 L73,12 L63,18 L64,7 L54,6 L64,1 L60,-9 L69,-3 L77,-7 L74,4 L82,9 L74,12 Z" fill="#E05A47" transform="scale(0.85) translate(30, 20)" />
            </G>
          </Svg>
        );

      case 'midnight':
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            <Defs>
              <LinearGradient id="midnightGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#030509" />
                <Stop offset="65%" stopColor="#050810" />
                <Stop offset="100%" stopColor="#090E1A" />
              </LinearGradient>
              <LinearGradient id="lampCone" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#FCD34D" stopOpacity="0.14" />
                <Stop offset="100%" stopColor="#FCD34D" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            
            <Rect width="100%" height="100%" fill="url(#midnightGradient)" />

            {/* Highly visible glowing stars */}
            <G opacity="0.95">
              <Circle cx="30" cy="80" r="1.2" fill="#FFFFFF" />
              <Circle cx="80" cy="140" r="1.8" fill="#FFFFFF" opacity="0.8" />
              <Circle cx="130" cy="60" r="1" fill="#FFFFFF" />
              <Circle cx={screenWidth * 0.45} cy="100" r="1.5" fill="#FFFFFF" opacity="0.85" />
              <Circle cx={screenWidth * 0.72} cy="180" r="1.2" fill="#FFFFFF" />
              <Circle cx={screenWidth - 140} cy="120" r="2" fill="#FFFFFF" opacity="0.95" />
              <Circle cx="50" cy="280" r="1.5" fill="#FFFFFF" opacity="0.75" />
              <Circle cx={screenWidth - 50} cy="290" r="1.2" fill="#FFFFFF" />
              <Circle cx="120" cy="400" r="1.8" fill="#FFFFFF" opacity="0.8" />
              
              {/* Scattered extra stars */}
              <Circle cx="190" cy="200" r="1.2" fill="#FFFFFF" opacity="0.7" />
              <Circle cx="260" cy="90" r="1.5" fill="#FFFFFF" opacity="0.8" />
              <Circle cx="310" cy="220" r="1" fill="#FFFFFF" opacity="0.65" />
              
              {/* Premium twinkling tapered cross stars */}
              <Path d="M150,70 Q150,78 158,78 Q150,78 150,86 Q150,78 142,78 Q150,78 150,70" fill="#FFFFFF" />
              <Path d="M70,220 Q70,226 76,226 Q70,226 70,232 Q70,226 64,226 Q70,226 70,220" fill="#FFFFFF" opacity="0.9" />
              <Path d="M280,140 Q280,147 287,147 Q280,147 280,154 Q280,147 273,147 Q280,147 280,140" fill="#FFFFFF" opacity="0.95" />
            </G>

            {/* Crescent Moon outline shifted to ~60% from left to avoid Panda obstruction */}
            <G transform={`translate(${screenWidth * 0.6 - 20}, 60)`}>
              {/* Outer Glow */}
              <Circle cx="20" cy="20" r="32" fill="#FFF" opacity="0.02" />
              <Circle cx="20" cy="20" r="22" fill="#FFF" opacity="0.04" />
              
              {/* Moon crescent */}
              <Path d="M 12 4 A 18 18 0 1 0 36 28 A 15 15 0 1 1 12 4 Z" fill="#FFF" opacity="0.8" />
              <Path d="M 12 4 A 18 18 0 1 0 36 28 A 15 15 0 1 1 12 4 Z" stroke="#818CF8" strokeWidth="0.9" fill="none" opacity="0.5" />
            </G>

            {/* Warm study lamp cone glow bottom-right */}
            <G transform={`translate(${screenWidth - 110}, ${screenHeight - 190})`}>
              {/* Lamp head contour */}
              <Path d="M 60,30 C 50,20 20,40 10,70" stroke="#818CF8" strokeWidth="1.5" fill="none" opacity="0.25" />
              <Path d="M 50,45 L -280,180 L 10,180 Z" fill="url(#lampCone)" />

            </G>
            {/* Real IIT Kharagpur Main Building silhouette (Modernist central block with left tower and wings) */}
            <G opacity="0.8" transform={`translate(${screenWidth * 0.08}, ${screenHeight}) scale(1.25) translate(${-screenWidth * 0.08}, ${-screenHeight})`}>
              {/* === BASE GROUND FILL === */}
              <Rect x={0} y={screenHeight * 0.85} width={screenWidth} height={screenHeight * 0.15} fill="#1C2A40" />

              {/* === LEFT WING === */}
              <Rect x={screenWidth * 0.02} y={screenHeight * 0.81} width={screenWidth * 0.05} height={screenHeight * 0.04} fill="#1C2A40" />

              {/* === RIGHT WING === */}
              <Rect x={screenWidth * 0.72} y={screenHeight * 0.81} width={screenWidth * 0.26} height={screenHeight * 0.04} fill="#1C2A40" />

              {/* === MAIN CENTRAL BLOCK === */}
              <Rect x={screenWidth * 0.18} y={screenHeight * 0.74} width={screenWidth * 0.54} height={screenHeight * 0.11} fill="#1C2A40" />

              {/* === TEXT ON THE UPPER BORDER === */}
              <Text
                x={screenWidth * 0.47}
                y={screenHeight * 0.755}
                fill="#FFFFFF"
                fontSize={5.5}
                fontWeight="500"
                textAnchor="middle"
                letterSpacing={0.3}
              >
                Dedicated to the service of the Nation
              </Text>

              {/* === VERTICAL COLUMN OPENINGS (SLITS) ON CENTRAL BLOCK === */}
              {/* The spaces between the columns on the main facade, matching the dark background */}
              <Rect x={screenWidth * 0.25} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.315} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.38} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.445} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.51} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.575} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.64} y={screenHeight * 0.77} width={screenWidth * 0.02} height={screenHeight * 0.035} fill="#050810" />

              {/* === FOREGROUND ENTRANCE PORTICO === */}
              <Rect x={screenWidth * 0.34} y={screenHeight * 0.80} width={screenWidth * 0.28} height={screenHeight * 0.05} fill="#243246" />
              {/* Portico openings */}
              <Rect x={screenWidth * 0.41} y={screenHeight * 0.815} width={screenWidth * 0.03} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.465} y={screenHeight * 0.815} width={screenWidth * 0.03} height={screenHeight * 0.035} fill="#050810" />
              <Rect x={screenWidth * 0.52} y={screenHeight * 0.815} width={screenWidth * 0.03} height={screenHeight * 0.035} fill="#050810" />

              {/* === TALL TOWER (LEFT SIDE) === */}
              {/* Left stepped vertical section */}
              <Rect x={screenWidth * 0.07} y={screenHeight * 0.62} width={screenWidth * 0.03} height={screenHeight * 0.23} fill="#1C2A40" />
              {/* Stepped section window slits */}
              <Rect x={screenWidth * 0.075} y={screenHeight * 0.65} width={screenWidth * 0.015} height={screenHeight * 0.01} fill="#050810" />
              <Rect x={screenWidth * 0.075} y={screenHeight * 0.70} width={screenWidth * 0.015} height={screenHeight * 0.01} fill="#050810" />
              <Rect x={screenWidth * 0.075} y={screenHeight * 0.75} width={screenWidth * 0.015} height={screenHeight * 0.01} fill="#050810" />
              <Rect x={screenWidth * 0.075} y={screenHeight * 0.80} width={screenWidth * 0.015} height={screenHeight * 0.01} fill="#050810" />

              {/* Main tower shaft */}
              <Rect x={screenWidth * 0.10} y={screenHeight * 0.53} width={screenWidth * 0.08} height={screenHeight * 0.32} fill="#1C2A40" />

              {/* Tower observation/gallery cap (slightly inset) */}
              <Rect x={screenWidth * 0.11} y={screenHeight * 0.50} width={screenWidth * 0.06} height={screenHeight * 0.03} fill="#243246" />

              {/* Tower top roof lip */}
              <Rect x={screenWidth * 0.10} y={screenHeight * 0.495} width={screenWidth * 0.08} height={screenHeight * 0.005} fill="#1C2A40" />

              {/* === FOREGROUND OVAL LAWN & STATUE PEDESTAL === */}
              {/* Sits in front of the portico, matching the lawn layout of the real building */}
              <Ellipse
                cx={screenWidth * 0.47}
                cy={screenHeight * 0.93}
                rx={screenWidth * 0.27}
                ry={screenHeight * 0.045}
                fill="#243246"
              />
              {/* Central monument/pedestal silhouette */}
              <Rect
                x={screenWidth * 0.466}
                y={screenHeight * 0.87}
                width={screenWidth * 0.008}
                height={screenHeight * 0.015}
                fill="#1C2A40"
              />
            </G>
          </Svg>
        );

      case 'default':
      default:
        return (
          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            {/* The default premium ambient orbs to maintain identical visual looks */}
            <Circle cx={screenWidth + 60} cy="250" r="250" fill="rgba(139, 92, 246, 0.024)" />
            <Circle cx="-100" cy={screenHeight - 150} r="225" fill="rgba(245, 158, 11, 0.018)" />
          </Svg>
        );
    }
  };

  const wingsUpOpacity = birdsFlapAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 1],
  });

  const wingsDownOpacity = birdsFlapAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  return (
    <>
      {renderBackgroundArt()}
      {activeTheme === 'sunset' && (
        <>
          {/* Animated Airplane */}
          <Animated.View
            style={{
              position: 'absolute',
              top: screenHeight * 0.42,
              left: 0,
              width: 50,
              height: 30,
              transform: [{ translateX: airplaneAnim }],
              opacity: 0.12,
            }}
            pointerEvents="none"
          >
            <Svg width="50" height="30" viewBox="0 0 50 30">
              <Path
                d="M 40,15 L 25,14 L 15,5 L 12,5 L 16,13 L 5,13 L 2,10 L 0,10 L 2,15 L 0,15 L 2,20 L 0,20 L 2,17 L 5,17 L 16,17 L 12,25 L 15,25 L 25,16 Z"
                fill="#E05A47"
              />
            </Svg>
          </Animated.View>

          {/* Animated Flock of Birds */}
          <Animated.View
            style={{
              position: 'absolute',
              top: screenHeight * 0.60,
              left: 0,
              width: 100,
              height: 40,
              transform: [
                { translateX: birdsAnim },
                { scale: 0.55 } // scaled down to make them smaller, like before
              ],
              opacity: 0.16,
            }}
            pointerEvents="none"
          >
            {/* Frame 1: Wings Up */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: wingsUpOpacity }]}>
              <Svg width="100" height="40" viewBox="0 0 100 40">
                <G fill="#E05A47">
                  {/* Bird 1: Center/Leader (pronounced wings) */}
                  <Path d="M 40,15 Q 55,0 70,15 Q 85,0 100,15 Q 70,27 40,15 Z" />
                  {/* Bird 2: Top-Left (pronounced wings) */}
                  <Path d="M 15,6 Q 25,-4 35,6 Q 45,-4 55,6 Q 35,14 15,6 Z" />
                  {/* Bird 3: Bottom-Left (pronounced wings) */}
                  <Path d="M 0,28 Q 10,18 20,28 Q 30,18 40,28 Q 20,36 0,28 Z" />
                </G>
              </Svg>
            </Animated.View>

            {/* Frame 2: Wings Down */}
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: wingsDownOpacity }]}>
              <Svg width="100" height="40" viewBox="0 0 100 40">
                <G fill="#E05A47">
                  {/* Bird 1: Center/Leader ( pronounced wings down) */}
                  <Path d="M 40,15 Q 55,23 70,15 Q 85,23 100,15 Q 70,8 40,15 Z" />
                  {/* Bird 2: Top-Left (pronounced wings down) */}
                  <Path d="M 15,6 Q 25,12 35,6 Q 45,12 55,6 Q 35,1 15,6 Z" />
                  {/* Bird 3: Bottom-Left (pronounced wings down) */}
                  <Path d="M 0,28 Q 10,34 20,28 Q 30,34 40,28 Q 20,22 0,28 Z" />
                </G>
              </Svg>
            </Animated.View>
          </Animated.View>
        </>
      )}
    </>
  );
}, (prev, next) => prev.themeId === next.themeId);

export const ThemeBackground = React.memo(({ children, style, themeId }: ThemeBackgroundProps) => {
  const palette = useThemePalette();
  const activeTheme = themeId || palette.id;
  const currentPalette = themeId ? (themePalettes[themeId] || palette) : palette;

  return (
    <View style={[styles.container, { backgroundColor: currentPalette.background }, style]}>
      <StaticBackgroundArt themeId={activeTheme} />
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
});

export default ThemeBackground;
