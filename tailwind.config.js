/** @type {import('tailwindcss').Config} */
// Palette and radii follow .claude/DESIGN.md (flat, monochrome, phosphor-green punctuation).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        phosphor: "#3ecf8e",
        mint: "#00c573",
        forest: "#1f4b37",
        midnight: "#006239",
        snow: "#fafafa",
        silver: "#b4b4b4",
        smoke: "#898989",
        graphite: "#4d4d4d",
        hairline: "#393939",
        charcoal: "#2e2e2e",
        ash: "#242424",
        obsidian: "#121212",
      },
      fontFamily: {
        sans: ["Circular", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Source Code Pro", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { card: "16px", input: "8px" },
    },
  },
  plugins: [],
};
