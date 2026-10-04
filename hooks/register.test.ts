import { expect, mock, test } from 'claude-code/testing'

import { bar, cacheTtlMin, gitSummary, resolveTtlMin, shortModel, span, tone } from './register'

test('span, bar and tone', async () => {
  expect(span(72 * 60_000)).toBe('1h12m')
  expect(span(100 * 3_600_000)).toBe('4d4h')
  expect(bar(50)).toBe('████░░░░')
  expect(bar(140)).toBe('████████')
  expect(shortModel('claude-opus-5-5')).toBe('opus-5-5')
  expect([cacheTtlMin([]), cacheTtlMin([{ percent: 64 }]), cacheTtlMin([{ percent: 100 }])]).toEqual([5, 60, 5])
  expect([tone(42), tone(70), tone(90)]).toEqual(['success', 'warning', 'error'])
})

test('gitSummary counts staged, unstaged, untracked and ahead/behind', async () => {
  const status = [
    '# branch.oid abc',
    '# branch.head main',
    '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 a b staged.ts',
    '1 .M N... 100644 100644 100644 a b unstaged.ts',
    '? new.ts',
  ].join('\n')
  expect(gitSummary(status, ' 2 files changed, 3 insertions(+), 1 deletion(-)')).toBe('main ⇡2 ⇣1 S:1 U:1 ?:1 +3 -1')
})

test('the band draws the measured figures on the terminal', async ($, on) => {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  mock.env(on, {})
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23.5 }],
      cost: { usd: 1.234 },
    },
  }))
  on('session.model', () => ({ value: 'opus' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  const ui = await $.ui.mount({ plugin: 'statusband', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } } as never)
  expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeDefined()
  await ui.unmount()
})

test('a model switch turns a warm cache cold', async ($, on) => {
  on('classic.PostModelSwitch', () => ({}) as never)
  // a real clock reads far from 0, which the mod keeps for a cache already gone
  await mock.clock(on).advance(36_000_000)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  mock.env(on, {})
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'opus' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  const usage = { model: 'opus', input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 98, cache_creation_input_tokens: 0 }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', usage } as never)
  const BAND = { plugin: 'statusband', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } } as never
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /98% hit/ })).toBeDefined()
  await ui.unmount()
  await $.classic.PostModelSwitch({ from_model: 'opus', to_model: 'sonnet' } as never)
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /98% hit/ })).toBeUndefined()
  await ui.unmount()
})

test('a compact refreshes the context figure without waiting for the next turn', async ($, on) => {
  on('classic.PostCompact', () => ({}) as never)
  await mock.clock(on).advance(36_000_000)
  let usage: unknown = { startedAt: 0, context: { window: 200000, percent: 80 }, rateLimits: [] }
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  mock.env(on, {})
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({ value: usage }) as never)
  on('session.model', () => ({ value: 'opus' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  const BAND = { plugin: 'statusband', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } } as never
  let ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /80%/ })).toBeDefined()
  await ui.unmount()
  // the live window has no reading until the next response; the local estimate stands in
  usage = { startedAt: 0, context: { window: 200000, breakdown: { percentage: 12.4 } }, rateLimits: [] }
  await $.classic.PostCompact({ trigger: 'manual', compact_summary: '' } as never)
  ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /80%/ })).toBeUndefined()
  await ui.unmount()
})

test('a cache lifetime the person set wins over the plan default', async () => {
  const inPlan = [{ percent: 40 }]
  expect(resolveTtlMin({}, inPlan)).toBe(60)
  expect(resolveTtlMin({ settingTtl: '5m' }, inPlan)).toBe(5)
  expect(resolveTtlMin({ settingTtl: '1h' }, [])).toBe(60)
  expect(resolveTtlMin({ envTtl: '1h', settingTtl: '5m' }, [])).toBe(60)
  expect(resolveTtlMin({ force5m: '1', envTtl: '1h', enable1h: '1' }, inPlan)).toBe(5)
  expect(resolveTtlMin({ enable1h: '1' }, [])).toBe(60)
  expect(resolveTtlMin({ settingTtl: '1h' }, [{ percent: 100 }])).toBe(5)
  expect(resolveTtlMin({ settingTtl: 'nonsense' }, [])).toBe(5)
})

test('git counts refresh after a tool that edits files', async ($, on) => {
  mock.clock(on)
  let untracked = ''
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  mock.env(on, {})
  on('settings.read', () => ({ value: {} }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }) as never)
  on('session.model', () => ({ value: 'opus' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '# branch.head main\n' + untracked, stderr: '' } }) as never)
  on('tool.call', () => ({ result: '' }) as never)
  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  untracked = '? new.ts\n'
  await $.tool.call({ tool: 'Write', file_path: '/tmp/new.ts', content: '' } as never)
  const ui = await $.ui.mount({ plugin: 'statusband', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } } as never)
  expect(await ui.find({ type: 'Text', text: /main \?:1/ })).toBeDefined()
  await ui.unmount()
})
