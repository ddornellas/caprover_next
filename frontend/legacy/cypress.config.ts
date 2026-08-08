import { defineConfig } from "cypress"

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:4500",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
