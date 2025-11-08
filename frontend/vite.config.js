import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Use relative asset paths so Pages can serve files from /docs or subpath.
  base: "./",
  plugins: [react()],
});
