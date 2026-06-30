import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

await build({
  configFile: false,
  root: rootDir,
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "web-src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8081,
  },
});
