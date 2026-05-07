/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        slideRight: {
          '0%':   { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        popIn: {
          '0%':   { transform: 'scale(0.92) translateY(-4px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)',        opacity: '1' },
        },
      },
      animation: {
        'slide-up':    'slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1) both',
        'scale-in':    'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':     'fadeIn 0.18s ease both',
        'fade-up':     'fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-right': 'slideRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in':      'popIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
