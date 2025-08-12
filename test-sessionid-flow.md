# Test: SessionId Conversation Continuation Flow

## Before Fix (Excessive API Calls)
When opening URL: `http://localhost:5173/chat/689b0107dec8469824f3f4f7?sessionId=0e4d8189-e608-498e-9da4-48484d1c830e`

**Previous Behavior:**
1. ✅ Initial load: `/api/chat/conversations/by-session/0e4d8189-e608-498e-9da4-48484d1c830e` (loads conversation + 12 messages)
2. ❌ THEN: Dozens of redundant calls to `/api/chat/conversations/689b0107dec8469824f3f4f7` (conversations list)
3. ❌ THEN: Every streaming message triggered more invalidations 
4. ❌ Result: ~30+ API calls seen in Network tab

## After Fix (Clean Architecture)
**Expected Behavior:**
1. ✅ Initial load: `/api/chat/conversations/by-session/0e4d8189-e608-498e-9da4-48484d1c830e` (loads conversation + messages into Zustand)
2. ✅ Optional: `/api/chat/conversations/689b0107dec8469824f3f4f7` (conversations list for sidebar) - ONCE only
3. ✅ New messages: WebSocket streaming → direct to Zustand store
4. ✅ Result: 1-2 API calls total, then pure WebSocket streaming

## Fix Applied
- Removed React Query invalidations from `handleSessionAvailable`
- Removed React Query invalidations from `handleMessageComplete` 
- Changed session updates to use `setQueryData` instead of `invalidateQueries`
- Messages now flow: WebSocket → Zustand store (no React Query caching)

## Architecture Now
- **React Query**: Only for conversation metadata (title, sessionId, etc.)
- **Zustand Store**: Single source of truth for all message content
- **WebSocket**: Real-time message streaming directly to Zustand
- **No Cache Fighting**: WebSocket updates don't conflict with React Query invalidations