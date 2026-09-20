/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0f7b3a',
        secondary: '#f59e0b',
      }
    }
  },
  plugins: [],
};
