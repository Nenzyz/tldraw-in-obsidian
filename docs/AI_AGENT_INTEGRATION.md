# Phase 5: AI Agent Integration

## Overview

Add AI agent capabilities from tldraw's official `templates/agent/` starter kit, adapted for the Obsidian plugin environment.

**Source**: `~/Repos/tldraw/templates/agent/`

## Architecture

The tldraw agent system has two main parts:
1. **Client** (`client/agent/`) - TldrawAgent class, React hook, state management
2. **Backend** (`worker/`) - LLM streaming via Cloudflare Worker with `@ai-sdk/*`

**Obsidian Adaptation**:
- Replace Cloudflare Worker backend with **direct Anthropic SDK calls** from browser
- Store API key in plugin settings
- Add chat panel component for user interaction

## New Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.30.x",
  "zod": "^3.x"
}
```

Note: The Anthropic SDK supports browser usage directly without a backend proxy.

## New Files to Create

| File | Purpose | Lines |
|------|---------|-------|
| `src/tldraw/agent/TldrawAgent.ts` | Main agent class (adapted) | ~400 |
| `src/tldraw/agent/useTldrawAgent.ts` | React hook | ~50 |
| `src/tldraw/agent/agentsAtom.ts` | State atom for multi-agent | ~20 |
| `src/tldraw/agent/AgentService.ts` | Direct Anthropic API calls | ~100 |
| `src/tldraw/agent/AgentHelpers.ts` | Position/shape helpers | ~200 |
| `src/tldraw/agent/types/` | Type definitions (5+ files) | ~150 |
| `src/tldraw/agent/actions/` | Agent actions (create, delete, update, etc.) | ~800 |
| `src/tldraw/agent/parts/` | Prompt parts (system, shapes, screenshot) | ~500 |
| `src/tldraw/agent/format/` | Shape format converters | ~300 |
| `src/components/AgentChatPanel.tsx` | Chat UI component | ~200 |
| `src/components/AgentChatMessage.tsx` | Message bubble component | ~80 |
| `src/components/AgentContextMenu.tsx` | "Ask AI" context menu | ~50 |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `@anthropic-ai/sdk`, `zod` |
| `src/components/TldrawApp.tsx` | Add `AgentChatPanel`, agent provider |
| `src/obsidian/TldrawSettingsTab.ts` | Add AI settings (API key, model) |
| `src/obsidian/settings/UserSettingsManager.ts` | Add `ai.apiKey`, `ai.model`, `ai.enabled` |
| `src/components/settings/` | New `AISettings.tsx` component |
| `src/styles.css` | Chat panel styles (~150 lines) |

## Settings Structure

```typescript
ai?: {
  enabled: boolean;
  apiKey: string;  // Stored encrypted in plugin data
  model: 'claude-4.5-sonnet' | 'claude-4-sonnet' | 'claude-3.5-sonnet';
  showChatPanel: boolean;
  maxTokens: number;
}
```

## Key Adaptations from Original

### 1. No Backend Server
- Original: `/stream` endpoint on Cloudflare Worker
- Adapted: Direct `Anthropic.messages.stream()` from browser

### 2. Simplified Streaming
```typescript
// Original (worker/do/AgentService.ts)
const { textStream } = streamText({ model, ... })

