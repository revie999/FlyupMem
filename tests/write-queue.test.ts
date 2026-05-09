import { describe, it, expect } from 'vitest'
import { WriteQueue } from '../src/core/write-queue.js'

describe('WriteQueue', () => {
  it('executes operations serially in order', async () => {
    const queue = new WriteQueue()
    const order: number[] = []

    const p1 = queue.enqueue(async () => {
      await sleep(30)
      order.push(1)
    })
    const p2 = queue.enqueue(async () => {
      await sleep(10)
      order.push(2)
    })
    const p3 = queue.enqueue(() => {
      order.push(3)
    })

    await Promise.all([p1, p2, p3])
    expect(order).toEqual([1, 2, 3])
  })

  it('resolves each enqueue promise individually', async () => {
    const queue = new WriteQueue()
    const results: string[] = []

    const p1 = queue.enqueue(() => { results.push('a') })
    const p2 = queue.enqueue(() => { results.push('b') })

    await p1
    expect(results).toContain('a')

    await p2
    expect(results).toEqual(['a', 'b'])
  })

  it('rejects on error without blocking subsequent operations', async () => {
    const queue = new WriteQueue()
    const results: string[] = []

    const p1 = queue.enqueue(() => { throw new Error('boom') })
    const p2 = queue.enqueue(() => { results.push('ok') })

    await expect(p1).rejects.toThrow('boom')
    await p2
    expect(results).toEqual(['ok'])
  })

  it('reports pending count correctly', async () => {
    const queue = new WriteQueue()
    expect(queue.pending).toBe(0)

    let resolveFirst!: () => void
    const blocker = new Promise<void>(r => { resolveFirst = r })

    const p1 = queue.enqueue(() => blocker)
    // p1 is now running, queue has 0 pending + 1 running = 1
    await sleep(5)
    expect(queue.pending).toBe(1)

    const p2 = queue.enqueue(() => {})
    // p1 running + p2 queued = 2
    expect(queue.pending).toBe(2)

    resolveFirst()
    await Promise.all([p1, p2])
    expect(queue.pending).toBe(0)
  })

  it('drain resolves when queue is empty', async () => {
    const queue = new WriteQueue()
    // drain on empty queue resolves immediately
    await queue.drain()

    const results: number[] = []
    queue.enqueue(async () => { await sleep(20); results.push(1) })
    queue.enqueue(() => { results.push(2) })

    await queue.drain()
    expect(results).toEqual([1, 2])
    expect(queue.pending).toBe(0)
  })

  it('drain can be called multiple times concurrently', async () => {
    const queue = new WriteQueue()
    const results: number[] = []

    queue.enqueue(async () => { await sleep(20); results.push(1) })

    const [d1, d2] = await Promise.all([queue.drain(), queue.drain()])
    expect(results).toEqual([1])
  })

  it('handles many concurrent enqueues without data loss', async () => {
    const queue = new WriteQueue()
    const results: number[] = []
    const N = 100

    const promises = Array.from({ length: N }, (_, i) =>
      queue.enqueue(() => { results.push(i) })
    )

    await Promise.all(promises)
    expect(results).toHaveLength(N)
    expect(results).toEqual(Array.from({ length: N }, (_, i) => i))
  })

  it('supports sync and async operations mixed', async () => {
    const queue = new WriteQueue()
    const results: string[] = []

    await Promise.all([
      queue.enqueue(() => { results.push('sync') }),
      queue.enqueue(async () => { await sleep(5); results.push('async') }),
      queue.enqueue(() => { results.push('sync2') }),
    ])

    expect(results).toEqual(['sync', 'async', 'sync2'])
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
