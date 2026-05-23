import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rainforest: "#004e50",
        "rainforest-deep": "#003a3c",
        sand: "#e2dccd",
        "sand-page": "#efeae0",
        gold: "#d3a75d",
        "gold-soft": "#c79a4f",
        "brand-black": "#1a1a1a",
        "grey-text": "#5e5e5e",
        "grey-light": "#eeeeee",
        rust: "#b7583a",
        "teal-light": "#7a9e9f",
      },
      fontFamily: {
        sans: ["var(--font-open-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["var(--font-cormorant)", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
