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
        nebula: {
          space: '#05060f',
          surface: 'rgba(255, 255, 255, 0.03)',
          border: 'rgba(255, 255, 255, 0.08)',
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          magenta: '#ec4899',
          starlight: '#f8fafc',
          glow: 'rgba(139, 92, 246, 0.25)'
        },
        ide: {
          bg: '#0d1117',
          surface: '#161b22',
          border: '#30363d',
          accent: '#58a6ff',
          success: '#2ea043',
          danger: '#f85149'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Space Grotesk', 'sans-serif']
      },
      boxShadow: {
        'nebula-glow': '0 0 50px -10px rgba(139, 92, 246, 0.35)',
        'cyan-glow': '0 0 35px -5px rgba(6, 182, 212, 0.4)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 20s linear infinite'
      }
    },
  },
  plugins: [],
};

