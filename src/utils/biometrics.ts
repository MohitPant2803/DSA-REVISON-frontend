export async function checkBiometricsSupported(): Promise<boolean> {
  try {
    const LocalAuthentication = require('expo-local-authentication');
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch (err) {
    console.warn('[Biometrics] LocalAuthentication native module is missing or not built yet.', err);
    return false;
  }
}

export async function authenticateWithBiometrics(reason = 'Verify your session to resume syncing'): Promise<boolean> {
  try {
    const supported = await checkBiometricsSupported();
    if (!supported) return false;

    const LocalAuthentication = require('expo-local-authentication');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Enter Passcode',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (err) {
    console.warn('[Biometrics] Authentication failed:', err);
    return false;
  }
}
