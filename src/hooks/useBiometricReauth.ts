import { useCallback } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { authenticateWithBiometrics, checkBiometricsSupported } from '@/utils/biometrics';

export function useBiometricReauth() {
  const silentTokenRefresh = useAuthStore((s) => s.silentTokenRefresh);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);

  const triggerBiometricReauth = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[Biometric Hook] Triggering biometric fallback re-auth...');
      const supported = await checkBiometricsSupported();
      if (!supported) {
        console.log('[Biometric Hook] Biometrics not supported on this device.');
        return false;
      }

      const success = await authenticateWithBiometrics('Verify your identity to unlock your session');
      if (success) {
        console.log('[Biometric Hook] Biometrics succeeded. Silently refreshing JWT...');
        const refreshSuccess = await silentTokenRefresh();
        if (refreshSuccess) {
          setSessionExpired(false);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('[Biometric Hook] Biometric re-auth error:', err);
      return false;
    }
  }, [silentTokenRefresh, setSessionExpired]);

  return { triggerBiometricReauth };
}
