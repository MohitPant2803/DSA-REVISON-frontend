import { InteractionManager } from 'react-native';

class InteractionScheduler {
  private isUserInteracting = false;
  private lastInteractionTime = 0;
  private interactionTimeout: NodeJS.Timeout | null = null;
  private deferredTasks: Array<() => Promise<void> | void> = [];

  /**
   * Register active user interaction (scrolling, swiping, touch clicks, navigation transitions).
   * Automatically enters INTERACTION MODE and registers a 2-second settle timeout.
   */
  public registerInteraction() {
    this.isUserInteracting = true;
    this.lastInteractionTime = Date.now();

    if (this.interactionTimeout) {
      clearTimeout(this.interactionTimeout);
    }

    this.interactionTimeout = setTimeout(() => {
      this.isUserInteracting = false;
      this.interactionTimeout = null;
      if (__DEV__) {
        console.log('[Interaction Scheduler] Interaction settled. Executing deferred background tasks...');
      }
      this.runDeferredTasks();
    }, 150); // 150ms settle timeout
  }

  /**
   * Returns true if user is currently interacting with the UI.
   */
  public isInteracting(): boolean {
    return this.isUserInteracting;
  }

  /**
   * Cooperative Cooperative Background Work Scheduler.
   * If interacting: defers the task.
   * If idle: executes task immediately using cooperative chunking inside InteractionManager.
   */
  public runWhenIdle(task: () => Promise<void> | void) {
    if (this.isUserInteracting) {
      if (__DEV__) {
        console.log('[Interaction Scheduler] UI is active. Deferring background task...');
      }
      this.deferredTasks.push(task);
    } else {
      InteractionManager.runAfterInteractions(() => {
        const res = task();
        if (res instanceof Promise) {
          res.catch(err => console.error('[Interaction Scheduler] Idle task failed:', err));
        }
      });
    }
  }

  /**
   * Flush all deferred background tasks sequentially, yielding control back to the native thread.
   */
  private async runDeferredTasks() {
    const tasks = [...this.deferredTasks];
    this.deferredTasks = [];

    for (const task of tasks) {
      if (this.isUserInteracting) {
        if (__DEV__) {
          console.log('[Interaction Scheduler] Interaction resumed during execution. Re-deferring remaining tasks.');
        }
        this.deferredTasks.push(...tasks.slice(tasks.indexOf(task)));
        break;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          InteractionManager.runAfterInteractions(() => {
            try {
              const res = task();
              if (res instanceof Promise) {
                res.then(resolve).catch(reject);
              } else {
                resolve();
              }
            } catch (err) {
              reject(err);
            }
          });
        });
      } catch (err) {
        console.error('[Interaction Scheduler] Deferred task failed:', err);
      }

      // Cooperative yield interval: yield thread control back to native layout thread briefly
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export const interactionScheduler = new InteractionScheduler();
