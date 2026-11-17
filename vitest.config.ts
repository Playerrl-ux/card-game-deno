import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        external: ["@db/sqlite", "jsr:@db/sqlite"],
      },
    },
  },
});
