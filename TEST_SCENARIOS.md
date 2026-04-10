# Chatify Real-World Test Scenarios

Use this checklist to validate end-to-end behavior in production and local builds.
Mark each item ✅ when verified.

## 1) Environment & Health
- [ ] App boots with production env vars set.
- [ ] `/health` returns `200 ok`.
- [ ] Frontend loads over HTTPS with no mixed-content warnings.
- [ ] Backend CORS allows the production frontend origin only.

## 2) Authentication & Session Hardening
- [ ] Signup works with valid username, email, password.
- [ ] Signup rejects duplicate email.
- [ ] Signup rejects invalid username format.
- [ ] Login works with valid credentials.
- [ ] Login rejects invalid credentials without revealing which field is wrong.
- [ ] Auth cookies are set as `HttpOnly`, `Secure`, `SameSite=Strict` (or your chosen policy).
- [ ] Access token expires according to `JWT_ACCESS_TTL` (verify forced re-auth/refresh after TTL).
- [ ] Refresh token rotates on `/auth/refresh` (new cookie value each time).
- [ ] Reuse of old refresh token results in `401` and session invalidation.
- [ ] Logout clears both access and refresh cookies.

## 3) Profile & Presence
- [ ] Update profile picture uploads to Cloudinary and displays new image.
- [ ] Online status updates in chat list.
- [ ] “Last seen” persists after user goes offline.
- [ ] Typing indicators appear and disappear correctly.

## 4) Contacts & User Discovery
- [ ] With `ADMIN_USERNAME` configured, non-admin users see the Admin contact pinned above search results.
- [ ] Clicking the pinned Admin contact opens the admin conversation.
- [ ] The configured admin user does not see themself pinned.
- [ ] Search by username works (exact match appears first).
- [ ] Partial match returns relevant users (not the current user).
- [ ] Empty search clears results and shows no contacts.

## 5) Messaging Basics
- [ ] Send text message.
- [ ] Send single image.
- [ ] Send multiple images.
- [ ] Send message with link preview (valid URL).
- [ ] Receive message in real-time (Socket.IO).
- [ ] Read receipts change from sent → delivered → read.
- [ ] Messages are ordered correctly (oldest at top).

## 6) Message Actions
- [ ] Edit message; “edited” state is visible.
- [ ] Edit to same text does not change message.
- [ ] Delete message clears text and attachments.
- [ ] Reply to a message; reply preview shows.
- [ ] Jump-to-reply scrolls and highlights correctly.
- [ ] Add reaction and remove reaction.

## 7) Pins & Stars
- [ ] Pin a message; pin icon toggles to filled.
- [ ] Unpin a message; icon returns to outline.
- [ ] Star a message; star icon toggles to filled.
- [ ] Unstar a message; icon returns to outline.
- [ ] Pinned list loads and scrolls correctly.
- [ ] Starred list loads and scrolls correctly.

## 8) Search (Message Search)
- [ ] Search within chat returns relevant results.
- [ ] Search results panel scrolls and doesn’t overflow.
- [ ] Clicking a result scrolls to the correct message.
- [ ] If `MESSAGE_ENC_STORE_PLAINTEXT=false`, message search shows “disabled” hint.

## 9) Attachments & Upload Queue
- [ ] Add attachment via file picker.
- [ ] Drag-and-drop shows overlay and accepts files.
- [ ] Uploads run sequentially (one-by-one).
- [ ] Per-file progress updates.
- [ ] Cancel upload while uploading.
- [ ] Cancel upload before start.
- [ ] Cancel after upload (removes from Cloudinary).
- [ ] Retry failed upload.
- [ ] Draft attachments persist across refresh.
- [ ] Draft attachments do not exceed localStorage quota.

## 10) Offline / Retry Behavior
- [ ] Disable network; send message → shows failed state.
- [ ] Retry individual failed message; sends successfully.
- [ ] Queue resumes on reconnect.
- [ ] Exponential backoff doesn’t spam requests.

## 11) Encryption (At Rest)
- [ ] With `MESSAGE_ENC_STORE_PLAINTEXT=true`:
  - [ ] Stored messages have `textEnc` + plaintext `text`.
  - [ ] Search still works.
- [ ] With `MESSAGE_ENC_STORE_PLAINTEXT=false`:
  - [ ] Stored messages have `textEnc` and empty `text`.
  - [ ] Chat list shows “Encrypted message”.
  - [ ] Message search is disabled.
- [ ] Backfill script encrypts old plaintext messages.
- [ ] Key rotation script re-encrypts data using new key.

## 12) Security & Rate Limiting
- [ ] Rate limit triggers for auth endpoints (login/signup).
- [ ] Rate limit triggers for search/attachments endpoints.
- [ ] Invalid JWT returns 401.
- [ ] Socket connection rejected without valid cookie.
- [ ] CSP headers present in production responses.

## 13) Deployment Checks (Render/Prod)
- [ ] Build completes without errors.
- [ ] Node version matches `engines` requirement.
- [ ] Server binds to correct `PORT`.
- [ ] Frontend serves index on root and deep routes.
- [ ] API routes accessible at `/api/*`.

## 14) Regression Checklist
- [ ] Logout clears selected chat and cached state.
- [ ] Switching users does not leak previous chat data.
- [ ] New user register flow auto-fills username suggestion.
- [ ] Username check must pass to enable register button.

---
Notes:
- For encryption tests, verify in DB that `textEnc`, `linkPreviewEnc`, and `encKeyId` are set.
- For cookie checks, inspect response headers in browser devtools (Network → Response Headers).
