# Nested Comments System

A production-ready, full-stack nested comments system with real-time updates via Socket.IO, cursor-based pagination, event sourcing, and optimistic UI.

---

## Project Overview

Users can register, log in, and participate in a threaded comment system with unlimited nesting depth. All mutations are reflected instantly across all connected clients via WebSocket broadcasting. Missed events are recovered automatically when a client reconnects using an event log and a sync protocol.

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Database | MongoDB 7 via Mongoose 8 |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Real-time | Socket.IO 4 |
| Validation | express-validator |
| Security | Helmet, CORS, express-rate-limit |
| Logging | Morgan |
| Testing | Jest + ts-jest |

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| State | Redux Toolkit |
| HTTP | Axios |
| WebSocket | socket.io-client |
| Forms | React Hook Form + Zod |
| Toasts | React Hot Toast |

---

## Features

**Authentication**
- Register with username / email / password (validated on both client and server)
- Login with email / password, JWT returned in response body
- Persistent login via `localStorage` with token validation on startup
- Protected routes — unauthenticated users are redirected to `/login`
- Logout clears token and redirects

**Comments**
- Create root-level comments
- Reply to any comment at any depth (unlimited nesting)
- Edit your own comment within 5 minutes of posting
- Delete your own comment (hard delete for leaf nodes, soft delete for nodes with replies)
- Like / unlike any comment (toggle, atomic, duplicate-safe)
- Collapsed / expanded thread view per comment

**Real-time**
- All mutations broadcast to every connected client via Socket.IO
- On connect, client emits `sync { lastEventId }` to recover any missed events
- Server replays missed events in order, then emits `sync_complete`
- Offline / reconnect banner in the UI

**Pagination**
- Cursor-based pagination using base64-encoded `createdAt` timestamps
- "Load more" button — no page numbers
- First page always returns `latestEventId` for WebSocket catch-up

**Search**
- Debounced (300 ms) full-text search across messages and usernames
- Match highlighting
- Previous / next match navigation with scroll-to
- Collapsed parent chains expand automatically to reveal matches

**Optimistic UI**
- Create, reply, edit, delete, like all apply instantly to local state
- Rollback with toast notification on any server error

**UI / UX**
- Loading skeletons on initial fetch
- Empty state and error state with retry
- Character counter on comment form
- Responsive layout (mobile-first)

---

## Architecture

```
Nested Comments System/
├── src/                          # Backend (Express + TypeScript)
│   ├── config/
│   │   ├── database.ts           # Mongoose connect/disconnect
│   │   └── env.ts                # Typed, validated env config
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── comment.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT protect
│   │   ├── error.middleware.ts   # Global error handler
│   │   ├── logger.middleware.ts  # Morgan
│   │   ├── notFound.middleware.ts
│   │   ├── rateLimit.middleware.ts
│   │   └── validate.middleware.ts
│   ├── models/
│   │   ├── comment.model.ts      # Mongoose schema + indexes
│   │   ├── counter.model.ts      # Atomic event ID counter
│   │   ├── event.model.ts
│   │   └── user.model.ts
│   ├── routes/
│   │   ├── index.ts              # Mounts /auth and /comments
│   │   ├── auth.routes.ts
│   │   └── comment.routes.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── comment.service.ts    # All business logic
│   │   └── event.service.ts      # Event sourcing / atomic counter
│   ├── sockets/
│   │   ├── socket.ts             # Socket.IO singleton
│   │   └── comment.socket.ts     # Per-socket sync handler
│   ├── types/
│   ├── utils/
│   │   ├── AppError.ts
│   │   ├── TreeBuilder.ts        # O(n) adjacency-list → tree
│   │   ├── apiResponse.ts
│   │   ├── asyncHandler.ts
│   │   └── jwt.ts
│   ├── __tests__/
│   │   └── TreeBuilder.test.ts   # 34 unit tests
│   ├── app.ts                    # Express app (no port binding)
│   └── server.ts                 # HTTP server + Socket.IO lifecycle
│
└── frontend/                     # Next.js 14 App Router frontend
    └── src/
        ├── app/
        │   ├── layout.tsx         # Root layout: Providers + Toaster
        │   ├── page.tsx           # Auth-aware redirect
        │   ├── comments/page.tsx  # Main page (protected)
        │   ├── login/page.tsx
        │   └── register/page.tsx
        ├── components/
        │   ├── Providers.tsx      # Redux Provider + auth init
        │   └── ui/
        │       ├── EmptyState.tsx
        │       ├── ErrorState.tsx
        │       ├── HighlightedText.tsx
        │       └── Spinner.tsx
        ├── features/comments/
        │   ├── CommentForm.tsx    # New root comment
        │   ├── CommentItem.tsx    # Recursive node (all actions)
        │   ├── CommentList.tsx    # Root list
        │   ├── CommentSkeleton.tsx
        │   ├── EditForm.tsx
        │   ├── LoadMoreButton.tsx
        │   ├── ReplyForm.tsx
        │   └── SearchBar.tsx
        ├── hooks/
        │   ├── useAppDispatch.ts
        │   ├── useAppSelector.ts
        │   └── useSocket.ts       # Socket lifecycle + all event handlers
        ├── services/
        │   ├── api.ts             # Axios instance + interceptors
        │   ├── authService.ts
        │   ├── commentService.ts
        │   └── socketService.ts   # Socket.IO client singleton
        ├── store/
        │   ├── index.ts
        │   └── slices/
        │       ├── authSlice.ts
        │       ├── commentsSlice.ts  # Flat store + TreeBuilder rebuild
        │       ├── socketSlice.ts
        │       └── uiSlice.ts
        ├── types/
        ├── utils/
        │   ├── TreeBuilder.ts     # Frontend tree builder
        │   ├── formatDate.ts
        │   └── validation.ts      # Zod schemas
        └── styles/globals.css
```

