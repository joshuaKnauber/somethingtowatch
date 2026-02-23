import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#09090c',
          card: '#111115',
          elevated: '#18181d',
          border: '#252530',
        },
        accent: {
          DEFAULT: '#e8b86d',
          muted: '#e8b86d30',
          glow: '#e8b86d12',
        },
      },
      animation: {
        'fade-in':      'fadeIn 0.35s ease-out both',
        'slide-up':     'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in':     'slideIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'pop-in':       'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'step-enter':   'stepEnter 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'glow-breathe': 'glowBreathe 5s ease-in-out infinite',
        'spin-slow':    'spin 2s linear infinite',
        'shimmer':      'shimmer 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0)   scale(1)' },
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
          '50%':      { opacity: '0.09' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
