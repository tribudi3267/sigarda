/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Cokelat Pramuka: 800-900 = cokelat tua, 300-400 = cokelat muda
        pramuka: {
          50: '#f8f2e4',
          100: '#f0e5cc',
          200: '#e2cfa8',
          300: '#cfae7f',
          400: '#b48b5c',
          500: '#96693d',
          600: '#77502e',
          700: '#5c3d22',
          800: '#45291a',
          900: '#2e1b10',
        },
        emas: {
          DEFAULT: '#c99a1d',
          light: '#e2b84a',
          dark: '#8f6b0e',
        },
      },
      fontFamily: {
        display: ['Bitter', 'Georgia', 'serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
