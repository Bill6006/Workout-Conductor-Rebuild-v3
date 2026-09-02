/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/**
 * Workout Conductor build configuration.
 *
 * `base` must match the GitHub Pages repository subpath so that the deployed
 * bundle, the service worker scope, and the manifest all resolve correctly.
 */
const REPO_BASE = '/Workout-Conductor-Rebuild-v3/'

const buildMarker = process.env.VITE_BUILD_MARKER ?? 'local-dev'
const buildPhase =
  process.env.VITE_BUILD_PHASE ?? 'Phase 2 - Exercise Catalog, Media, and Conflict Engine'
const buildCommit = process.env.VITE_BUILD_COMMIT ?? 'local'
const buildTime = process.env.VITE_BUILD_TIME ?? new Date().toISOString()

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __BUILD_MARKER__: JSON.stringify(buildMarker),
    __BUILD_PHASE__: JSON.stringify(buildPhase),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
        'icons/favicon.svg',
      ],
      manifest: {
        id: REPO_BASE,
        name: 'Workout Conductor',
        short_name: 'Conductor',
        description: 'Adaptive Strength + Hypertrophy. An intelligent, local-first workout coach.',
        theme_color: '#0A0B0A',
        background_color: '#0A0B0A',
        display: 'standalone',
        orientation: 'portrait',
        scope: REPO_BASE,
        start_url: REPO_BASE,
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Never let a deployment reach in and clear durable local data.
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    css: false,
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
}))
