import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useUIStore } from '@/store/useUIStore';

/**
 * Minimal back handler that defers to each screen's customOnBack.
 *
 * Philosophy: every screen that needs custom back behavior passes its own
 * handler via `customOnBack`. The global hook never overrides it with
 * hardcoded routing — that was the source of hardware-back vs screen-back
 * mismatches (e.g. nested folders navigating to My Space instead of the
 * parent folder).
 *
 * The only global behavior is the exit-app prompt on root tab screens.
 */
export function useAppBackHandler(customOnBack?: () => boolean | void) {
  const router = useRouter();
  const setExitPromptOpen = useUIStore((state) => state.setExitPromptOpen);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // 1. If the screen provided a custom handler, run it exclusively.
        //    This is how folder screens navigate to their parent folder,
        //    playlist screens navigate to My Space, etc.
        if (customOnBack) {
          const handled = customOnBack();
          if (handled) return true;
        }

        // 2. If there's a stack to pop, pop it — exactly like the screen
        //    back button does with router.back().
        if (router.canGoBack()) {
          router.back();
          return true;
        }

        // 3. On root tab screens (learn / reels / personal) with nothing
        //    to pop, show the exit-app confirmation prompt.
        setExitPromptOpen(true);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [setExitPromptOpen, customOnBack, router])
  );
}
