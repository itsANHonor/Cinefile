/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7f7',
          100: '#dbeded',
          200: '#b9dbdb',
          300: '#8cc1c1',
          400: '#5aa2a2',
          500: '#3d8585',
          600: '#2d5a5a',
          700: '#274b4b',
          800: '#223e3e',
          900: '#1e3434',
          950: '#0f1e1e',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        content: 'rgb(var(--text) / <alpha-value>)',
        'content-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      borderColor: {
        subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'header': 'var(--header-h)',
        'tabbar': 'var(--tabbar-h)',
      },
      minHeight: {
        touch: '2.75rem',
      },
      minWidth: {
        touch: '2.75rem',
      },
      screens: {
        xs: '400px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
