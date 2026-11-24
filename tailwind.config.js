/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#121015', 900: '#1a171e', 800: '#24202a', 700: '#2f2a36', 600: '#3d3746' },
        cream: { 100: '#f3e9dc', 300: '#d9cbb8', 500: '#a8998a' },
        kick: '#e8916b',
        snare: '#e6c27a',
        hat: '#9ccf9a',
        openhat: '#7fc4c9',
        perc: '#b6a2e0',
        bass: '#e58fae',
        chord: '#8fb3e5',
      },
      fontFamily: {
        sans: ['"Nunito"', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
