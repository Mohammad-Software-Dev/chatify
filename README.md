# Chatify

A real-time chat app with a React frontend and an Express + Socket.IO backend.

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
- Image uploads via Cloudinary (multi-attach, drag-drop, previews, compression)
- Per-file upload queue with progress, cancel, retry, and draft persistence
- Offline queue with retries and exponential backoff
- Optimistic UI with server reconciliation
- Replies with jump-to-message highlight
- Reactions and link previews
- Profile picture updates

## Tech Stack
- Frontend: React, Vite, Zustand, Tailwind CSS, Socket.IO Client
- Backend: Node.js, Express, Socket.IO, MongoDB, Mongoose

## Scripts
Frontend:
- `pnpm --dir frontend dev`
- `pnpm --dir frontend build`

Backend:
- `pnpm --dir backend dev` (if configured) or `node src/server.js`

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
