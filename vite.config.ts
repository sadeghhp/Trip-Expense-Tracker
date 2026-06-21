import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS ? '/Trip-Expense-Tracker/' : '/');

function assetPath(relativePath: string): string {
  return `${base}${relativePath.replace(/^\//, '')}`;
}

export default defineConfig({
  base,
  define: {
    __BUILD_NUMBER__: JSON.stringify(process.env.VITE_BUILD_NUMBER || 'dev'),
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  assetsInclude: ['**/*.wasm'],
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Trip Expense Tracker',
        short_name: 'TripExpense',
        description: 'Track and settle group travel expenses offline',
        theme_color: '#0d9488',
        background_color: '#0c1222',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        icons: [
          {
            src: assetPath('icons/icon-192.svg'),
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: assetPath('icons/icon-512.svg'),
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: assetPath('icons/icon-512.svg'),
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        navigateFallback: assetPath('index.html'),
        runtimeCaching: []
      }
    })
  ]
});
