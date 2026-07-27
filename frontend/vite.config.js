import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base '/static/' so the built assets are served by Django + WhiteNoise in production.
export default defineConfig({
  base: "/static/",
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
