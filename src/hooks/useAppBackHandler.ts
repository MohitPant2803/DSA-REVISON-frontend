import { useCallback } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';

/**
 * Handles Android hardware back and coordinates with the navigation stack.
 * When the stack cannot go back, prompts before exiting the app.
 */
export function useAppBackHandler() {
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }

        Alert.alert(
          'Leave app?',
          'Are you sure you want to leave?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Exit',
              style: 'destructive',
              onPress: () => {
                if (Platform.OS === 'android') {
                  BackHandler.exitApp();
                }
              },
            },
          ],
          { cancelable: true }
        );
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation])
  );
}
