// Web Audio API sound effects — no external files needed.

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function beep(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.3) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

export function playCountdownTick() {
  beep(880, 0.08, 'sine', 0.2)
}

export function playCountdownPanic() {
  // Fast double-beep for final 3 seconds
  beep(1200, 0.06, 'sine', 0.3)
  setTimeout(() => beep(1200, 0.06, 'sine', 0.3), 100)
}

export function playCorrect() {
  const ctx = getCtx()
  // Ascending fanfare
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    setTimeout(() => beep(freq, 0.18, 'sine', 0.4), i * 100)
  })
}

export function playWrong() {
  // Descending klaxon
  beep(400, 0.1, 'square', 0.4)
  setTimeout(() => beep(300, 0.1, 'square', 0.4), 120)
  setTimeout(() => beep(200, 0.3, 'square', 0.4), 240)
}

export function playElimination() {
  // Dramatic descending wail
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(600, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.6)
  gain.gain.setValueAtTime(0.5, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.7)
}

export function playGameStart() {
  // Rising fanfare
  const notes = [261, 330, 392, 523, 659]
  notes.forEach((freq, i) => {
    setTimeout(() => beep(freq, 0.15, 'sine', 0.5), i * 120)
  })
}

export function playWinner() {
  // Victory jingle
  const pattern = [523, 659, 784, 659, 784, 1047]
  const timing  = [0, 150, 300, 500, 620, 740]
  pattern.forEach((freq, i) => {
    setTimeout(() => beep(freq, 0.25, 'sine', 0.5), timing[i])
  })
}

export function playQuestionReveal() {
  beep(660, 0.05, 'sine', 0.3)
  setTimeout(() => beep(880, 0.05, 'sine', 0.3), 60)
  setTimeout(() => beep(1100, 0.12, 'sine', 0.4), 120)
}
