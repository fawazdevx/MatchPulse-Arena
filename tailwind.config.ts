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
          live: "#22D391",
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
          DEFAULT: "#0B2038",
          muted: "#0E2743",
          elevated: "#123054"
        },
        navy: {
          DEFAULT: "#081A2F",
          deep: "#050F1D"
        },
        electric: {
          DEFAULT: "#1570EF",
          soft: "#3B8CFF"
        },
        neon: {
          DEFAULT: "#21E6A3",
          soft: "#5CF0C0"
        },
        alert: "#FF3B30"
      },
      backgroundImage: {
        "stadium-glow": "radial-gradient(circle at top, rgba(21, 112, 239, 0.16) 0%, transparent 70%)",
        "live-pulse": "linear-gradient(90deg, rgba(33, 230, 163, 0.16) 0%, transparent 100%)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        pulse: "0 20px 60px rgba(5, 15, 29, 0.5)",
        "premium-glow": "0 14px 40px -10px rgba(21, 112, 239, 0.5), 0 0 0 1px rgba(21, 112, 239, 0.14)",
        "live-glow": "0 14px 36px -12px rgba(33, 230, 163, 0.55), 0 0 0 1px rgba(33, 230, 163, 0.16)",
        "glow-electric": "0 0 18px rgba(21, 112, 239, 0.45)",
        "glow-neon": "0 0 18px rgba(33, 230, 163, 0.45)"
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "ui-sans-serif", "system-ui", "sans-serif"],
        hanken: ["var(--font-hanken)", "ui-sans-serif", "system-ui", "sans-serif"],
        anybody: ["var(--font-anybody)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
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
        },
        "live-dot-pulse": {
          "0%": { boxShadow: "0 0 0 0 rgba(255, 59, 48, 0.6)" },
          "70%": { boxShadow: "0 0 0 10px rgba(255, 59, 48, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255, 59, 48, 0)" }
        },
        "momentum-drift": {
          "0%, 100%": { transform: "translateX(-6%)" },
          "50%": { transform: "translateX(6%)" }
        }
      },
      animation: {
        "clock-tick": "clock-tick 600ms cubic-bezier(0.2, 0.9, 0.25, 1)",
        "energy-pulse": "energy-pulse 1.8s ease-in-out infinite",
        "live-dot-pulse": "live-dot-pulse 1.6s ease-out infinite",
        "momentum-drift": "momentum-drift 8s ease-in-out infinite"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
