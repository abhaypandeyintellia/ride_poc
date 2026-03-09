import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/ride": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
