import defaultTheme from "tailwindcss/defaultTheme";

// Every color is a CSS variable (see src/index.css), so dark mode swaps the
// variables instead of doubling every class with dark: variants.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        subtle: token("subtle"),
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        ink: { DEFAULT: token("ink"), 2: token("ink-2") },
        muted: token("muted"),
        ring: token("ring"),
        primary: {
          DEFAULT: token("primary"),
          ink: token("primary-ink"),
          text: token("primary-text"),
          soft: token("primary-soft"),
        },
        success: { DEFAULT: token("success"), text: token("success-text"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), text: token("warning-text"), soft: token("warning-soft") },
        danger: { DEFAULT: token("danger"), text: token("danger-text"), soft: token("danger-soft") },
        info: { DEFAULT: token("info"), text: token("info-text"), soft: token("info-soft") },
      },
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 1px 3px rgb(var(--shadow) / 0.04)",
        pop: "0 16px 40px -16px rgb(var(--shadow) / 0.3), 0 2px 8px rgb(var(--shadow) / 0.06)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97) translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "scale-in": "scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
