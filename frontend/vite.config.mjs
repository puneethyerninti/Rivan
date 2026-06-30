import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "web-src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8081,
  },
});
