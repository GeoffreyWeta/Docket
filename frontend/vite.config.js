import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base '/static/' so the built assets are served by Django + WhiteNoise in production.
export default defineConfig({
  base: "/static/",
  plugins: [react()],
  server: {
    // /demo-api is where the bundle talks once /demo has been opened; Django
    // answers it as its own API while DEMO_LOGIN is on (see docket/urls.py).
    proxy: { "/api": "http://localhost:8000", "/demo-api": "http://localhost:8000" },
  },
});
