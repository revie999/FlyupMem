// tests/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupSyncInit, flyupSyncStatus, flyupSyncPush, flyupSyncPull, flyupSync } from '../src/tools/flyup_sync.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-sync-'))
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

describe('flyupSync', () => {
  let tmp: string
  let store: FlyupMemStore

  beforeEach(() => {
    tmp = tmpDir()
    store = new FlyupMemStore({ store_path: tmp })
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('sync init initializes a git repo, writes ignore rules, and configures origin', () => {
    const remote = path.join(tmpDir(), 'remote.git')
    git(['init', '--bare', remote], process.cwd())

    const result = flyupSyncInit(store, remote)

    expect(result.ok).toBe(true)
    expect(result.isRepo).toBe(true)
    expect(result.remote).toBe(remote)
    expect(fs.existsSync(path.join(tmp, '.git'))).toBe(true)
    const ignore = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf-8')
    expect(ignore).toContain('index.sqlite')
    expect(ignore).toContain('*.tmp.*')
    expect(git(['config', '--get', 'remote.origin.url'], tmp)).toBe(remote)
  }, 30000)

  it('sync status reports repo, branch, dirty files, and ahead behind counts', () => {
    flyupSyncInit(store)
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), '[]\n')

    const result = flyupSyncStatus(store)

    expect(result.isRepo).toBe(true)
    expect(result.branch).toBeTruthy()
    expect(result.dirtyFiles).toContain('engrams.yaml')
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  }, 30000)

  it('sync push commits YAML/config changes, ignores SQLite cache, and no-ops when clean', () => {
    flyupSyncInit(store)
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), '[]\n')
    fs.writeFileSync(path.join(tmp, 'index.sqlite'), 'cache')

    const first = flyupSyncPush(store)
    const second = flyupSyncPush(store, { force: true })

    expect(first.ok).toBe(true)
    expect(first.committed).toBe(true)
    expect(first.commitHash).toMatch(/^[0-9a-f]{7,40}$/)
    expect(first.stagedFiles).toContain('engrams.yaml')
    expect(second.ok).toBe(true)
    expect(second.committed).toBe(false)
    expect(second.message).toContain('No changes')
    expect(git(['status', '--porcelain'], tmp)).toBe('')
    const tracked = git(['ls-files'], tmp)
    expect(tracked).toContain('engrams.yaml')
    expect(tracked).not.toContain('index.sqlite')
  }, 30000)

  it('sync pull fetches remote changes and rebuilds SQLite cache', () => {
    const remote = path.join(tmpDir(), 'remote.git')
    const seed = tmpDir()
    git(['init', '--bare', remote], process.cwd())
    git(['clone', remote, seed], process.cwd())
    fs.writeFileSync(path.join(seed, 'engrams.yaml'), '[]\n')
    git(['add', 'engrams.yaml'], seed)
    git(['-c', 'user.name=FlyupMem Test', '-c', 'user.email=flyupmem@example.test', 'commit', '-m', 'seed'], seed)
    git(['push', 'origin', 'HEAD:main'], seed)

    flyupSyncInit(store, remote)
    const result = flyupSyncPull(store)

    expect(result.ok).toBe(true)
    expect(result.pulled).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'engrams.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'index.sqlite'))).toBe(true)
  }, 30000)

  it('sync runs pull then push and stops cleanly without remote', () => {
    flyupSyncInit(store)
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), '[]\n')

    const result = flyupSync(store)

    expect(result.ok).toBe(true)
    expect(result.pull.ok).toBe(true)
    expect(result.push.committed).toBe(true)
  }, 30000)
})
