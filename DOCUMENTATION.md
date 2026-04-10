# Chatify Documentation

## Overview
Chatify is a real-time messaging application with a React + Vite frontend and an Express + Socket.IO backend. It supports authenticated chat, rich message features, media uploads, and optional at-rest message encryption.

## Architecture
**Frontend**
- React, Vite, Zustand, Tailwind CSS, Socket.IO Client
- State management for chats, messages, uploads, and presence
- Optimistic UI for messaging + offline retry queue

**Backend**
- Node.js, Express, Socket.IO, MongoDB (Mongoose)
- REST endpoints for auth/messages/media
- Socket events for real-time updates
- Optional AES-256-GCM at-rest encryption for messages

## Key Features
- Auth with HTTP-only cookies (access + refresh tokens)
- Username availability check + unique usernames
- Real-time messaging + delivery/read states
- Edit/delete/reply/reactions
- Pinned/starred messages
- Per-chat message search
- Contacts discovery by username (exact match first)
- Configured admin contact pinned for non-admin users
- Image uploads with Cloudinary
- Sequential attachment uploads + cancel/retry
- Drag-and-drop uploads + draft persistence
- Presence/typing indicators

## Setup
### Requirements
- Node.js 20+
- MongoDB
- pnpm (recommended) or npm

### Install
```
pnpm --dir backend install
pnpm --dir frontend install
```

### Run (Dev)
```
pnpm --dir backend dev
pnpm --dir frontend dev
```

### Build (Prod)
```
pnpm --dir frontend build
pnpm --dir backend start
```

## Environment Variables
Set these in `backend/.env` or your hosting provider dashboard.

### Core
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `CLIENT_URL`
- `NODE_ENV`
- `ADMIN_USERNAME` (optional; username to pin in Contacts for non-admin users)
- `ADMIN_EMAIL` (required by `seed-admin`)
- `ADMIN_PASSWORD` (required by `seed-admin`)
- `ADMIN_FULL_NAME` (optional; defaults to `Chatify Admin`)
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`, or `silent`; optional)

### Email (Resend)
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`

### Cloudinary
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Arcjet
- `ARCJET_KEY`
- `ARCJET_ENV`

### Cookies & Sessions
- `COOKIE_SAMESITE` (default: `strict`)
- `COOKIE_SECURE` (default: `true` in production)
- `COOKIE_DOMAIN` (optional)
- `COOKIE_PATH` (optional, default `/`)
- `JWT_ACCESS_TTL` (default: `10m`)
- `JWT_REFRESH_TTL` (default: `7d`)

### Message Encryption (Optional)
Single key:
- `MESSAGE_ENC_KEY` (32-byte base64 or hex)

Key ring (recommended):
- `MESSAGE_ENC_KEYS` (e.g. `v1:<key>,v2:<key>`)
- `MESSAGE_ENC_KEY_ID` (e.g. `v2`)

Behavior:
- `MESSAGE_ENC_STORE_PLAINTEXT` (set `false` to avoid storing message text; disables message search)

## Security
- Helmet + CSP headers
- Zod validation for input
- Rate limiting on auth/search/attachments
- HTTP-only cookies for JWT
- Refresh token rotation with server-side revocation list
- Socket authentication via cookies

## Encryption at Rest
When enabled, message text and link previews are AES-256-GCM encrypted:
- Stored fields: `textEnc`, `linkPreviewEnc`, `encKeyId`, `encVersion`
- Plaintext stored only if `MESSAGE_ENC_STORE_PLAINTEXT=true`
- Message search is disabled when plaintext is off

### Backfill Existing Messages
```
pnpm --dir backend encrypt-messages
```

### Rotate Keys
1) Add new key to `MESSAGE_ENC_KEYS` and set `MESSAGE_ENC_KEY_ID`
2) Re-encrypt existing data:
```
pnpm --dir backend rotate-message-key
```

### Seed Admin Contact
Create the configured pinned admin user:
```
pnpm --dir backend seed-admin
```
Required env: `MONGO_URI`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Testing
### Backend
```
pnpm --dir backend test
```
Notes:
- Uses MongoMemoryServer by default.
- Set `TEST_MONGO_URI` to run against a real DB.
- Set `SKIP_DB_TESTS=true` to skip DB tests.

### Frontend
```
pnpm --dir frontend test
```

Optional Vite env overrides:
- `VITE_API_BASE_URL` (defaults to `http://localhost:3000/api` in dev and `/api` in production)
- `VITE_SOCKET_URL` (defaults to the API origin in dev and `/` in production)

### Browser Smoke Test
```
pnpm --dir frontend test:e2e
```
This starts an e2e backend with MongoMemoryServer, seeds the admin user, starts Vite, and verifies a new user can message the pinned admin.

### Manual QA
See `TEST_SCENARIOS.md`.

## API Overview
Base URL: `/api`

**Auth**
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/check`
- `GET /auth/check-username`
- `PUT /auth/update-profile`
- `PUT /auth/update-username`

**Messages**
- `GET /messages/chats`
- `GET /messages/admin-contact`
- `GET /messages/contacts?username=...`
- `GET /messages/:id` (chat history)
- `GET /messages/item/:id`
- `GET /messages/search/:id`
- `GET /messages/pinned/:id`
- `GET /messages/starred/:id`
- `POST /messages/send/:id`
- `PUT /messages/:id` (edit)
- `DELETE /messages/:id` (delete)
- `POST /messages/:id/pin`
- `POST /messages/:id/star`
- `POST /messages/:id/reactions`
- `PUT /messages/read/:id`
- `POST /messages/attachments`
- `DELETE /messages/attachments`

## Socket Events (High Level)
**Server → Client**
- `newMessage`, `messageUpdated`, `messageDeleted`
- `messagePinned`, `messageStarred`
- `messageStatusUpdate`, `messageReactionUpdate`
- `typing`, `presence:update`, `getOnlineUsers`

**Client → Server**
- `message:send` (indirect via REST)
- `typing`, `presence:ping`

## Deployment Notes
- Ensure `CLIENT_URL` matches the frontend origin.
- In production, `COOKIE_SECURE=true` and `COOKIE_SAMESITE=strict` or `lax`.
- If using Render/Koyeb, set environment variables in the dashboard.

## Troubleshooting
**Search returns disabled**
- `MESSAGE_ENC_STORE_PLAINTEXT=false` disables message search by design.

**401 on refresh**
- Refresh token reuse revokes session. Re-login to get a fresh session.

**Cannot connect socket**
- Check cookie settings and domain/path in production.

**Cloudinary upload failures**
- Validate Cloudinary credentials and image size limits.

**DaisyUI `@property` build warning**
- This can appear from third-party generated CSS. It is non-failing; keep CSS optimization enabled unless the warning becomes a build error.
