// src/tools/flyup_sync.ts — Git sync for FlyupMem YAML store

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { FlyupMemStore } from '../core/store.js'

const TRACKED_FILES = [
  '.gitignore',
  'engrams.yaml',
  'observations.yaml',
  'mental-models.yaml',
  'episodes.yaml',
  'graph.yaml',
  'feedback.yaml',
  'config.yaml',
]

const GITIGNORE_RULES = [
  '# FlyupMem rebuildable/local cache files',
  'index.sqlite',
  'index.sqlite-*',
  '*.sqlite',
  '*.sqlite-*',
  '',
  '# Atomic write / lock / OS noise',
  '*.tmp.*',
  '*.lock',
  '.DS_Store',
  '',
]

export interface SyncInitResult {
  action: 'init'
  ok: boolean
  isRepo: boolean
  remote: string | null
  message: string
}

export interface SyncStatusResult {
  action: 'status'
  ok: boolean
  isRepo: boolean
  branch: string | null
  remote: string | null
  dirtyFiles: string[]
  ahead: number
  behind: number
  message: string
}

export interface SyncPushResult {
  action: 'push'
  ok: boolean
  committed: boolean
  pushed: boolean
  commitHash: string | null
  message: string
}

export interface SyncPullResult {
  action: 'pull'
  ok: boolean
  pulled: boolean
  rebuiltCache: boolean
  message: string
}

export interface SyncResult {
  action: 'sync'
  ok: boolean
  status: SyncStatusResult
  pull: SyncPullResult
  push: SyncPushResult
  message: string
}

function runGit(store: FlyupMemStore, args: string[], allowFailure = false): string {
  try {
    return execFileSync('git', args, {
      cwd: store.basePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    if (allowFailure) return ''
    const e = err as { stderr?: Buffer | string; message?: string }
    const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf-8') : e.stderr
    throw new Error((stderr || e.message || 'git command failed').trim())
  }
}

function isGitRepo(store: FlyupMemStore): boolean {
  if (!fs.existsSync(path.join(store.basePath, '.git'))) return false
  return runGit(store, ['rev-parse', '--is-inside-work-tree'], true) === 'true'
}

function getRemote(store: FlyupMemStore): string | null {
  return runGit(store, ['config', '--get', 'remote.origin.url'], true) || null
}

function ensureIgnoreRules(store: FlyupMemStore): void {
  const ignorePath = path.join(store.basePath, '.gitignore')
  const existing = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf-8') : ''
  const lines = existing ? existing.split(/\r?\n/) : []
  let changed = false
  for (const rule of GITIGNORE_RULES) {
    if (!rule) continue
    if (!lines.includes(rule)) {
      lines.push(rule)
      changed = true
    }
  }
  if (changed || !fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, lines.filter((line, idx, arr) => line || arr[idx - 1]).join('\n') + '\n', 'utf-8')
  }
}

function dirtyFiles(store: FlyupMemStore): string[] {
  const output = runGit(store, ['status', '--porcelain'], true)
  if (!output) return []
  return output.split('\n').map(line => line.slice(3).trim()).filter(Boolean)
}

function aheadBehind(store: FlyupMemStore): { ahead: number; behind: number } {
  const upstream = runGit(store, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], true)
  if (!upstream) return { ahead: 0, behind: 0 }
  const output = runGit(store, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], true)
  const [behindRaw, aheadRaw] = output.split(/\s+/).map(Number)
  return { ahead: Number.isFinite(aheadRaw) ? aheadRaw : 0, behind: Number.isFinite(behindRaw) ? behindRaw : 0 }
}

function addTrackedFiles(store: FlyupMemStore): void {
  const existing = TRACKED_FILES.filter(file => fs.existsSync(path.join(store.basePath, file)))
  if (existing.length) runGit(store, ['add', '--', ...existing])
}

function currentHead(store: FlyupMemStore): string | null {
  return runGit(store, ['rev-parse', '--short', 'HEAD'], true) || null
}

export function flyupSyncInit(store: FlyupMemStore, remote?: string): SyncInitResult {
  fs.mkdirSync(store.basePath, { recursive: true })
  if (!isGitRepo(store)) {
    runGit(store, ['init'])
  }
  ensureIgnoreRules(store)

  if (remote) {
    const existingRemote = getRemote(store)
    if (existingRemote) runGit(store, ['remote', 'set-url', 'origin', remote])
    else runGit(store, ['remote', 'add', 'origin', remote])
  }

  return {
    action: 'init',
    ok: true,
    isRepo: isGitRepo(store),
    remote: getRemote(store),
    message: remote ? `Git sync initialized with origin ${remote}` : 'Git sync initialized',
  }
}

