import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  plugins: [
    react(),
    obfuscator({
      // We only want to obfuscate the production build
      include: [/\.js$/, /\.jsx$/],
      exclude: [/node_modules/],
      apply: 'build',
      debugger: true,
      controlFlowFlattening: true,
      deadCodeInjection: true,
      stringArray: true,
      rotateStringArray: true,
      shuffleStringArray: true,
      stringArrayThreshold: 0.75,
    }),
  ],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@pages': path.resolve(__dirname, 'src/renderer/pages'),
      '@store': path.resolve(__dirname, 'src/renderer/store'),
      '@styles': path.resolve(__dirname, 'src/renderer/styles'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
