import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Kun det komponent- og route-tests kræver: path-aliaset fra tsconfig.json
// ("@/*" → "src/*") og en JSX-transform (tsconfig har "jsx": "preserve",
// fordi Next selv transformerer). Ingen andre ændringer af vitests
// standardopførsel (include, environment m.m.).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
});
