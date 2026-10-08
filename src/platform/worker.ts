import { outboxRelay } from './events';
import { drain } from './inbox';
import { announceDay } from './metrics';
import { services } from './services';

/**
 * The worker, inside the web process for now (decision 0001): it drains the inbox every few
 * seconds, and at once when a webhook wakes it. Several instances are safe.
 */
let running = false;
let timer: ReturnType<typeof setInterval> | undefined;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const conversation = services().conversation;
    if (conversation) await drain(conversation);
  } catch (error) {
    console.warn(`[inbox] ${error instanceof Error ? error.name : 'failed'}`);
  } finally {
    running = false;
  }
}

export function startWorker(
  intervalMs = Number(process.env.FIRMO_WORKER_INTERVAL_MS ?? 3000),
): void {
  if (timer) return;
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  // The day's figures (spec 012): yesterday's, announced once — at start, then every hour in case
  // the process was down when the day turned.
  const figures = () =>
    void announceDay().catch((error: unknown) =>
      console.warn(`[metrics] ${error instanceof Error ? error.name : 'failed'}`),
    );
  figures();
  setInterval(figures, 60 * 60 * 1000).unref();
  // Firmo's events to Kete Cockpit, once Firmo is registered there (spec 008).
  outboxRelay()?.start(5000, (error) =>
    console.warn(`[outbox] ${error instanceof Error ? error.name : 'failed'}`),
  );
}

export function wakeWorker(): void {
  void tick();
}
