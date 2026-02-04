import '@testing-library/jest-dom';

// Define global constants that are set at build time
(globalThis as any).TLDRAW_VERSION = '3.15.3';

// Obsidian module is mocked via vitest.config.ts alias

// Polyfill Array.prototype.remove for Obsidian API compatibility
// Obsidian defines this but it's not available in the test environment
if (!Array.prototype.remove) {
	Array.prototype.remove = function<T>(this: T[], item: T): T[] {
		const index = this.indexOf(item);
		if (index > -1) {
			this.splice(index, 1);
		}
		return this;
	};
}

// TypeScript declaration for Array.prototype.remove
declare global {
	interface Array<T> {
		remove(item: T): T[];
	}
}
