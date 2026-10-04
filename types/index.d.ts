export type Limit = { label: string; percent: number; resetsAt: number | null }

export type View = {
  now: number
  model: string
  git: string
  context: number | null
  limits: Limit[]
  // prompt cache lifetime in minutes, derived from the plan's usage
  cacheTtlMin: number
  // share of the last turn's input the prompt cache served, 0 to 100
  cacheHit: number | null
  // when the cache was last touched; every response restarts its lifetime
  lastResponseAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'statusband': { view: View }
  }
}
