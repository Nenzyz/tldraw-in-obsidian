# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Watch mode - compiles on file changes
npm run build    # Type check + production build
npm run dist     # Production build only (no type check)
```

The build uses esbuild to bundle `src/main.ts` → `main.js` and `src/styles.css` → `styles.css`.

**Development workflow:** Clone to `.obsidian/plugins/tldraw-in-obsidian`, run `npm install`, then `npm run dev`. Reload Obsidian or toggle the plugin off/on to see changes.

## Architecture Overview

This is an Obsidian plugin integrating the [Tldraw](https://tldraw.com) whiteboard into Obsidian. Drawings are stored as markdown files with embedded JSON data.

### Core Components

**Plugin Entry (`src/main.ts`):**
- `TldrawPlugin` class extends `obsidian.Plugin`
- Registers two view types: `TldrawView` (editable) and `TldrawReadonly` (preview)
- Monkey-patches `WorkspaceLeaf.setViewState` to auto-switch views for `.tldr` files
- Manages status bar, commands, and markdown post-processing for embeds

**View System (`src/obsidian/`):**
- `TldrawView.ts` - Main editable view extending ItemView
- `TldrawReadonly.ts` - Read-only preview view
- `TldrawMixins.ts` - Shared `TldrawLoadableMixin` providing React mounting, store loading, deep links, and view toggling

**React Layer (`src/components/`):**
- `TldrawApp.tsx` - Main wrapper around Tldraw editor; handles theming, focus, UI overrides
- `settings/` - React-based settings UI components

**State Management (`src/tldraw/`):**
- `TldrawStoresManager.ts` - **Critical:** Manages multi-instance store synchronization across tabs/views
  - Main store persists to file
  - Instance stores sync bidirectionally via history entries
  - Handles shared drawing ID routing
- `asset-store.ts` - Manages image/font assets in vault
- `ui-overrides.ts` - Custom menus, actions, toolbar components

### Data Flow

1. User opens `.md` file with tldraw frontmatter OR `.tldr` file
2. Plugin detects via frontmatter key (`tldraw-file: true` or custom key)
3. `TldrawView` mounts React root with `TldrawApp`
4. `TldrawStoresManager` creates/retrieves store, syncs across instances
5. Changes sync to store → serialize to file on debounced save

### File Formats

**Markdown (`.md`):** Frontmatter with `tldraw-file: true`, markdown content area, then `%%tldraw-data-start%%`...`%%tldraw-data-end%%` delimiters containing JSON.

**Native (`.tldr`):** Pure JSON `TLDataDocument` with `meta` (uuid, versions) and `raw` (tldraw store snapshot).

### Key Utilities

- `src/utils/document.ts` - File data templates and serialization
- `src/utils/constants.ts` - View type IDs, frontmatter keys, CSS classes
- `src/utils/migrate/` - Data migration between plugin versions

### Contexts

React contexts in `src/contexts/` provide plugin instance, settings, and settings manager to components.

## Important Patterns

**Monkey Patching:** Uses `monkey-around` library for Obsidian API patches (see `src/obsidian/plugin/events.ts`).

**Store Sync:** `TldrawStoresManager` is complex - any changes to store sync logic require understanding the main↔instance relationship.

**UI Overrides:** Tldraw UI customization in `src/tldraw/ui-overrides.ts` - custom actions, tools, and components injected via tldraw's override system.

**NPM Patches:** `patches/` contains tldraw patches (disabling source maps for pop-out windows). Run `npm install` to apply via `postinstall`.

## Code Conventions

- PascalCase for classes/components, camelCase for functions
- Functional React components with hooks (Obsidian views are class-based as required by API)
- Feature-based folder organization (`obsidian/`, `tldraw/`, `components/`, `utils/`)
- Conditional logging via `COMPONENT_LOGGING` and `MARKDOWN_POST_PROCESSING_LOGGING` flags in `src/utils/logging/`
