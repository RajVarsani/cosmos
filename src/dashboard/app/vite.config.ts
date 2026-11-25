import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// dev and preview forward /api to the running dashboard; origin is rewritten so its cross-origin guard accepts posts
const api = {
  "/api": {
    target: "http://127.0.0.1:20000",
    changeOrigin: true,
    configure: (proxy: { on: (ev: "proxyReq", fn: (req: { setHeader: (k: string, v: string) => void }) => void) => void }) =>
      proxy.on("proxyReq", (req) => req.setHeader("origin", "http://127.0.0.1:20000")),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  css: { modules: { localsConvention: "camelCaseOnly" } },
  server: { port: 20002, strictPort: true, proxy: api },
  preview: { port: 20002, strictPort: true, proxy: api },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