export function flyupSyncStatus(store: FlyupMemStore): SyncStatusResult {
  const repo = isGitRepo(store)
  if (!repo) {
    return {
      action: 'status', ok: true, isRepo: false, branch: null, remote: null,
      dirtyFiles: [], ahead: 0, behind: 0, message: 'Not a Git repository. Run: flyupmem sync init',
    }
  }
  const branch = runGit(store, ['branch', '--show-current'], true) || 'HEAD'
  const counts = aheadBehind(store)
  const files = dirtyFiles(store)
  return {
    action: 'status', ok: true, isRepo: true, branch, remote: getRemote(store), dirtyFiles: files,
    ahead: counts.ahead, behind: counts.behind,
    message: files.length ? `${files.length} dirty file(s)` : 'Clean',
  }
}

export function flyupSyncPush(store: FlyupMemStore): SyncPushResult {
  if (!isGitRepo(store)) {
    return { action: 'push', ok: false, committed: false, pushed: false, commitHash: null, message: 'Not a Git repository. Run: flyupmem sync init' }
  }
  ensureIgnoreRules(store)
  addTrackedFiles(store)
  const staged = runGit(store, ['diff', '--cached', '--name-only'], true)
  if (!staged) {
    return { action: 'push', ok: true, committed: false, pushed: false, commitHash: currentHead(store), message: 'No changes to sync' }
  }

  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  runGit(store, ['-c', 'user.name=FlyupMem Sync', '-c', 'user.email=flyupmem-sync@example.local', 'commit', '-m', `chore: sync FlyupMem store ${stamp}`])
  const commitHash = currentHead(store)
  const remote = getRemote(store)
  let pushed = false
  if (remote) {
    const branch = runGit(store, ['branch', '--show-current'], true) || 'main'
    runGit(store, ['push', '-u', 'origin', `HEAD:${branch}`])
    pushed = true
  }
  return { action: 'push', ok: true, committed: true, pushed, commitHash, message: pushed ? 'Committed and pushed' : 'Committed locally (no remote configured)' }
}

export function flyupSyncPull(store: FlyupMemStore): SyncPullResult {
  if (!isGitRepo(store)) {
    return { action: 'pull', ok: false, pulled: false, rebuiltCache: false, message: 'Not a Git repository. Run: flyupmem sync init' }
  }
  const remote = getRemote(store)
  if (!remote) {
    store.load()
    return { action: 'pull', ok: true, pulled: false, rebuiltCache: true, message: 'No remote configured; rebuilt local SQLite cache only' }
  }

  try {
    runGit(store, ['fetch', 'origin'])
    const branch = runGit(store, ['branch', '--show-current'], true) || 'main'
    const remoteBranch = runGit(store, ['rev-parse', '--verify', `origin/${branch}`], true) ? `origin/${branch}` : 'origin/main'
    runGit(store, ['merge', '--ff-only', remoteBranch])
    store.load()
    return { action: 'pull', ok: true, pulled: true, rebuiltCache: true, message: `Pulled ${remoteBranch} and rebuilt SQLite cache` }
  } catch (err) {
    return { action: 'pull', ok: false, pulled: false, rebuiltCache: false, message: `Pull failed: ${(err as Error).message}` }
  }
}

export function flyupSync(store: FlyupMemStore): SyncResult {
  const status = flyupSyncStatus(store)
  if (!status.isRepo) {
    const pull: SyncPullResult = { action: 'pull', ok: false, pulled: false, rebuiltCache: false, message: 'Skipped: not initialized' }
    const push: SyncPushResult = { action: 'push', ok: false, committed: false, pushed: false, commitHash: null, message: 'Skipped: not initialized' }
    return { action: 'sync', ok: false, status, pull, push, message: 'Not a Git repository. Run: flyupmem sync init' }
  }

  const pull = flyupSyncPull(store)
  if (!pull.ok) {
    const push: SyncPushResult = { action: 'push', ok: false, committed: false, pushed: false, commitHash: null, message: 'Skipped because pull failed' }
    return { action: 'sync', ok: false, status, pull, push, message: pull.message }
  }
  const push = flyupSyncPush(store)
  return { action: 'sync', ok: push.ok, status, pull, push, message: push.ok ? 'Sync complete' : push.message }
}
