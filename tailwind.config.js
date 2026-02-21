/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        parchment: '#F9F8F6',
        clay: '#E6E0D9',
        'clay-dark': '#D4CBC0',
        charcoal: '#323232',
        'charcoal-light': '#5A5A5A',
        'charcoal-muted': '#888888',
        surface: '#FFFFFF',
        accent: '#8B6F5C',
        'accent-light': '#C4A882',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 4px 0 rgba(50,50,50,0.07), 0 0 0 1px rgba(50,50,50,0.04)',
        'card-hover': '0 4px 16px 0 rgba(50,50,50,0.10), 0 0 0 1px rgba(50,50,50,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
