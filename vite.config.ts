import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        public: "index.html",
        editor: "studio.html",
        render: "render.html",
      },
    },
  },
});
