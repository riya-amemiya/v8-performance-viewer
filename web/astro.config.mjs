// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// SITE_URL and BASE_PATH are injected by CI for GitHub Pages; the defaults
// match this repository's project page.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://riya-amemiya.github.io',
  base: process.env.BASE_PATH ?? '/v8-performance-viewer',
  vite: {
    plugins: [tailwindcss()],
  },
});
