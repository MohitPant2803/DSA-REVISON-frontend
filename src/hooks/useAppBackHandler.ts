import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useUIStore } from '@/store/useUIStore';

/**
 * Handles Android hardware back and coordinates with the navigation stack.
 * When the stack cannot go back, prompts before exiting the app.
 */
export function useAppBackHandler() {
  const navigation = navigationHookWrapper();
  const setExitPromptOpen = useUIStore((state) => state.setExitPromptOpen);

  function navigationHookWrapper() {
    try {
      return useNavigation();
    } catch {
      return { canGoBack: () => false, goBack: () => {} } as any;
    }
  }

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }

        // Open our premium, high-aesthetic global exit confirmation modal
        setExitPromptOpen(true);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation, setExitPromptOpen])
  );
}

