import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { themePalettes, ThemePalette } from '@/theme/themePalettes';

export function useThemePalette(): ThemePalette {
  const theme = useUserPreferencesStore((s) => s.preferences.theme) || 'zen';
  return themePalettes[theme] || themePalettes.zen;
}
export default useThemePalette;
