import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cobalt: {
          950: '#05052a',
          900: '#0a0a3e',
          800: '#0d0d5c',
          700: '#1a1a8c',
          600: '#2222b0',
        },
        gold: {
          300: '#ffe066',
          400: '#ffd700',
          500: '#ffb300',
          600: '#e6a000',
        },
      },
      fontFamily: {
        display: ['var(--font-oswald)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
      keyframes: {
        eliminate: {
          '0%':   { transform: 'scale(1) rotate(0deg)',   opacity: '1', filter: 'brightness(1)' },
          '30%':  { transform: 'scale(1.6) rotate(-8deg)', opacity: '1', filter: 'brightness(3)' },
          '60%':  { transform: 'scale(1.8) rotate(12deg)', opacity: '0.6', filter: 'brightness(2)' },
          '100%': { transform: 'scale(0) rotate(45deg)',   opacity: '0', filter: 'brightness(0)' },
        },
        questionReveal: {
          '0%':   { transform: 'scale(0.6)', opacity: '0', filter: 'brightness(4)' },
          '60%':  { transform: 'scale(1.05)', opacity: '1', filter: 'brightness(1.5)' },
          '100%': { transform: 'scale(1)',   opacity: '1', filter: 'brightness(1)' },
        },
        timerPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.15)' },
        },
        flashIn: {
          '0%':   { opacity: '0', backgroundColor: '#ffffff' },
          '20%':  { opacity: '1', backgroundColor: '#ffffff' },
          '100%': { opacity: '1', backgroundColor: 'transparent' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        winnerBurst: {
          '0%':   { transform: 'scale(0)', opacity: '0' },
          '50%':  { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        glow: {
          '0%, 100%': { textShadow: '0 0 10px #ffd700, 0 0 20px #ffd700' },
          '50%':      { textShadow: '0 0 20px #ffd700, 0 0 40px #ffd700, 0 0 60px #ffb300' },
        },
      },
      animation: {
        eliminate:       'eliminate 0.7s ease-in forwards',
        questionReveal:  'questionReveal 0.5s ease-out forwards',
        timerPulse:      'timerPulse 0.5s ease-in-out infinite',
        flashIn:         'flashIn 0.4s ease-out forwards',
        slideUp:         'slideUp 0.4s ease-out forwards',
        winnerBurst:     'winnerBurst 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        glow:            'glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
