import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Node by default; component tests under tests/components opt into jsdom
    // with a per-file `// @vitest-environment jsdom` pragma.
    environment: "node",
    passWithNoTests: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "server/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