// Adapted (src/tldraw/agent/AgentService.ts)
const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-5-20241022',
  messages,
  max_tokens: 4096,
});
for await (const event of stream) {
  // Handle streaming events
}
```

### 3. API Key Storage
- Use Obsidian's `plugin.saveData()` for encrypted storage
- Show warning if API key not configured

### 4. Screenshot Capture
- Use `editor.toImage()` for canvas screenshot
- Send as base64 to model

## Agent Capabilities (Default)

| Category | Actions |
|----------|---------|
| **Communication** | message (send text to user) |
| **Planning** | think, review, add-detail, todo-list, set-my-view |
| **Shapes** | create, delete, update, label, move |
| **Layout** | place, bring-to-front, send-to-back, rotate, resize, align, distribute, stack, clear |
| **Drawing** | pen (freehand strokes) |

## Prompt Parts (What Agent Sees)

| Part | Purpose |
|------|---------|
| `system-prompt` | Base instructions for the agent |
| `model-name` | Which model to use |
| `messages` | User's request |
| `screenshot` | Current canvas view as image |
| `viewport-bounds` | What area is visible |
| `blurry-shapes` | Simplified shape list in viewport |
| `peripheral-shapes` | Shape clusters outside viewport |
| `selected-shapes` | Currently selected shapes |
| `chat-history` | Previous conversation |
| `user-action-history` | Recent user edits |
| `todo-list` | Agent's task list |

## UI Components

### Chat Panel (right side of canvas)
```
┌─────────────────────────────┐
│ 🤖 AI Assistant        [−] │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ User: Draw a flowchart │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ AI: I'll create a      │ │
│ │ flowchart with...      │ │
│ │ ✓ Created 5 shapes     │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ [Type a message...]    [↵] │
└─────────────────────────────┘
```

### Context Menu Integration
- Right-click shape → "Ask AI about this"
- Right-click selection → "Ask AI to modify"
- Right-click empty area → "Ask AI to create"

---

## Implementation Steps (Incremental - UI First)

### Step 5.1: Chat Panel UI + Basic Streaming ← START HERE
**Goal**: Working chat UI with basic Anthropic API integration

**Files to create:**
| File | Purpose |
|------|---------|
| `src/components/AgentChatPanel.tsx` | Collapsible chat panel |
| `src/components/AgentChatMessage.tsx` | Message bubble component |
| `src/tldraw/agent/AgentService.ts` | Anthropic API wrapper |
| `src/tldraw/agent/types/ChatMessage.ts` | Basic message types |
| `src/components/settings/AISettings.tsx` | API key + model settings |

**Files to modify:**
| File | Changes |
|------|---------|
| `package.json` | Add `@anthropic-ai/sdk` |
| `src/components/TldrawApp.tsx` | Add chat panel toggle |
| `src/obsidian/settings/UserSettingsManager.ts` | Add AI settings |
| `src/styles.css` | Chat panel styles |

**Deliverable**: User can open chat panel, enter message, see AI response stream in

### Step 5.2: Canvas Context
**Goal**: AI can see what's on the canvas

- Add screenshot capture (`editor.toImage()`)
- Add shape list to context
- AI can describe what it sees

### Step 5.3: Basic Shape Actions
**Goal**: AI can create/modify shapes

- Add `CreateActionUtil` for basic shapes (geo, text, note)
- Add `DeleteActionUtil`
- Add `UpdateActionUtil`
- Wire actions to chat responses

### Step 5.4: Full Agent System
**Goal**: Complete agent with planning and multi-step tasks

- Add remaining actions (pen, layout, etc.)
- Add prompt parts (history, todo list, etc.)
- Add context menu integration
- Add keyboard shortcut (Cmd+K)

---

## Verification

```bash
npm install
npm run build
# Test: Enable AI in settings
# Test: Enter API key
# Test: Open chat panel
# Test: Type "Draw a simple diagram" → verify shapes created
# Test: Select shapes → right-click → "Ask AI" → verify context works
# Test: Cancel mid-generation → verify cleanup
```

## Security Considerations

- API key stored in plugin's local data (not synced)
- Add warning in settings about API key security
- Never log API key to console
- Clear API key from memory when plugin unloads

---

## Reference: tldraw Agent Template Structure

```
templates/agent/
├── client/
│   └── agent/
│       ├── TldrawAgent.ts      # Main agent class
│       ├── useTldrawAgent.ts   # React hook
│       └── agentsAtom.ts       # State atom
├── shared/
│   ├── AgentUtils.ts           # Configure capabilities
│   ├── AgentHelpers.ts         # Position/shape helpers
│   ├── actions/                # 20+ action utils
│   ├── parts/                  # 15+ prompt parts
│   ├── format/                 # Shape converters
│   └── types/                  # Type definitions
└── worker/
    ├── models.ts               # Model definitions
    ├── do/AgentService.ts      # LLM integration
    └── prompt/                 # Prompt builders
```
