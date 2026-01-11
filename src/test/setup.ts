import '@testing-library/jest-dom';

// Define global constants that are set at build time
(globalThis as any).TLDRAW_VERSION = '3.15.3';

// Obsidian module is mocked via vitest.config.ts alias
