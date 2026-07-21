import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Base relative requise pour qu'Electron charge correctement les assets
  // depuis `file://` (sinon : page blanche). Innocue pour le mode web/PWA.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Augmente le seuil d'avertissement (html-to-docx est lourd par nature)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Chunk dédié html-to-docx (1,2 MB) — chargé uniquement à l'export Word
          if (id.includes("html-to-docx") || id.includes("xmlbuilder2") || id.includes("htmlparser2")) {
            return "vendor-docx";
          }
          // ── Radix UI + shadcn dans un chunk UI stable (cache-friendly)
          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "vendor-ui";
          }
          // ── TanStack Query
          if (id.includes("@tanstack")) {
            return "vendor-query";
          }
          // ── Recharts
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
            return "vendor-charts";
          }
          // ── Supabase
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
          // ── PDF / export (jspdf, html2pdf, html2canvas)
          if (
            id.includes("jspdf") ||
            id.includes("html2pdf") ||
            id.includes("html2canvas") ||
            id.includes("canvg")
          ) {
            return "vendor-pdf";
          }
        },
      },
    },
  },
}));
