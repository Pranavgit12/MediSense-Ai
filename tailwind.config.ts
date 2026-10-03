import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F3EDD8',
          100: '#EFE8CF',
          200: '#E7E0C6',
          300: '#E0D8BA',
          400: '#7FBF9E',
          500: '#2E7D57',
          600: '#2D734B',
          700: '#1E4D3A',
          800: '#1E4D3A',
          900: '#163A2B',
          950: '#163A2B',
        },
        accent: {
          50: '#F3EDD8',
          100: '#EFE8CF',
          200: '#E7E0C6',
          300: '#E0D8BA',
          400: '#7FBF9E',
          500: '#2E7D57',
          600: '#2D734B',
          700: '#1E4D3A',
          800: '#1E4D3A',
          900: '#163A2B',
          950: '#163A2B',
        },
        sand: {
          50: '#F3EDD8',
          100: '#EFE8CF',
          200: '#E7E0C6',
          300: '#E0D8BA',
          400: '#6D8C75',
          500: '#5F6F66',
          600: '#5F6F66',
          700: '#1A2B24',
          800: '#1E4D3A',
          900: '#163A2B',
        },
        ink: {
          50: '#F3EDD8',
          100: '#EFE8CF',
          200: '#E7E0C6',
          300: '#6D8C75',
          400: '#6D8C75',
          500: '#5F6F66',
          600: '#5F6F66',
          700: '#1A2B24',
          800: '#1A2B24',
          900: '#1A2B24',
          950: '#163A2B',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Tabular figures for every clinical number. Without this, a value
        // column jitters as digits change width between renders.
        numeric: ['var(--font-sans)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(30,77,58,0.08), 0 10px 24px -18px rgba(30,77,58,0.14)',
        lift: '0 8px 20px -14px rgba(30,77,58,0.2)',
        soft: '0 10px 32px -24px rgba(30,77,58,0.18)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.09)',
        focus: '0 0 0 4px rgba(46,125,87,0.2)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        // Question-to-question transition. Slides from the right so the flow
        // reads as moving forward rather than blinking in place.
        'slide-in-next': {
          from: { opacity: '0', transform: 'translateX(14px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-prev': {
          from: { opacity: '0', transform: 'translateX(-14px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        // Slow drift for the hero glow blobs. Deliberately long and subtle.
        'drift-a': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(3%, -4%, 0) scale(1.08)' },
        },
        'drift-b': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1.05)' },
          '50%': { transform: 'translate3d(-4%, 3%, 0) scale(1)' },
        },
        // ECG trace draw. A stroke-dashoffset animation on the hero waveform.
        'trace': {
          from: { strokeDashoffset: '1200' },
          to: { strokeDashoffset: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 320ms ease-out both',
        'fade-in': 'fade-in 240ms ease-out both',
        'slide-in-next': 'slide-in-next 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-prev': 'slide-in-prev 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'drift-a': 'drift-a 18s ease-in-out infinite',
        'drift-b': 'drift-b 22s ease-in-out infinite',
        trace: 'trace 2.4s cubic-bezier(0.65, 0, 0.35, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
