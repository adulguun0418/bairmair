import type { UploadRemote } from './remote';
import { advance, isDue, type UploadRecord } from './upload-model';

/** Where the records live (files next to each scan on the phone; a map in tests). */
export interface UploadRecordStore {
  /** Every record on the phone, any user. */
  list(): UploadRecord[];
  /** The record of this scan, or null (never asked for a link, or deleted). */
  get(localId: string): UploadRecord | null;
  save(record: UploadRecord): void;
  /** The scan's raw export on the phone (file URIs), or null when the files are gone. */
  files(localId: string): { json: string; usdz: string } | null;
}

/** How long to wait before asking again when the session could not even be read (offline). */
const OFFLINE_RETRY_MS = 30_000;

/**
 * Works through the signed-in user's records, one step at a time, while the app is open. Runs
 * on `kick()` (app start, back in the foreground, sign-in, a new scan, "try again") and on a
 * timer for the next backoff. One run at a time; a kick during a run starts another after it.
 */
export class UploadEngine {
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: UploadRecordStore,
    private readonly remote: UploadRemote,
    private readonly now: () => number = Date.now,
  ) {}

  /** Called after every change to a record. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  kick(): void {
    void this.run();
  }

  /** Resolves when the current run (and any it triggered) is over. For tests. */
  async idle(): Promise<void> {
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, delayMs);
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        await this.pass();
      } while (this.again);
    } finally {
      this.running = false;
    }
  }

  private async pass(): Promise<void> {
    let userId: string | null;
    try {
      userId = await this.remote.currentUserId();
    } catch {
      this.schedule(OFFLINE_RETRY_MS);
      return;
    }
    if (!userId) return;

    for (;;) {
      const now = this.now();
      const record = this.store.list().find((r) => isDue(r, userId, now));
      if (!record) break;

      const files = this.store.files(record.localId);
      if (!files) {
        this.store.save({ ...record, blocked: 'failed', lastError: 'local files missing' });
        this.notify();
        continue;
      }
      const outcome = await this.remote.run(record, files);
      if (outcome.kind === 'signedOut') return;
      // Deleted while the step ran: do not bring it back.
      if (!this.store.get(record.localId)) continue;
      this.store.save(advance(record, outcome, this.now()));
      this.notify();
    }

    // Wake up for the next backoff, if any.
    const waits = this.store
      .list()
      .filter((r) => r.ownerId === userId && r.step !== 'done' && !r.blocked && r.retryAt)
      .map((r) => r.retryAt! - this.now());
    if (waits.length > 0) this.schedule(Math.max(0, Math.min(...waits)));
  }
}
