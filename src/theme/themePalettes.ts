export interface ThemePalette {
  id: 'default' | 'zen' | 'rain' | 'matcha' | 'sunset' | 'midnight';
  name: string;
  isDark: boolean;
  background: string;
  surface: string;            // Card background color (mostly solid or translucent)
  border: string;             // Card/divider border color
  textPrimary: string;        // Dominant text color
  textSecondary: string;      // Supporting subtext color
  textMuted: string;          // Super-muted grey / placeholders
  accent: string;             // Dominant theme action color (replaces old purple #8B5CF6)
  accentBg: string;           // Soft active badge backdrop
  inputBg: string;            // Input and form fields background color
}

export const themePalettes: Record<ThemePalette['id'], ThemePalette> = {
  default: {
    id: 'default',
    name: 'Default',
    isDark: false,
    background: '#F8FAFC', // Modern cool slate off-white
    surface: '#FFFFFF', // Clean white card surface
    border: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    accent: '#8B5CF6',
    accentBg: '#F5F3FF',
    inputBg: '#F1F5F9', // Sleek modern light grey input background
  },
  zen: {
    id: 'zen',
    name: 'Japanese Zen Garden',
    isDark: false,
    background: '#FAF6F0', // Soft sand cream
    surface: '#FFFDF9', // Solid sand white
    border: '#EADEC9', // Elegant clay ripple border
    textPrimary: '#3E3431', // Soothing dark charcoal-brown
    textSecondary: '#6C5F5B', // Soft terracotta subtext
    textMuted: '#9E8E89', // Sand grey
    accent: '#8C6A5C', // Earthy pottery terracotta
    accentBg: '#F1ECE6',
    inputBg: '#EFEAE4',
  },
  rain: {
    id: 'rain',
    name: 'Sunny Mountain ⛰️',
    isDark: false,
    background: '#7DD3FC', // Bright Sky Blue
    surface: '#FFFFFF', // Clean Card White
    border: '#E0F2FE', // Light Sky Blue Outline
    textPrimary: '#0C4A6E', // Deep Ocean Blue for High Contrast
    textSecondary: '#0369A1', // Slate Blue Subtext
    textMuted: '#0284C7', // Sky Blue Muted
    accent: '#0284C7', // Sleek Sky Blue (non-yellowish, premium)
    accentBg: '#E0F2FE', // Soft Light Blue Backdrop
    inputBg: '#F0F9FF', // Light sky blue input base
  },
  matcha: {
    id: 'matcha',
    name: 'Matcha Calm',
    isDark: false,
    background: '#F1F5E9', // Soothing pale organic matcha green
    surface: '#FCFEFC', // Solid tea white leaf glow
    border: '#DFE8D9', // Organic leaf boundary
    textPrimary: '#2D3B2E', // Deep ceremony green-black
    textSecondary: '#5A6E5C', // Muted sage green
    textMuted: '#8BA18D', // Soft pale willow
    accent: '#4A704C', // Traditional whisk matcha green
    accentBg: '#EDF4EB',
    inputBg: '#E7ECE0',
  },
  sunset: {
    id: 'sunset',
    name: 'Crimson Sunset',
    isDark: false,
    background: '#FFF3EE', // Soft warm sunset sky glow
    surface: '#FFFEFD', // Solid sunset peach-white
    border: '#F6E1D7', // Soft warm coral border
    textPrimary: '#4D2A20', // Warm cherry mahogany
    textSecondary: '#7D574E', // Muted sunset clay
    textMuted: '#B28E84', // Soft warm dusty rose
    accent: '#E05A47', // Glowing sun crimson
    accentBg: '#FFF1ED',
    inputBg: '#FFF0E7',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Focus',
    isDark: true,
    background: '#030509', // Darkened deep focus midnight navy-black
    surface: '#0F1524', // Solid midnight desk card background
    border: 'rgba(38, 51, 82, 0.55)', // Soft glow halo boundary
    textPrimary: '#F8FAFC', // Brilliant bright star white
    textSecondary: '#94A3B8', // Soft night sky subtext
    textMuted: '#64748B', // Moon shadow grey
    accent: '#818CF8', // Futuristic focus indigo
    accentBg: 'rgba(129, 140, 248, 0.16)',
    inputBg: 'rgba(8, 12, 22, 0.65)',
  },
};
