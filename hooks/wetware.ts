// The wetware memory mod draws its own answers for these tools, as cards in the skin
// (through `$.skins.markdown`). Skins keeps their row and leaves the answer to it.
const DRAWN_BY_WETWARE = /^mcp__wetware__wetware_(search|get|why|task_[a-z_]+)$/

export const drawnByWetware = (tool: string): boolean => DRAWN_BY_WETWARE.test(tool)

const WORDS: readonly [RegExp, string][] = [
  [/^wetware_task_/, 'Filing'],
  [/^wetware_(search|get|why)$/, 'Recalling'],
  [/^wetware_(flush|backfill)$/, 'Consolidating'],
  [/^wetware_(write|pin|protect|link|alias|forget|handoff_mark)$/, 'Remembering'],
]

// The spinner's word while a wetware call runs, the same in every skin. Undefined for
// every other tool.
export function memoryWord(tool: string): string | undefined {
  const name = /^mcp__wetware__(.+)$/.exec(tool)?.[1]

  return name === undefined ? undefined : WORDS.find(([pattern]) => pattern.test(name))?.[1]
}
