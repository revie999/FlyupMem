// src/tools/flyup_dashboard.ts — CLI entry point for Web Dashboard

import type { DashboardOptions } from '../web/server.js'

export interface DashboardResult {
  success: boolean
  url?: string
  port?: number
  error?: string
}

/**
 * Start the FlyupMem Web Dashboard.
 */
export async function flyupDashboard(options: DashboardOptions = {}): Promise<DashboardResult> {
  const { startDashboard } = await import('../web/server.js')

  try {
    const { port, url } = await startDashboard(options)
    return { success: true, url, port }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
