import type { SharedPalette } from '../types'
import type { Skin } from './skin'

// What skins shares with other mods (the `skins.palette` state key) and with tools outside
// Claude Code (a JSON file a status line script reads): the active skin's colours, already
// resolved for the light or dark background. Null while skins is off.
export function sharedPalette(skin: Skin | undefined, isLight: boolean): SharedPalette | null {
  return skin === undefined ? null : { skin: skin.name, isLight, colors: { ...skin.palette } }
}

// The file's text. Skins off still writes, so a reader can tell "off" from "never ran".
export const paletteText = (palette: SharedPalette | null): string =>
  `${JSON.stringify(palette ?? { skin: 'off', isLight: false, colors: null }, null, 2)}\n`

// `SKINS_PALETTE_FILE` names the file; `off` writes none. By default it sits in the
// Claude config folder. Node's fs takes `/` on Windows too.
export function paletteFile(env: { override?: string; home?: string }): string | undefined {
  const override = env.override?.trim()

  if (override !== undefined && override !== '') {
    return override.toLowerCase() === 'off' ? undefined : override
  }

  const home = env.home?.replace(/[\\/]+$/, '')

  return home === undefined || home === '' ? undefined : [home, '.claude', 'skins', 'palette.json'].join('/')
}
