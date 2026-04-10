# Chatify

A real-time chat app with a React frontend and an Express + Socket.IO backend.

## Documentation
See `DOCUMENTATION.md` for full project documentation.

## Features
- Email/password authentication with JWT http-only cookies
- Unique usernames with availability check
- Real-time messaging with Socket.IO
- Message delivery states: sent, delivered, read
- Read receipt timestamps per message (tap/click to view)
- Edit and delete own messages
- Message search + pinned/starred messages
- Typing indicators (header + typing bubble)
- Online users presence
- Active now + last seen presence (server persisted)
- Chat list with last message preview and unread counts
- Pagination: load latest 20 messages and fetch older on scroll
- Contacts discovery via username search (exact match first)
- Image uploads via Cloudinary (multi-attach, drag-drop, previews, compression)
- Per-file upload queue with progress, cancel, retry, and draft persistence
- Offline queue with retries and exponential backoff
- Optimistic UI with server reconciliation
- Replies with jump-to-message highlight
- Reactions and link previews
- Message pin/star with real-time updates
- Profile picture updates

## Tech Stack
- Frontend: React, Vite, Zustand, Tailwind CSS, Socket.IO Client
- Backend: Node.js, Express, Socket.IO, MongoDB, Mongoose
 
## Security
- Helmet + CSP headers
- Route-level validation (Zod)
- Arcjet protection + rate limiting for auth/search/uploads
- Cookie settings configurable via env (`COOKIE_SAMESITE`, `COOKIE_SECURE`)
- Session TTLs configurable via env (`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`)
- Optional at-rest AES-256-GCM encryption for message text/link previews

## Scripts
Frontend:
- `pnpm --dir frontend dev`
- `pnpm --dir frontend build`
 - `pnpm --dir frontend test`

Backend:
- `pnpm --dir backend dev` (if configured) or `node src/server.js`
 - `pnpm --dir backend test`

## Environment
Set these in `backend/.env`:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `CLIENT_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ARCJET_KEY`
- `ARCJET_ENV`
- `ADMIN_USERNAME` (optional, pins this user in Contacts for non-admin users)
- `COOKIE_SAMESITE` (optional)
- `COOKIE_SECURE` (optional)
- `COOKIE_DOMAIN` (optional)
- `COOKIE_PATH` (optional)
- `JWT_ACCESS_TTL` (optional, default `10m`)
- `JWT_REFRESH_TTL` (optional, default `7d`)
- `MESSAGE_ENC_KEY` (optional, 32-byte base64 or hex)
- `MESSAGE_ENC_KEYS` (optional, key ring like `v1:base64key,v2:base64key`)
- `MESSAGE_ENC_KEY_ID` (optional, current key ID used for new encryptions)
- `MESSAGE_ENC_STORE_PLAINTEXT` (optional, set to `false` to avoid storing message text)

## Maintenance
Backend encryption helpers:
- `node scripts/encrypt-messages.js` to encrypt historical plaintext messages
- `node scripts/rotate-message-key.js` to re-encrypt messages with the current key
