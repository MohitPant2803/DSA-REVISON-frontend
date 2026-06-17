export interface ThemePalette {
  id: 'default' | 'zen' | 'rain' | 'matcha' | 'sunset' | 'midnight';
  name: string;
  isDark: boolean;
  background: string;
  surface: string;            // Card background color
  surfaceElevated: string;    // Elevated surface background color (Dialogs, secondary sheets)
  readingSurface: string;     // Dedicated flashcard surface
  readingBorder: string;      // Dedicated flashcard border
  readingDivider: string;     // Dedicated flashcard divider
  border: string;             // Main component border
  textPrimary: string;        // Primary high contrast text
  textSecondary: string;      // Secondary medium contrast text
  textMuted: string;          // Muted text and placeholders
  accent: string;             // Accent color
  accentBg: string;           // Translucent/soft background for selected states
  inputBg: string;            // Form input background
  success: string;            // Success status color
  warning: string;            // Warning status color
  error: string;              // Error status color
  info: string;               // Information status color
  shadow: string;             // Shadow color
  navActive: string;          // Active nav tab
  navInactive: string;        // Inactive nav tab
  navBackground: string;      // Bottom bar/nav background
  dialogBg: string;           // Modal/dialog card background
  overlayBg: string;          // Screen overlay backdrop background
  focusRing: string;          // Interactive focus outline color
  accentGlow: string;         // Understated highlight glow color
  animationFast: number;      // Animation duration fast (ms)
  animationNormal: number;    // Animation duration normal (ms)
  animationSlow: number;      // Animation duration slow (ms)
}

export function addAlpha(hexColor: string, opacity: number): string {
  'worklet';
  if (!hexColor) return 'transparent';
  if (hexColor.startsWith('#')) {
    const hex = hexColor.replace('#', '');
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (hexColor.startsWith('rgba')) {
    return hexColor.replace(/,[\s\d.]+\)$/, `, ${opacity})`);
  }
  return hexColor;
}