---

## Installation

### Prerequisites
- Node.js >= 20
- MongoDB running locally or a connection URI (Atlas)

### 1 — Clone and install

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
```

### 2 — Configure environment

```bash
# Backend
cp .env.example .env
# Edit .env and fill in MONGODB_URI, JWT_SECRET, COOKIE_SECRET

# Frontend
cp frontend/.env.local.example frontend/.env.local
# Edit if your backend runs on a different port
```

### 3 — Run in development

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Backend: http://localhost:5000  
Frontend: http://localhost:3000

---

## Environment Variables

### Backend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PORT` | No | `5000` | HTTP server port |
| `MONGODB_URI` | **Yes** | — | Full MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | Secret for signing JWTs (use a long random string) |
| `JWT_EXPIRES_IN` | No | `7d` | JWT lifetime (e.g. `7d`, `24h`) |
| `COOKIE_SECRET` | **Yes** | — | Secret for signed cookies |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS allowlist |

### Frontend (`.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Backend base URL |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:5000` | Socket.IO server URL |

---

## API Endpoints

All routes are prefixed with `/api/v1`.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a new user |
| `POST` | `/auth/login` | Public | Login, returns JWT |
| `GET` | `/auth/me` | Bearer JWT | Get current user profile |

**Register body:**
```json
{ "username": "alice", "email": "alice@example.com", "password": "Secret1" }
```

**Login body:**
```json
{ "email": "alice@example.com", "password": "Secret1" }
```

**Success response shape:**
```json
{ "success": true, "data": { "user": { ... }, "token": "eyJ..." }, "message": "..." }
```

**Error response shape:**
```json
{ "success": false, "message": "Invalid credentials" }
```

### Comments

| Method | Path | Auth | Rate limit | Description |
|---|---|---|---|---|
| `GET` | `/comments` | Public | — | List root comments (cursor pagination) + full subtree |
| `GET` | `/comments/:id` | Public | — | Single comment with full subtree |
| `POST` | `/comments` | Bearer JWT | 1 req / 3 s | Create root comment |
| `POST` | `/comments/:id/reply` | Bearer JWT | 1 req / 3 s | Reply to a comment |
| `PATCH` | `/comments/:id` | Bearer JWT | 30 req / 60 s | Edit comment (within 5 min) |
| `DELETE` | `/comments/:id` | Bearer JWT | 30 req / 60 s | Delete comment |
| `POST` | `/comments/:id/like` | Bearer JWT | 30 req / 60 s | Toggle like |

**GET /comments query params:**

| Param | Type | Description |
|---|---|---|
| `cursor` | string | Opaque base64 token from previous response |
| `limit` | integer 1–100 | Items per page (default 20) |

**GET /comments response:**
```json
{
  "success": true,
  "data": {
    "roots": [ { "data": { ...comment }, "children": [ ... ] } ],
    "nextCursor": "base64string",
    "hasMore": true,
    "latestEventId": 42
  }
}
```

### Health Check

