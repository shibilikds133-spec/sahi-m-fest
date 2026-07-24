/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      aspectRatio: {
        auto: 'auto',
        square: '1 / 1',
        video: '16 / 9',
      },
      colors: {
        ssf: {
          primary: '#065F46',
          gold: '#D4AF37',
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          text: '#0F172A',
          "text-muted": '#64748B',
        },
        dash: {
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          'surface-2': '#F1F5F9',
          navy: {
            900: '#0F172A',
            800: '#1E293B',
            700: '#334155',
            600: '#475569',
            200: '#E2E8F0',
            100: '#F1F5F9',
          },
          emerald: {
            700: '#047857',
            600: '#059669',
            500: '#10B981',
            100: '#D1FAE5',
          },
          amber: {
            500: '#F59E0B',
            100: '#FEF3C7',
          },
          red: {
            500: '#EF4444',
            100: '#FEE2E2',
          },
          blue: {
            500: '#3B82F6',
            100: '#DBEAFE',
          }
        },
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-bold": ["Poppins_700Bold"],
        "poppins-black": ["Poppins_900Black"],
        cooper: ["CooperBlack"],
      },
    },
  },
  plugins: [],
}
