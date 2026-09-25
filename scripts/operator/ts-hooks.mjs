// Gate C1 (Issue #84) — minimal, afhængighedsfri resolver, så operatør-
// entrypoints kan køre repoets TypeScript direkte med Node 24's indbyggede
// type-stripping (`node --import ./scripts/operator/ts-hooks.mjs <fil>.ts`).
// Løser kun (a) extensionløse relative imports til .ts/.tsx/index.ts og
// (b) "@/"-aliaset til src/. Ingen netværk, ingen kodegenerering.
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

function tryFile(base) {
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return pathToFileURL(cand).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base !== null && path.extname(base) === "") {
      const hit = tryFile(base);
      if (hit) return nextResolve(hit, context);
    }
    return nextResolve(specifier, context);
  },
});