```
GET /health  →  { "status": "ok", "env": "development" }
```

---

## Socket.IO Event Flow

### Connection and Sync Protocol

```
Client                              Server
  │                                   │
  │── connect ──────────────────────► │  Socket.IO handshake
  │                                   │
  │── sync { lastEventId: 42 } ─────► │  Fetch events with eventId > 42
  │                                   │
  │◄─ COMMENT_CREATED { ... } ───────  │  Replay each missed event
  │◄─ COMMENT_UPDATED { ... } ───────  │  (in eventId ascending order)
  │◄─ COMMENT_DELETED { ... } ───────  │
  │                                   │
  │◄─ sync_complete { latestEventId } │  Client updates cursor
  │                                   │
  │  ... live events from here on ... │
  │◄─ COMMENT_CREATED { ... } ───────  │  Broadcast on any mutation
```

### Live Event Envelope

Every broadcast and sync replay uses the same shape:

```typescript
{
  eventId: number;     // monotonic counter
  type: string;        // "COMMENT_CREATED" | "COMMENT_UPDATED" | etc.
  payload: object;     // type-specific data
}
```

### Event Types and Payloads

| Event | Payload fields |
|---|---|
| `COMMENT_CREATED` | `commentId, parentId, authorId, authorUsername, message` |
| `COMMENT_UPDATED` | `commentId, message, editedAt` |
| `COMMENT_DELETED` | `commentId` |
| `COMMENT_LIKED` | `commentId, userId, likes` |
| `COMMENT_UNLIKED` | `commentId, userId, likes` |
| `sync_complete` | `latestEventId` |
| `socket_error` | `message` |

---

## Redux State Flow

```
User action (click Like)
        │
        ▼
toggleLikeOptimistic(id, userId, liked)  ← instant UI update
        │
        ▼
dispatch(toggleLike(id))                 ← HTTP POST /comments/:id/like
        │
   ┌────┴────┐
   │ success │ ──► toggleLike.fulfilled: overwrite with server count
   │ failure │ ──► rollbackOptimistic(snapshot) + toast.error
   └─────────┘
```

Socket events update state via `updateFromEvent(comment)` which writes to `flatComments` and triggers a `rebuildRoots()` call using the frontend `TreeBuilder`.

---

## Building for Production

```bash
# Backend
npm run build        # compiles TypeScript to dist/
npm start            # runs dist/server.js

# Frontend
cd frontend
npm run build        # Next.js production build
npm start            # starts Next.js production server
```

---

## Running Tests

```bash
# Backend unit tests (34 tests for TreeBuilder)
npm test

# With coverage
npm run test:coverage

# Frontend type check
cd frontend
npm run type-check
```

---

## Screenshots

> Replace with actual screenshots after running the application.

| Page | Description |
|---|---|
| `/login` | Email + password form with validation |
| `/register` | Username + email + password with inline errors |
| `/comments` | Sticky header with live indicator, search bar, comment form, nested thread, load more |

---

## Security Notes

- Passwords hashed with bcrypt (12 rounds)
- JWT signed with `HS256`, verified on every protected request
- DB user re-fetched on every request — deleted accounts lose access immediately
- Generic "Invalid credentials" error on login — no email enumeration
- Helmet sets security headers (CSP, HSTS, etc.)
- CORS restricted to `ALLOWED_ORIGINS`
- Input validated server-side with express-validator (422 on failure)
- `likedBy` array never sent to clients (stripped by `sanitiseNode` in the controller)
- Soft-deleted comment content replaced with `[deleted]` server-side — never sent raw
- Rate limiting per authenticated user ID (not IP) for write operations
- JWT stored in `localStorage` — acceptable for this architecture; use `httpOnly` cookie for stricter requirements

---

## Future Improvements

- Refresh token rotation (current tokens expire after 7 days with no rotation)
- Redis pub/sub for horizontal Socket.IO scaling across multiple instances
- MongoDB change streams as an alternative to polling-based sync
- Pagination for replies (currently all descendants are fetched eagerly)
- Reactions beyond simple likes (emoji reactions)
- Email verification on registration
- Admin moderation dashboard
- WebSocket authentication (currently unauthenticated socket connections are accepted)
- Rate limiting for the sync endpoint (currently unlimited events replayed per connect)
- Move JWT to `httpOnly` cookies to mitigate XSS token theft
- Comment pinning and sorting options
#   n e s t e d - c o m m e n t s - s y s t e m  
 