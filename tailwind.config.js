/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      spacing: {
        'unit': '4px',
        'gutter': '24px',
        'margin-mobile': '16px',
        'margin-desktop': '64px',
        'container-max': '1280px',
        'section-gap': '120px'
      },

      aspectRatio: {
        auto: 'auto',
        square: '1 / 1',
        video: '16 / 9',
      },
      colors: {
        'alviora-bg': '#ffffff',
        'alviora-surface': '#f8fafc',
        'alviora-primary': '#1C5FA8',
        'alviora-heading': '#0f172a',
        'alviora-body': '#334155',
        'alviora-border': '#e2e8f0',
        'alviora-accent': '#1C5FA8',
        'alviora-accent-dim': '#7EA3CC',
        'error-container': '#fee2e2',
        'on-error-container': '#991b1b',

        border: "#e4e4e7",
        input: "#e4e4e7",
        ring: "#a1a1aa",
        background: "#ffffff",
        foreground: "#09090b",
        primary: {
          DEFAULT: "#18181b",
          foreground: "#fafafa",
        },
        secondary: {
          DEFAULT: "#f4f4f5",
          foreground: "#18181b",
        },
        destructive: {
          DEFAULT: "#e60000",
          foreground: "#f8fafc",
        },
        muted: {
          DEFAULT: "#f4f4f5",
          foreground: "#71717a",
        },
        accent: {
          DEFAULT: "#f4f4f5",
          foreground: "#18181b",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#09090b",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#09090b",
        },
        sidebar: {
          DEFAULT: "#fafafa",
          foreground: "#09090b",
          primary: "#18181b",
          "primary-foreground": "#fafafa",
          accent: "#f4f4f5",
          "accent-foreground": "#18181b",
          border: "#e4e4e7",
          ring: "#a1a1aa",
        },
        chart: {
          1: "#5eead4",
          2: "#06b6d4",
          3: "#0891b2",
          4: "#0e7490",
          5: "#164e63",
        },
        ui: {
          bg: '#F6F7F9',
          surface: '#FFFFFF',
          muted: '#F1F4F7',
          border: '#E2E8F0',
          text: '#111827',
          'text-muted': '#64748B',
          primary: '#0F766E',
          'primary-soft': '#E7F6F3',
        },
        ssf: {
          primary: '#0F766E',
          gold: '#C89116',
          bg: '#F6F7F9',
          surface: '#FFFFFF',
          text: '#0F172A',
          "text-muted": '#64748B',
        },
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-bold": ["Poppins_700Bold"],
        "poppins-black": ["Poppins_900Black"],
        cooper: ["CooperBlack"],
        sans: ["InterVariable", "Inter", "sans-serif"],
      },
      borderRadius: {
        lg: "0.45rem",
        md: "calc(0.45rem - 2px)",
        sm: "calc(0.45rem - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
}
