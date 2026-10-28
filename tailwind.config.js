/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bms: {
          red: '#F84464',
          dark: '#0e1017',
          card: '#161922',
          border: '#262b3a',
          accent: '#2b3145',
        },
      },
    },
  },
  plugins: [],
};

