# CYCLE-06 — Chat Interface

**Dependencies**: Cycles 02, 03, 04, 05  
**Complexity**: High

---

## Goal
Functional chat — user types natural language query, receives streamed response with clickable item references.

---

## Tasks

### T01 — Create chat API route
**File**: `apps/web/app/api/chat/route.ts`  
**Action**: POST handler:
1. Validate auth (same pattern as ingest)
2. Accept `{ message: string, history: { role, content }[] }`
3. Embed `message` using Claude embedding
4. Query `embeddings` collection — find top 5 by cosine similarity
5. Load full item records for those IDs
6. Build Claude prompt: system = "You are a personal knowledge assistant. Answer using only the provided saved items. Reference items by their ID.", user = message, context = JSON of top 5 items
7. Stream Claude response using `stream: true`
8. Return streaming response with item metadata in headers: `X-Items: JSON.stringify(items)`

⚠️ Embedding query must use cosine similarity — not exact match  
⚠️ Never expose other users' items — always filter by authenticated user ID  
**Acceptance**: Unit tests in T02 pass.

### T02 — Unit tests for chat API
**File**: `tests/unit/chat.test.ts`  
**Action**:
- Valid query → embedding called, PB queried, Claude called with context
- No matching items → Claude responds with "nothing found" message
- Unauthenticated → 401
- User A cannot see User B's items (auth filter verified)

**Acceptance**: All cases pass.

### T03 — Create ChatWindow component
**File**: `apps/web/components/chat/ChatWindow.tsx`  
**Action**: Component renders scrollable message list + `ChatInput` at bottom. Manages `messages` state. On new user message: optimistically adds user bubble, calls `/api/chat`, streams response into assistant bubble, updates `items` state from `X-Items` header.  
**Acceptance**: Component renders, accepts input, shows messages.

### T04 — Create ChatMessage component
**File**: `apps/web/components/chat/ChatMessage.tsx`  
**Action**: Renders user or assistant message. Assistant messages include: message text + horizontal scroll list of `ItemReference` cards. Each card shows: thumbnail (or type icon), title (truncated 40 chars), source domain, external link icon. Clicking card opens `item.source_url` in new tab.  
**Acceptance**: Item cards render with correct data. Click opens correct URL.

### T05 — Create ChatInput component
**File**: `apps/web/components/chat/ChatInput.tsx`  
**Action**: Textarea (auto-resize), send button, Enter to send (Shift+Enter for newline). Disabled while streaming. Shows spinner while streaming.  
**Acceptance**: Enter sends message. Shift+Enter adds newline. Button disabled during stream.

### T06 — E2E chat test
**File**: `tests/e2e/chat.spec.ts`  
**Action**: Playwright test:
1. Seed a test item directly in PocketBase with known content
2. Login, navigate to `/chat`
3. Type query related to seeded item content
4. Verify response appears (streaming completes)
5. Verify at least one item card appears in response
6. Click item card → new tab opens with correct URL

**Acceptance**: All steps pass.

---

## Cycle Exit Criteria

- [ ] Type query → streamed response appears word by word
- [ ] Response includes item cards with title, domain, link
- [ ] Clicking item card opens original URL
- [ ] User B's items never appear for User A
- [ ] `npx playwright test tests/e2e/chat.spec.ts` — all pass
- [ ] No TypeScript errors

---

