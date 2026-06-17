import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useWalkthroughStore } from '@/store/useWalkthroughStore';
import { themePalettes, ThemePalette } from '@/theme/themePalettes';

export function useThemePalette(): ThemePalette {
  const isWalkthroughComplete = useWalkthroughStore((s) => s.isComplete);
  const walkthroughStep = useWalkthroughStore((s) => s.step);
  const theme = useUserPreferencesStore((s) => s.preferences.theme) || 'midnight';
  
  // Enforce Zen theme only when the walkthrough is not complete AND a tutorial step is active.
  // This avoids flashing to Zen during boot before AsyncStorage has been read.
  const activeTheme = (!isWalkthroughComplete && walkthroughStep !== 'none') ? 'zen' : theme;
  return themePalettes[activeTheme] || themePalettes.midnight;
}
export default useThemePalette;
