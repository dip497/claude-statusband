import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput, Timer } from 'claude-code'

import type { View } from '../types'

type Figures = Pick<SessionMeasureInput, 'context' | 'rateLimits'>

const CACHE_WARN_MIN = 5
const MINUTE = 60_000
const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

const view = atom({ plugin: 'statusband', key: 'view' } as const, {
  now: 0,
  model: '',
  git: '',
  context: null,
  limits: [],
  cacheTtlMin: 5,
  cacheHit: null,
  lastResponseAt: null,
})
const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])
const warned = new Set<string>()
let ticker: Timer | undefined

export const span = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / MINUTE))
  if (m >= 1440) return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`
}

export const bar = (percent: number, cells = 8): string => {
  const full = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))
  return '█'.repeat(full) + '░'.repeat(cells - full)
}

export const tone = (percent: number): string => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success')

// The main conversation caches for an hour on a subscription inside its plan's usage, five minutes otherwise.
export const cacheTtlMin = (limits: readonly { percent: number }[]): number =>
  limits.length > 0 && limits.every(l => l.percent < 100) ? 60 : 5

export type TtlControls = { force5m?: string; envTtl?: string; settingTtl?: unknown; enable1h?: string }

// What the person set wins over the default, in the order Claude Code reads its controls;
// an hour asked for is not given while the plan is on usage credits.
export const resolveTtlMin = (c: TtlControls, limits: readonly { percent: number }[]): number => {
  const asked =
    c.force5m === '1'
      ? '5m'
      : c.envTtl === '5m' || c.envTtl === '1h'
        ? c.envTtl
        : c.settingTtl === '5m' || c.settingTtl === '1h'
          ? c.settingTtl
          : c.enable1h === '1'
            ? '1h'
            : undefined
  if (asked === undefined) return cacheTtlMin(limits)
  return asked === '1h' && limits.every(l => l.percent < 100) ? 60 : 5
}

export const shortModel = (id: string): string => id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export const cacheLeft = (v: View): number | null =>
  v.lastResponseAt === null ? null : v.cacheTtlMin * MINUTE - (v.now - v.lastResponseAt)

export const gitSummary = (status: string, shortstat: string): string => {
  const lines = status.split('\n')
  const head = lines.find(l => l.startsWith('# branch.head '))?.slice(14) ?? ''
  const ab = /^# branch\.ab \+(\d+) -(\d+)/m.exec(status)
  const changed = lines.filter(l => l.startsWith('1 ') || l.startsWith('2 '))
  const count = (n: number, label: string) => (n > 0 ? `${label}${n}` : '')
  return [
    head,
    count(Number(ab?.[1] ?? 0), '⇡'),
    count(Number(ab?.[2] ?? 0), '⇣'),
    count(changed.filter(l => l[2] !== '.').length, 'S:'),
    count(changed.filter(l => l[3] !== '.').length, 'U:'),
    count(lines.filter(l => l.startsWith('? ')).length, '?:'),
    count(Number(/(\d+) insertion/.exec(shortstat)?.[1] ?? 0), '+'),
    count(Number(/(\d+) deletion/.exec(shortstat)?.[1] ?? 0), '-'),
  ]
    .filter(Boolean)
    .join(' ')
}

// A repository's own config can name programs git runs for it; none of them may run for a status read.
const GIT = ['git', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'diff.external=']

// ponytail: re-read on a measure and after a tool that can change files, not watched; an edit made outside the session shows at the next of those
async function readGit($: EngineInterface): Promise<string> {
  const status = await $.process.run([...GIT, 'status', '--porcelain=v2', '--branch'])
  if (status.exitCode !== 0) return ''
  const stat = await $.process.run([...GIT, 'diff', '--no-ext-diff', '--no-textconv', '--shortstat', 'HEAD'])
  return gitSummary(status.stdout, stat.stdout)
}

// Toasts once per crossing; dropping back under the line re-arms it.
function warnOnce($: EngineInterface, key: string, isOver: boolean, text: string): void {
  if (!isOver) warned.delete(key)
  else if (!warned.has(key)) {
    warned.add(key)
    $.ui.toast(text, { timeoutMs: 8000 })
  }
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const v = await update($, view, old => ({ ...old, now }))
  const left = cacheLeft(v)
  warnOnce(
    $,
    'cache',
    left !== null && left > 0 && left <= CACHE_WARN_MIN * MINUTE,
    `Prompt cache expires in about ${CACHE_WARN_MIN}m; the next prompt after that re-caches the whole context`,
  )
}

async function measure($: EngineInterface, figures: Figures): Promise<void> {
  const now = await $.clock.now()
  const model = shortModel(await $.session.model())
  const git = await readGit($)
  // a window with no response yet has no reading; the local estimate, when asked for, stands in
  const fill = figures.context.percent ?? figures.context.breakdown?.percentage
  const context = fill === undefined ? null : Math.round(fill)
  const limits = figures.rateLimits.map(r => ({
    label: LIMIT_LABEL[r.kind] ?? r.kind,
    percent: Math.round(r.percentUsed),
    resetsAt: r.resetsAt === undefined ? null : Date.parse(r.resetsAt),
  }))
  const controls: TtlControls = {
    force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
    envTtl: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
    settingTtl: ((await $.settings.read()) as Record<string, unknown>).promptCacheTtl,
    enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
  }
  const isSet = Object.values(controls).some(v => v !== undefined)
  // with nothing set and no reading yet, nothing is known of the plan: the lifetime already known stands
  await update($, view, old => ({
    ...old,
    now,
    model,
    git,
    context,
    limits,
    cacheTtlMin: isSet || limits.length > 0 ? resolveTtlMin(controls, limits) : old.cacheTtlMin,
  }))
}

async function refreshGit($: EngineInterface): Promise<void> {
  const git = await readGit($)
  await update($, view, old => (old.git === git ? old : { ...old, git }))
}

// Reads the figures now, for a moment the engine raises no measurement of its own.
async function remeasure($: EngineInterface): Promise<void> {
  await measure($, await $.session.usage({ breakdown: 'summary' }))
}

// A cache nothing can read any more: 0 is long enough ago to be past any lifetime.
async function chillCache($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, view, old => ({ ...old, now, lastResponseAt: 0, cacheHit: null }))
}

async function touchCache($: EngineInterface, cacheHit?: number | null): Promise<void> {
  const now = await $.clock.now()
  await update($, view, old => ({ ...old, now, lastResponseAt: now, cacheHit: cacheHit === undefined ? old.cacheHit : cacheHit }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // drops the line an earlier version of this mod pinned under the prompt
    $.ui.status(undefined)
    await remeasure($)
    // keeps the countdowns moving between turns; a session that starts over keeps one timer
    ticker?.cancel()
    ticker = $.clock.every(MINUTE, () => void tick($))
    return next(e)
  })

  // a resumed session says how long it sat idle and whether its cache outlived that
  on('classic.SessionStart', async ($, e, next) => {
    const idleMs = (e.seconds_since_last_response ?? 0) * 1000
    // a cleared conversation has no turn left for the hit rate to describe
    if (e.source === 'clear') {
      await update($, view, old => ({ ...old, cacheHit: null }))
      await remeasure($)
    } else if (e.prompt_cache_likely_expired === true) await chillCache($)
    else if (e.seconds_since_last_response !== undefined) {
      const now = await $.clock.now()
      await update($, view, old => ({
        ...old,
        now,
        lastResponseAt: now - idleMs,
        cacheHit: null,
        cacheTtlMin: idleMs > 5 * MINUTE ? 60 : old.cacheTtlMin,
      }))
    }
    return next(e)
  })

  // each model has a cache of its own, and a compacted history shares no prefix with the old one
  // Neither is followed by a measurement until the next turn, and both move the context figure.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await chillCache($)
    await remeasure($)
    return next(e)
  })

  on('classic.PostCompact', async ($, e, next) => {
    await chillCache($)
    await remeasure($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e)
    return next(e)
  })

  // a tool call follows a response, so the cache was just touched; a subagent's requests touch only its own
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await touchCache($)
    const ran = await next(e)
    if (FILE_TOOLS.has(e.tool)) await refreshGit($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage !== undefined) {
      const u = e.usage
      const input = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await touchCache($, input === 0 ? null : Math.round((u.cache_read_input_tokens / input) * 100))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || v.model === '') return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const left = cacheLeft(v)
    const cacheTone = left === null || left <= 0 ? 'error' : left <= CACHE_WARN_MIN * MINUTE ? 'warning' : 'success'

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Box gap={2}>
          <Text bold color="cyan">{v.model}</Text>
          {v.context !== null && (
            <Text>
              <Text dimColor>ctx </Text>
              <Text color={tone(v.context)}>{bar(v.context)} {v.context}%</Text>
            </Text>
          )}
          {left !== null && (
            <Text>
              <Text dimColor>cache </Text>
              <Text color={cacheTone}>
                {left <= 0 ? 'cold' : `${v.cacheHit === null ? '' : `${v.cacheHit}% hit · `}${span(left)} left`}
              </Text>
            </Text>
          )}
        </Box>
        <Box gap={2}>
          {v.limits.map(l => (
            <Text key={l.label}>
              <Text dimColor>{l.label} </Text>
              <Text color={tone(l.percent)}>{bar(l.percent)} {l.percent}%</Text>
              {l.resetsAt !== null && l.resetsAt > v.now && <Text dimColor> resets {span(l.resetsAt - v.now)}</Text>}
            </Text>
          ))}
          {v.git !== '' && <Text color="magenta" wrap="truncate-end">{v.git}</Text>}
        </Box>
      </Box>
    )
  })
}
