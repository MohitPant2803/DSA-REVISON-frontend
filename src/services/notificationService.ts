import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

let notificationQueuePromise: Promise<any> = Promise.resolve();

async function runSerialized<T>(action: () => Promise<T>): Promise<T> {
  const nextPromise = notificationQueuePromise.then(action);
  notificationQueuePromise = nextPromise.catch(() => {});
  return nextPromise;
}

// Configure default notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Checks and requests notifications permission.
 * Returns true if permissions are granted.
 */
export async function requestPermissionsAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  // On physical Android/iOS devices or modern simulators
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('[NotificationService] System notification permissions denied by user.');
    return false;
  }
  
  // Configure Android channel if on Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('dsa-reminders', {
      name: 'DSA Revision Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8B5CF6',
    });
  }

  return true;
}

/**
 * Schedules a daily recurring review reminder.
 */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    // 1. Clear any previously scheduled daily notifications
    await cancelDailyReminder();

    // 2. Verify permissions first
    const hasPermission = await requestPermissionsAsync();
    if (!hasPermission) return null;

    // 3. Schedule recurring daily reminder
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Ready for a quick review?',
        body: 'Spend two minutes reinforcing today\'s core data structure and algorithm concepts.',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: 'dsa-reminders',
      } as any,
    });

    console.log(`[NotificationService] Daily reminder scheduled at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (ID: ${identifier})`);
    return identifier;
  } catch (err: any) {
    console.error('[NotificationService] Failed to schedule daily reminder:', err.message);
    return null;
  }
}

/**
 * Schedules a late evening streak risk warning.
 */
export async function scheduleStreakWarning(streakCount: number, hour = 21, minute = 0): Promise<string | null> {
  return runSerialized(async () => {
    if (Platform.OS === 'web') return null;

    try {
      await cancelStreakWarning();

      const hasPermission = await requestPermissionsAsync();
      if (!hasPermission) return null;

      const title = streakCount > 0 ? `${streakCount} days streak at danger` : 'Streak at Risk';
      const body = streakCount > 0 
        ? `Review a card now to save your ${streakCount}-day streak before the day ends!`
        : 'You haven\'t reviewed any topics today. Take a quick moment now to lock in your progress.';

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: 'dsa-reminders',
        } as any,
      });

      console.log(`[NotificationService] Streak warning scheduled at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (ID: ${identifier})`);
      return identifier;
    } catch (err: any) {
      console.error('[NotificationService] Failed to schedule streak warning:', err.message);
      return null;
    }
  });
}

/**
 * Cancels the daily review reminder.
 */
export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      const title = notification.content.title;
      if (title && (title.includes('daily DSA review') || title.includes('Ready for a quick review'))) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        console.log(`[NotificationService] Cancelled daily reminder: ${notification.identifier}`);
      }
    }
  } catch (err: any) {
    console.error('[NotificationService] Cancel daily reminder failed:', err.message);
  }
}

/**
 * Cancels the late evening streak warning.
 */
export async function cancelStreakWarning(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      const title = notification.content.title;
      if (title && (title.includes('Streak at Risk') || title.includes('Keep your momentum') || title.includes('streak at danger'))) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        console.log(`[NotificationService] Cancelled streak warning: ${notification.identifier}`);
      }
    }
  } catch (err: any) {
    console.error('[NotificationService] Cancel streak warning failed:', err.message);
  }
}

/**
 * Clears all pending/scheduled notifications completely.
 */
export async function cancelAllNotifications(): Promise<void> {
  return runSerialized(async () => {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[NotificationService] All scheduled notifications cleared.');
    } catch (err: any) {
      console.error('[NotificationService] Cancel all notifications failed:', err.message);
    }
  });
}

/**
 * Unified reminder scheduler that supports daily, every 3 days, or custom weekdays.
 */
export async function scheduleReminders(
  enabled: boolean,
  hour: number,
  minute: number,
  frequency: 'daily' | 'three_days' | 'custom',
  customDays: number[]
): Promise<void> {
  return runSerialized(async () => {
    if (Platform.OS === 'web') return;

    try {
      // 1. Always cancel existing review reminders first
      await cancelDailyReminder();

      if (!enabled) {
        console.log('[NotificationService] Reminders disabled. Cancelled all scheduled reminders.');
        return;
      }

      // 2. Request permissions
      const hasPermission = await requestPermissionsAsync();
      if (!hasPermission) return;

      // 3. Resolve active days depending on selected frequency
      let daysToSchedule: number[] = [];

      if (frequency === 'daily') {
        // Schedule single daily reminder
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Ready for a quick review?',
            body: 'Spend two minutes reinforcing today\'s core data structure and algorithm concepts.',
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: 'dsa-reminders',
          } as any,
        });
        console.log(`[NotificationService] Daily reminder scheduled at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (ID: ${identifier})`);
        return;
      } else if (frequency === 'three_days') {
        // Use customDays if provided and not empty, otherwise default to Monday, Thursday, Sunday [2, 5, 1]
        daysToSchedule = (customDays && customDays.length > 0) ? customDays : [2, 5, 1];
      } else {
        // Custom selection of days
        daysToSchedule = customDays;
      }

      // 4. Schedule weekly notifications for each active day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const day of daysToSchedule) {
        const dayName = dayNames[day - 1];
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Ready for a quick review?',
            body: 'Spend two minutes reinforcing today\'s core data structure and algorithm concepts.',
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day,
            hour,
            minute,
            channelId: 'dsa-reminders',
          } as any,
        });
        console.log(`[NotificationService] Weekly reminder scheduled for ${dayName} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (ID: ${identifier})`);
      }

    } catch (err: any) {
      console.error('[NotificationService] Failed to schedule reminders:', err.message);
    }
  });
}

/**
 * Schedules a one-time reminder for a specific playlist at a selected date/time.
 */
export async function schedulePlaylistRevisionReminder(
  playlistName: string,
  date: Date
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const hasPermission = await requestPermissionsAsync();
    if (!hasPermission) return null;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Playlist Revision',
        body: `Your ${playlistName} revision is scheduled now`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: 'dsa-reminders',
      } as any,
    });

    console.log(`[NotificationService] One-time playlist revision reminder scheduled for ${playlistName} at ${date.toISOString()} (ID: ${identifier})`);
    return identifier;
  } catch (err: any) {
    console.error(`[NotificationService] Failed to schedule playlist revision reminder for ${playlistName}:`, err.message);
    return null;
  }
}

/**
 * Requests notification permissions and retrieves the unique Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  
  if (!Device.isDevice) {
    console.log('[NotificationService] Push notifications require a physical device');
    return null;
  }

  try {
    const hasPermission = await requestPermissionsAsync();
    if (!hasPermission) return null;

    // Retrieve Expo push token with the EAS Project ID from app.json
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '2a9bc232-b6d9-44f3-abbf-428860c7db19',
    });

    console.log('[NotificationService] Successfully retrieved Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (err: any) {
    console.error('[NotificationService] Failed to retrieve Expo Push Token:', err.message);
    return null;
  }
}

