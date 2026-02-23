import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0D0B08',
          card: '#161210',
          elevated: '#1E1A16',
          border: '#2E2620',
        },
        accent: {
          DEFAULT: '#C9922A',
          muted: '#C9922A30',
          glow: '#C9922A12',
        },
        cinema: {
          red: '#C8281E',
          cream: '#F2ECD8',
          brass: '#C9922A',
        },
      },
      animation: {
        'fade-in':      'fadeIn 0.35s ease-out both',
        'slide-up':     'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in':     'slideIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'pop-in':       'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'step-enter':   'stepEnter 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'glow-breathe': 'glowBreathe 4s ease-in-out infinite',
        'spin-slow':    'spin 2s linear infinite',
        'shimmer':      'shimmer 1.6s ease-in-out infinite',
        'flicker':      'flicker 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.88)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        stepEnter: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowBreathe: {
          '0%, 100%': { opacity: '0.04' },
          '50%':      { opacity: '0.10' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        flicker: {
          '0%, 95%, 100%': { opacity: '1' },
          '96%':           { opacity: '0.85' },
          '97%':           { opacity: '0.95' },
          '98%':           { opacity: '0.80' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
