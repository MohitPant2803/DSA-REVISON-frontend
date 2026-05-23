import { Easing, WithSpringConfig } from 'react-native-reanimated';

/**
 * Premium physical spring configurations representing Apple-level motion polish.
 * Damping, stiffness, and mass are precisely calibrated to represent realistic material properties.
 */
export const springPresets = {
  // Tactile buttons, selectors, checkbox completions (springy, snappy)
  bouncy: {
    damping: 14,
    stiffness: 220,
    mass: 0.8,
  } as WithSpringConfig,

  // Reels card swipe snapping and swipe-out transitions (high resistance, snappy reset)
  snappy: {
    damping: 18,
    stiffness: 280,
    mass: 0.9,
  } as WithSpringConfig,

  // Smooth sliding panels, expandable lists, sheets (fluid, gentle)
  gentle: {
    damping: 24,
    stiffness: 160,
    mass: 1.0,
  } as WithSpringConfig,

  // Glowing mesh background, voice waveforms, breathing rings (low frequency, liquid drift)
  liquid: {
    damping: 32,
    stiffness: 80,
    mass: 1.3,
  } as WithSpringConfig,

  // Micro scale offsets, fast toggle swaps, state updates (ultra-responsive, stiff)
  stiff: {
    damping: 12,
    stiffness: 350,
    mass: 0.6,
  } as WithSpringConfig,
};

/**
 * Standardized easing curves for linear/bezier transitions.
 */
export const easings = {
  cubicBezier: Easing.bezier(0.25, 0.1, 0.25, 1),
  easeOutExpo: Easing.bezier(0.16, 1, 0.3, 1),
  easeInExpo: Easing.bezier(0.7, 0, 0.84, 0),
};

/**
 * Transition specifications for UI screens and elements.
 */
export const transitionPresets = {
  fade: {
    duration: 350,
    easing: easings.cubicBezier,
  },
  slideIn: {
    duration: 400,
    easing: easings.easeOutExpo,
  },
  scaleOut: {
    duration: 300,
    easing: easings.easeInExpo,
  },
};

/**
 * Highly optimized Reanimated Worklet math helpers running strictly on the UI thread.
 * These calculate interactive distances, velocities, and layout parameters at sub-millisecond speeds.
 */
export const motionUtils = {
  /**
   * Safe clamp worklet.
   */
  clamp: (val: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(val, min), max);
  },

  /**
   * Interpolate value to coordinate layout percentages.
   */
  lerp: (start: number, end: number, amt: number) => {
    'worklet';
    return (1 - amt) * start + amt * end;
  },

  /**
   * Calculates swipe physics decay vector based on initial flick velocity.
   */
  calculateSwipeDecay: (velocity: number, dragDistance: number, boundary: number) => {
    'worklet';
    // Calculate inertia weight
    const inertia = velocity * 0.12;
    const totalImpact = dragDistance + inertia;
    
    if (Math.abs(totalImpact) > boundary) {
      return totalImpact > 0 ? 1 : -1; // Positive or negative swipe-out
    }
    return 0; // Snapback
  },
};
