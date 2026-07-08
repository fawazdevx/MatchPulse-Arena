import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: ["class"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1180px"
      }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "#1bf58c"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          live: "#00e676",
          pulse: "#ff3b30",
          reward: "#ffcc00"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        surface: {
          DEFAULT: "#0b1220",
          muted: "#121b2e",
          elevated: "#1a2540"
        }
      },
      backgroundImage: {
        "stadium-glow": "radial-gradient(circle at top, rgba(0, 102, 255, 0.12) 0%, transparent 70%)",
        "live-pulse": "linear-gradient(90deg, rgba(0, 230, 118, 0.15) 0%, transparent 100%)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        pulse: "0 20px 60px rgba(8, 28, 50, 0.12)",
        "premium-glow": "0 14px 40px -10px rgba(0, 102, 255, 0.5), 0 0 0 1px rgba(0, 102, 255, 0.12)",
        "live-glow": "0 14px 36px -12px rgba(0, 230, 118, 0.55), 0 0 0 1px rgba(0, 230, 118, 0.14)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"]
      },
      keyframes: {
        "clock-tick": {
          "0%": { transform: "scale(1)", filter: "brightness(1)" },
          "50%": { transform: "scale(1.06)", filter: "brightness(1.3)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" }
        },
        "energy-pulse": {
          "0%, 100%": { opacity: "0.7", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" }
        }
      },
      animation: {
        "clock-tick": "clock-tick 600ms cubic-bezier(0.2, 0.9, 0.25, 1)",
        "energy-pulse": "energy-pulse 1.8s ease-in-out infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
