import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
    },
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src'),
            obsidian: path.resolve(__dirname, './src/test/__mocks__/obsidian.ts'),
        },
    },
});
