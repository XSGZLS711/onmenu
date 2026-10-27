import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

// The SoftPOS navigation demo is plain static files kept in softpos-demo/. It is copied next to the built site,
// so it is served at <base>softpos-demo/ without being part of the OnMenu app or its public/ folder.
const softposDemo: Plugin = {
  name: 'copy-softpos-demo',
  apply: 'build',
  closeBundle() {
    const from = fileURLToPath(new URL('./softpos-demo', import.meta.url));
    const to = fileURLToPath(new URL('./dist-pages/softpos-demo', import.meta.url));
    if (existsSync(from)) cpSync(from, to, { recursive: true });
  },
};

export default defineConfig({
  root: fileURLToPath(new URL('./demo-pages', import.meta.url)),
  base: process.env.PAGES_BASE_PATH ?? '/onmenu/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  plugins: [react(), softposDemo],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-pages', import.meta.url)),
    emptyOutDir: true,
  },
  server: { watch: { useFsEvents: false, usePolling: true } },
});
