import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api": {
      target: env.API_PROXY_TARGET || "http://localhost:8000",
      changeOrigin: true,
    },
  };
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { proxy },
    preview: { proxy },
  };
});
