let _soundOn = true
let _musicOn = true
const cache: Record<string, HTMLAudioElement> = {}
let music: HTMLAudioElement | null = null
let _musicStarted = false

export function isSoundOn() { return _soundOn }
export function isMusicOn() { return _musicOn }

export function setSoundOn(v: boolean) { _soundOn = v }

export function setMusicOn(v: boolean) {
  _musicOn = v
  if (!music) return
  if (v && _musicStarted) music.play().catch(() => {})
  else music.pause()
}

export function preloadSounds() {
  const names = ['attack', 'build', 'coin', 'end_turn', 'kb_press', 'menu_button', 'select_unit', 'walk']
  for (const name of names) {
    const a = new Audio(`/sound/${name}.ogg`)
    a.preload = 'auto'
    cache[name] = a
  }
  music = new Audio('/sound/music.ogg')
  music.loop = true
  music.volume = 0.3
  music.preload = 'auto'
}

export function playSound(name: string) {
  if (!_soundOn) return
  const src = cache[name]
  if (!src) return
  const clone = src.cloneNode() as HTMLAudioElement
  clone.volume = 0.7
  clone.play().catch(() => {})
}

/** Must be called on a user gesture — browsers block autoplay until then. */
export function startMusicIfNeeded() {
  _musicStarted = true
  if (!_musicOn || !music || !music.paused) return
  music.play().catch(() => {})
}
