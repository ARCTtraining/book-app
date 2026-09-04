import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Everything under test is pure domain logic — no DOM needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
