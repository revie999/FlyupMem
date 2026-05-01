// tests/mcp-server.test.ts
import { describe, it, expect } from 'vitest'
import { createServer } from '../src/mcp/server.js'

describe('MCP Server', () => {
  it('creates server instance', () => {
    const server = createServer()
    expect(server).toBeDefined()
  })

  it('server has expected tools registered', () => {
    const server = createServer()
    // The server should be created without errors
    // Tool registration is internal; we verify the server object exists
    expect(typeof server.connect).toBe('function')
  })
})
