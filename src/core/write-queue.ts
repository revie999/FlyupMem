/**
 * WriteQueue — async serial write queue for FlyupMem store.
 *
 * All write operations are enqueued and executed one at a time,
 * preventing concurrent writes from racing while not blocking callers.
 *
 * Cross-process safety is still handled by the file lock in store.ts;
 * this queue handles in-process serialization.
 */

type QueueEntry = {
  fn: () => void | Promise<void>
  resolve: () => void
  reject: (err: Error) => void
}

export class WriteQueue {
  private queue: QueueEntry[] = []
  private running = false
  private drainResolvers: Array<() => void> = []

  /** Number of pending operations (including the currently running one). */
  get pending(): number {
    return this.queue.length + (this.running ? 1 : 0)
  }

  /** Enqueue a write operation. Returns a promise that resolves when the operation completes. */
  enqueue(fn: () => void | Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      if (!this.running) {
        this.processNext()
      }
    })
  }

  /** Wait until all queued operations have completed. Resolves immediately if queue is empty. */
  drain(): Promise<void> {
    if (this.queue.length === 0 && !this.running) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve)
    })
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.running = false
      // Notify all drain waiters
      const resolvers = this.drainResolvers.splice(0)
      for (const resolve of resolvers) {
        resolve()
      }
      return
    }

    this.running = true
    const entry = this.queue.shift()!

    try {
      await entry.fn()
    } catch (err) {
      entry.reject(err instanceof Error ? err : new Error(String(err)))
      // Still process next even after error
      queueMicrotask(() => this.processNext())
      return
    }

    // Check if more work exists BEFORE resolving the caller,
    // so that `pending` reads 0 when the caller's `await` resumes.
    if (this.queue.length === 0) {
      this.running = false
      const resolvers = this.drainResolvers.splice(0)
      entry.resolve()
      for (const resolve of resolvers) {
        resolve()
      }
    } else {
      entry.resolve()
      queueMicrotask(() => this.processNext())
    }
  }
}
