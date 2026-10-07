import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' }, build: { chunkSizeWarningLimit: 1800, rollupOptions: { input: ['index.html','laboratorio/index.html'] } } });