export const themePalettes: Record<ThemePalette['id'], ThemePalette> = {
  default: {
    id: 'default',
    name: 'Default',
    isDark: false,
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    readingSurface: '#FAFBFD',
    readingBorder: '#E2E8F0',
    readingDivider: '#F1F5F9',
    border: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    accent: '#6366F1',
    accentBg: '#EEF2FF',
    inputBg: '#F1F5F9',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    shadow: 'rgba(15, 23, 42, 0.08)',
    navActive: '#6366F1',
    navInactive: '#94A3B8',
    navBackground: '#FFFFFF',
    dialogBg: '#FFFFFF',
    overlayBg: 'rgba(15, 23, 42, 0.45)',
    focusRing: 'rgba(99, 102, 241, 0.35)',
    accentGlow: 'rgba(99, 102, 241, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
  zen: {
    id: 'zen',
    name: 'Japanese Zen Garden',
    isDark: false,
    background: '#FAF6F0',
    surface: '#FFFDF9',
    surfaceElevated: '#F4EFEB',
    readingSurface: '#FFFDF9',
    readingBorder: '#E5DCCB',
    readingDivider: '#FAF6F0',
    border: '#E5DCCB',
    textPrimary: '#2D2522',
    textSecondary: '#5A504B',
    textMuted: '#968B84',
    accent: '#7E5B4E',
    accentBg: '#F3ECE0',
    inputBg: '#EFE9DC',
    success: '#608066',
    warning: '#D48D55',
    error: '#B34E45',
    info: '#50768C',
    shadow: 'rgba(45, 37, 34, 0.08)',
    navActive: '#7E5B4E',
    navInactive: '#968B84',
    navBackground: '#FFFDF9',
    dialogBg: '#FFFDF9',
    overlayBg: 'rgba(45, 37, 34, 0.45)',
    focusRing: 'rgba(126, 91, 78, 0.35)',
    accentGlow: 'rgba(126, 91, 78, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
  rain: {
    id: 'rain',
    name: 'Sunny Mountain ⛰️',
    isDark: false,
    background: '#E0F2FE',
    surface: '#FFFFFF',
    surfaceElevated: '#F0F9FF',
    readingSurface: '#FCFDFF',
    readingBorder: '#BAE6FD',
    readingDivider: '#E0F2FE',
    border: '#BAE6FD',
    textPrimary: '#031E2E',
    textSecondary: '#0B4A75',
    textMuted: '#0A527A',
    accent: '#0D9488',
    accentBg: '#F0FDFA',
    inputBg: '#F0F9FF',
    success: '#059669',
    warning: '#D97706',
    error: '#DC2626',
    info: '#2563EB',
    shadow: 'rgba(3, 30, 46, 0.08)',
    navActive: '#0D9488',
    navInactive: '#0A527A',
    navBackground: '#FFFFFF',
    dialogBg: '#FFFFFF',
    overlayBg: 'rgba(3, 30, 46, 0.45)',
    focusRing: 'rgba(13, 148, 136, 0.35)',
    accentGlow: 'rgba(13, 148, 136, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
  matcha: {
    id: 'matcha',
    name: 'Matcha Calm',
    isDark: false,
    background: '#F2F5EB',
    surface: '#FCFEFC',
    surfaceElevated: '#EFF4EC',
    readingSurface: '#FCFEFC',
    readingBorder: '#DFE8D9',
    readingDivider: '#F2F5EB',
    border: '#DFE8D9',
    textPrimary: '#202B21',
    textSecondary: '#48594A',
    textMuted: '#7FA182',
    accent: '#3E6140',
    accentBg: '#EFF4EC',
    inputBg: '#E6ECDE',
    success: '#3E6140',
    warning: '#C27D38',
    error: '#A83E3E',
    info: '#3D5A80',
    shadow: 'rgba(32, 43, 33, 0.08)',
    navActive: '#3E6140',
    navInactive: '#7FA182',
    navBackground: '#FCFEFC',
    dialogBg: '#FCFEFC',
    overlayBg: 'rgba(32, 43, 33, 0.45)',
    focusRing: 'rgba(62, 97, 64, 0.35)',
    accentGlow: 'rgba(62, 97, 64, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
  sunset: {
    id: 'sunset',
    name: 'Crimson Sunset',
    isDark: false,
    background: '#FFF3ED',
    surface: '#FFFEFD',
    surfaceElevated: '#FFF0EB',
    readingSurface: '#FFFEFD',
    readingBorder: '#F7DFD3',
    readingDivider: '#FFF3ED',
    border: '#F7DFD3',
    textPrimary: '#3A1E16',
    textSecondary: '#6B473D',
    textMuted: '#A7847B',
    accent: '#D84C37',
    accentBg: '#FFF0EB',
    inputBg: '#FFEBE0',
    success: '#2E7D32',
    warning: '#E65100',
    error: '#C62828',
    info: '#1565C0',
    shadow: 'rgba(58, 30, 22, 0.08)',
    navActive: '#D84C37',
    navInactive: '#A7847B',
    navBackground: '#FFFEFD',
    dialogBg: '#FFFEFD',
    overlayBg: 'rgba(58, 30, 22, 0.45)',
    focusRing: 'rgba(216, 76, 55, 0.35)',
    accentGlow: 'rgba(216, 76, 55, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Focus',
    isDark: true,
    background: '#050814',
    surface: '#111827',
    surfaceElevated: '#1A2335',
    readingSurface: '#0D1628',
    readingBorder: 'rgba(148, 163, 184, 0.12)',
    readingDivider: 'rgba(148, 163, 184, 0.08)',
    border: 'rgba(148, 163, 184, 0.18)',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    accent: '#8B5CF6',
    accentBg: 'rgba(139, 92, 246, 0.12)',
    inputBg: 'rgba(10, 16, 32, 0.65)',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#38BDF8',
    shadow: 'rgba(0, 0, 0, 0.45)',
    navActive: '#8B5CF6',
    navInactive: '#94A3B8',
    navBackground: '#111827',
    dialogBg: '#1A2335',
    overlayBg: 'rgba(0, 0, 0, 0.65)',
    focusRing: 'rgba(139, 92, 246, 0.35)',
    accentGlow: 'rgba(139, 92, 246, 0.18)',
    animationFast: 150,
    animationNormal: 300,
    animationSlow: 500,
  },
};

