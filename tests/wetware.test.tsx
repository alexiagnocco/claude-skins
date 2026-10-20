import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bodyOf } from '../hooks/detail'
import { paletteFile, paletteText, sharedPalette } from '../hooks/share'
import tokyoNight from '../hooks/themes/tokyo-night'
import { drawnByWetware, memoryWord } from '../hooks/wetware'

// What the fork shares with the wetware mod and the status line: the palette, the memory
// spinner words, and the answers it leaves for wetware to draw.

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 30 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

type Write = { path: string; text: string }

function stub(on: On, env: Record<string, string> = {}, writes: Write[] = []) {
  mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', () => STOCK)
}

const runSkin = ($: Engine, args: string) =>
  $.command.run({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

test('wetware calls get a memory word by what they do, every other tool none', async () => {
  expect(memoryWord('mcp__wetware__wetware_search')).toBe('Recalling')
  expect(memoryWord('mcp__wetware__wetware_why')).toBe('Recalling')
  expect(memoryWord('mcp__wetware__wetware_write')).toBe('Remembering')
  expect(memoryWord('mcp__wetware__wetware_forget')).toBe('Remembering')
  expect(memoryWord('mcp__wetware__wetware_flush')).toBe('Consolidating')
  expect(memoryWord('mcp__wetware__wetware_task_list')).toBe('Filing')
  expect(memoryWord('mcp__wetware__wetware_task_add')).toBe('Filing')
  expect(memoryWord('mcp__jira__get_issue')).toBeUndefined()
  expect(memoryWord('Bash')).toBeUndefined()
})

test('wetware draws its search, get, why and task answers; skins keeps the rest', async () => {
  expect(drawnByWetware('mcp__wetware__wetware_search')).toBe(true)
  expect(drawnByWetware('mcp__wetware__wetware_task_reconcile')).toBe(true)
  expect(drawnByWetware('mcp__wetware__wetware_write')).toBe(false)
  expect(drawnByWetware('mcp__jira__search_issues')).toBe(false)

  // An opened row shows the input alone: the answer is drawn below it, by wetware.
  expect(bodyOf('mcp__wetware__wetware_search', '{"cards":[]}', false, false, '').kind).toBe('none')
  expect(bodyOf('mcp__jira__search_issues', '{"issues":[]}', false, false, '').kind).not.toBe('none')
})

test('the palette file sits in the Claude folder, moves with SKINS_PALETTE_FILE, and off writes none', async () => {
  expect(paletteFile({ home: '/home/a' })).toBe('/home/a/.claude/skins/palette.json')
  expect(paletteFile({ home: 'C:\\Users\\a\\' })).toBe('C:\\Users\\a/.claude/skins/palette.json')
  expect(paletteFile({ override: '/tmp/p.json', home: '/home/a' })).toBe('/tmp/p.json')
  expect(paletteFile({ override: 'off', home: '/home/a' })).toBeUndefined()
  expect(paletteFile({})).toBeUndefined()
})

test('the shared palette names the skin and its colours, and off says so', async () => {
  expect(sharedPalette(undefined, false)).toBeNull()
  expect(sharedPalette(tokyoNight, true)).toEqual({ skin: 'tokyo-night', isLight: true, colors: { ...tokyoNight.palette } })
  expect(JSON.parse(paletteText(null))).toEqual({ skin: 'off', isLight: false, colors: null })
})

// Every value the skins plugin writes under `key`, in order.
function writesOf(on: On, key: string): unknown[] {
  const values: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === key) {
      values.push(e.value)
    }

    return next(e)
  })

  return values
}

test('switching skins shares the new palette in state and in the file, once per change', async ($, on) => {
  const writes: Write[] = []
  stub(on, { HOME: '/home/a' }, writes)
  const shared = writesOf(on, 'palette') as ({ skin: string; colors: Record<string, string> } | null)[]

  await runSkin($, 'tokyo-night')
  expect(shared.at(-1)?.skin).toBe('tokyo-night')
  expect(shared.at(-1)?.colors.mcp).toBe(tokyoNight.palette.mcp)
  expect(writes.at(-1)?.path).toBe('/home/a/.claude/skins/palette.json')
  expect(JSON.parse(writes.at(-1)?.text ?? '{}').skin).toBe('tokyo-night')

  const before = writes.length
  await runSkin($, 'rail off')
  expect(writes.length).toBe(before)

  await runSkin($, 'off')
  expect(shared.at(-1)).toBeNull()
  expect(JSON.parse(writes.at(-1)?.text ?? '{}').skin).toBe('off')
})

test('a wetware call holds its memory word while it runs and lets go after', async ($, on) => {
  stub(on)
  const words = writesOf(on, 'memoryWord') as ({ word: string } | null)[]
  on('tool.call', () => ({ result: '{"cards":[]}' }))

  await $.tool.call({ tool: 'mcp__wetware__wetware_search', query: 'x' } as never)
  expect(words.map(held => held?.word ?? null)).toEqual(['Recalling', null])

  await $.tool.call({ tool: 'mcp__jira__get_issue', key: 'DMA-1' } as never)
  expect(words.length).toBe(2)
})

test('the spinner says the memory word in the skin’s mcp colour', async ($, on) => {
  stub(on)
  let reached = () => {}
  let release = () => {}
  const isReached = new Promise<void>(resolve => {
    reached = resolve
  })
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  on('tool.call', async () => {
    reached()
    await held
    return { result: '{"id":"x"}' }
  })

  const running = $.tool.call({ tool: 'mcp__wetware__wetware_write', gist: 'x' } as never)
  await isReached
  const ui = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'Spinner', requestId: 'main', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } } as never)
  expect(await ui.find({ type: 'Text', text: /Remembering/ })).toBeDefined()
  await ui.unmount()
  release()
  await running
})

const call = (id: string, tool: string) => ({ tool_use_id: id, tool, input: { query: 'x' }, output: '{"cards":[]}', isRunning: false, isErrored: false, isInterrupted: false })

test('an opened wetware row leaves its answer to wetware, another mcp row draws its own', async ($, on) => {
  stub(on)
  const result = (id: string, tool: string) =>
    ({ ...SITE, surface: 'terminal', component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool, output: '{"cards":[]}', isErrored: false } }) as const

  for (const [id, tool] of [['w1', 'mcp__wetware__wetware_search'], ['j1', 'mcp__jira__search_issues']] as const) {
    const row = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'ToolUse', requestId: id, props: call(id, tool) } as never)
    await row.press({ key: 'disclose' })
    await row.unmount()
  }

  const wetware = await $.ui.mount(result('w1', 'mcp__wetware__wetware_search'))
  expect(await wetware.find({ type: 'Text', text: 'stock row' })).toBeDefined()
  await wetware.unmount()

  const jira = await $.ui.mount(result('j1', 'mcp__jira__search_issues'))
  expect(await jira.find({ type: 'Text', text: 'stock row' })).toBeUndefined()
})

test('the usage band is off until the person turns it on', async ($, on) => {
  stub(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))
  on('config.list', () => ({ value: [] }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = { ...SITE, surface: 'terminal', component: 'AbovePrompt', requestId: 'prompt', props: { bodyColumns: 100, isWorking: false, hasSurvey: false } } as never

  const off = await $.ui.mount(band)
  expect(await off.find({ type: 'Text', text: 'stock row' })).toBeDefined()
  await off.unmount()

  await runSkin($, 'band on')
  const on_ = await $.ui.mount(band)
  expect(await on_.find({ type: 'Text', text: /42%/ })).toBeDefined()
})
