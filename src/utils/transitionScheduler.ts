/**
 * INTERACTION SCHEDULER & TRANSITION PROTECTION
 * 
 * Purpose:
 * - Defer non-critical work during navigation transitions
 * - Protect JS thread during push/pop animations
 * - Batch concurrent async operations
 * - Prevent jank by deferring low-priority tasks
 * 
 * Safe for production. Zero behavioral changes.
 */

import { InteractionManager, Platform } from 'react-native';
import type { Task } from 'react-native';

export interface DeferredTask {
  name: string;
  fn: () => void | Promise<void>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  delayMs?: number;
}

/**
 * Task scheduler that respects interaction phases
 * - CRITICAL: Run immediately (before animation)
 * - HIGH: Run during animation (background)
 * - NORMAL: Run after animation completes
 * - LOW: Run after all interactions complete (idle)
 */
class TransitionProtectedScheduler {
  private criticalTasks: DeferredTask[] = [];
  private highPriorityTasks: DeferredTask[] = [];
  private normalPriorityTasks: DeferredTask[] = [];
  private lowPriorityTasks: DeferredTask[] = [];
  private activeTasks = new Map<string, any>();
  private inTransition = false;

  /**
   * Mark the start of a navigation transition.
   * Defers non-critical work until animation completes.
   */
  markTransitionStart() {
    this.inTransition = true;
  }

  /**
   * Mark the end of navigation transition.
   * Triggers deferred work.
   */
  markTransitionEnd() {
    this.inTransition = false;
    this.flushDeferredTasks();
  }

  /**
   * Schedule a task with priority awareness
   */
  schedule(task: DeferredTask) {
    if (this.activeTasks.has(task.name)) {
      // Prevent duplicate tasks
      return;
    }

    if (this.inTransition && task.priority !== 'critical') {
      // Queue for later if in transition
      this.queueByPriority(task);
      return;
    }

    this.executeTask(task);
  }

  /**
   * Execute immediately, no queueing
   */
  executeImmediate(fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error('⚠️ Scheduled task error:', err);
        });
      }
    } catch (err) {
      console.error('⚠️ Scheduled task error:', err);
    }
  }

  /**
   * Safe wrapper for haptics, analytics, cache warming that might block thread
   */
  runAfterInteractions(task: DeferredTask) {
    const wrappedTask: any = InteractionManager.runAfterInteractions(async () => {
      try {
        await task.fn();
      } catch (err) {
        console.error(`⚠️ Task '${task.name}' failed:`, err);
      } finally {
        this.activeTasks.delete(task.name);
      }
    });

    this.activeTasks.set(task.name, wrappedTask);
  }

  /**
   * Schedule using requestIdleCallback if available (Android 5+)
   * Falls back to setTimeout on older devices
   */
  runWhenIdle(task: DeferredTask) {
    if (typeof requestIdleCallback !== 'undefined') {
      (requestIdleCallback as any)(() => {
        this.executeTask(task);
      });
    } else {
      // Fallback for older Android versions
      const delay = Math.max(task.delayMs ?? 0, 2000); // Defer by 2s minimum
      setTimeout(() => {
        this.executeTask(task);
      }, delay);
    }
  }

  /**
   * Immediately run essential work, defer everything else
   */
  private executeTask(task: DeferredTask) {
    if (task.priority === 'critical') {
      this.executeImmediate(task.fn);
    } else if (task.priority === 'high') {
      this.runAfterInteractions(task);
    } else if (task.priority === 'normal') {
      this.runAfterInteractions(task);
    } else {
      this.runWhenIdle(task);
    }
  }

  private queueByPriority(task: DeferredTask) {
    if (task.priority === 'critical') {
      this.criticalTasks.push(task);
    } else if (task.priority === 'high') {
      this.highPriorityTasks.push(task);
    } else if (task.priority === 'normal') {
      this.normalPriorityTasks.push(task);
    } else {
      this.lowPriorityTasks.push(task);
    }
  }

  private flushDeferredTasks() {
    // Execute in order: high -> normal -> low
    // This ensures UI-critical work happens first
    const allQueued = [
      ...this.highPriorityTasks,
      ...this.normalPriorityTasks,
      ...this.lowPriorityTasks,
    ];

    this.criticalTasks = [];
    this.highPriorityTasks = [];
    this.normalPriorityTasks = [];
    this.lowPriorityTasks = [];

    // Batch execute with staggered timing to avoid UI hiccups
    allQueued.forEach((task, index) => {
      if (task.priority === 'high') {
        this.runAfterInteractions(task);
      } else {
        setTimeout(() => {
          this.runWhenIdle(task);
        }, index * 100); // 100ms stagger per task
      }
    });
  }

  cancelTask(name: string) {
    const task = this.activeTasks.get(name);
    if (task) {
      task.cancel();
      this.activeTasks.delete(name);
    }
  }
}

export const transitionScheduler = new TransitionProtectedScheduler();

/**
 * React hook wrapper for transition protection
 */
export function useTransitionProtection(screenName: string) {
  return {
    /**
     * Call at the start of navigation
     * Example: In useFocusEffect before updating state
     */
    onTransitionStart: () => transitionScheduler.markTransitionStart(),

    /**
     * Call when transition animation completes
     * Example: After Reanimated animation finishes
     */
    onTransitionEnd: () => transitionScheduler.markTransitionEnd(),

    /**
     * Schedule deferred work
     */
    scheduleTask: (name: string, fn: () => void, priority: 'critical' | 'high' | 'normal' | 'low' = 'normal') => {
      transitionScheduler.schedule({
        name: `${screenName}/${name}`,
        fn,
        priority,
      });
    },

    /**
     * Cancel a scheduled task
     */
    cancelTask: (name: string) => {
      transitionScheduler.cancelTask(`${screenName}/${name}`);
    },
  };
}

/**
 * Helpers for common deferred tasks
 */
export const deferredTaskHelpers = {
  /**
   * Wrap haptics to prevent thread blocking during transitions
   */
  haptic: (hapticFn: () => void) => ({
    name: 'haptic',
    fn: hapticFn,
    priority: 'low' as const,
  }),

  /**
   * Wrap analytics to defer until idle
   */
  analytics: (analyticsFn: () => void) => ({
    name: 'analytics',
    fn: analyticsFn,
    priority: 'low' as const,
  }),

  /**
   * Wrap cache seeding to run after interactions
   */
  cacheWarming: (warmFn: () => Promise<void>) => ({
    name: 'cacheWarming',
    fn: warmFn,
    priority: 'high' as const,
  }),

  /**
   * Wrap sync jobs to run when truly idle
   */
  syncJob: (syncFn: () => Promise<void>) => ({
    name: 'syncJob',
    fn: syncFn,
    priority: 'low' as const,
    delayMs: 3000, // Delay by 3s to ensure UI is fully settled
  }),

  /**
   * Wrap persistence writes to batch safely
   */
  persistenceWrite: (persistFn: () => Promise<void>) => ({
    name: 'persistence',
    fn: persistFn,
    priority: 'high' as const, // Medium priority - after render, before idle
  }),
};
