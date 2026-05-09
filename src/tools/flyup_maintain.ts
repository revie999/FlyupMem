// src/tools/flyup_maintain.ts — Maintenance operations tool

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { FlyupMemStore } from '../core/store.js'
import { batchDecay } from '../lifecycle/batch-decay.js'
import { consolidateUnmerged } from '../lifecycle/consolidate.js'
import { maintainGraphBulk } from '../lifecycle/graph-maintain.js'
import { induceExperiences } from '../lifecycle/experience.js'

export type MaintainMode = 'light' | 'deep' | 'rem'

export interface MaintainResult {
  mode: MaintainMode
  decay: { processed: number; statusChanges: number }
  consolidation: { merged: number; updated: number; conflicts: number; skipped: number }
  experience: { created: number; skipped: number; candidates: number }
  graph: { processed: number }
  state: MaintenanceState
}

export interface MaintenanceState {
  last_light_at: string | null
  last_deep_at: string | null
  last_rem_at: string | null
  last_error: string | null
}

export interface MaintainOptions {
  mode?: MaintainMode
}

const EMPTY_DECAY = { processed: 0, statusChanges: 0 }
const EMPTY_CONSOLIDATION = { merged: 0, updated: 0, conflicts: 0, skipped: 0 }
const EMPTY_EXPERIENCE = { created: 0, skipped: 0, candidates: 0 }
const EMPTY_GRAPH = { processed: 0 }

function maintenancePath(store: FlyupMemStore): string {
  return path.join(store.basePath, '.maintenance.yaml')
}

function defaultState(): MaintenanceState {
  return {
    last_light_at: null,
    last_deep_at: null,
    last_rem_at: null,
    last_error: null,
  }
}

export function loadMaintenanceState(store: FlyupMemStore): MaintenanceState {
  const filePath = maintenancePath(store)
  if (!fs.existsSync(filePath)) return defaultState()
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Partial<MaintenanceState> | null
    return {
      ...defaultState(),
      ...(raw && typeof raw === 'object' ? raw : {}),
    }
  } catch (err) {
    return {
      ...defaultState(),
      last_error: `Failed to read .maintenance.yaml: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function saveMaintenanceState(store: FlyupMemStore, state: MaintenanceState): void {
  fs.mkdirSync(store.basePath, { recursive: true })
  fs.writeFileSync(maintenancePath(store), yaml.dump(state, { lineWidth: 120, noRefs: true }), 'utf-8')
}

function markRun(state: MaintenanceState, mode: MaintainMode, at: string): MaintenanceState {
  const next = { ...state, last_error: null }
  if (mode === 'light') next.last_light_at = at
  if (mode === 'deep') next.last_deep_at = at
  if (mode === 'rem') next.last_rem_at = at
  return next
}

function normalizeConsolidation(result: { merged: number; updated?: number; conflicts: number; skipped: number }) {
  return {
    merged: result.merged,
    updated: result.updated ?? 0,
    conflicts: result.conflicts,
    skipped: result.skipped,
  }
}

/**
 * Run maintenance by tier:
 * - light: cheap graph refresh for the current hot set
 * - deep: observation consolidation + Experience induction + graph refresh
 * - rem: full decay + consolidation + Experience induction + graph refresh
 */
export async function flyupMaintain(store: FlyupMemStore, options: MaintainOptions = {}): Promise<MaintainResult> {
  const mode = options.mode ?? 'rem'
  store.load()
  const startedAt = new Date().toISOString()
  let state = loadMaintenanceState(store)

  let decay = EMPTY_DECAY
  let consolidation = EMPTY_CONSOLIDATION
  let experience = EMPTY_EXPERIENCE
  let graph = EMPTY_GRAPH

  try {
    if (mode === 'rem') {
      const decayResult = batchDecay(store)
      decay = { processed: decayResult.processed, statusChanges: decayResult.statusChanges.length }
    }

    if (mode === 'deep' || mode === 'rem') {
      consolidation = normalizeConsolidation(await consolidateUnmerged(store))
      const expResult = induceExperiences(store, { minEvidence: 3, maxExperiences: 5, includeMentalModels: true })
      experience = {
        created: expResult.created.length,
        skipped: expResult.skipped,
        candidates: expResult.candidates,
      }
    }

    graph = maintainGraphBulk(store)
    if (graph.processed > 0) store.save()

    state = markRun(state, mode, startedAt)
    saveMaintenanceState(store, state)
  } catch (err) {
    state = {
      ...state,
      last_error: err instanceof Error ? err.message : String(err),
    }
    saveMaintenanceState(store, state)
    throw err
  }

  return { mode, decay, consolidation, experience, graph, state }
}
