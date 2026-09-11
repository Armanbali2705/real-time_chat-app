# Real-Time Chat App

A full-stack real-time messaging platform with 1:1 chat, group chat, and Reddit/Instagram-style topic communities ("niches") — built from scratch with Node.js, Express, Socket.IO, and MySQL.

## Features

**Messaging**
- Real-time 1:1 chat via WebSockets (Socket.IO), with typing indicators, read receipts, and online/offline presence
- Group chat with role-based permissions (creator/admin/member), invite-based joining, and admin controls (add members, promote admins)
- Image, video, audio, and document sharing in both 1:1 and group chats
- Cursor-based pagination for message history (scales to large conversations without slowdown)
- Unread message counts per conversation, with live updates
- Favorite/star contacts, filterable chat list (All / Unread / Favorites / Groups)

**Social layer**
- User search and connection requests (accept/decline), gating messaging behind mutual connection — similar to Instagram DM requests
- Clickable user profiles showing niches created/followed, with a direct "connect" action

**Niches (topic communities)**
- Create and browse topic-based communities, with nested subniches (e.g. "Sitcoms" → "Brooklyn 99")
- Text, image, and video posts within a niche
- Threaded replies (including replies-to-replies) with upvoting on both posts and replies
- Follow niches; an Explore page surfaces communities by activity
- Niche banners and per-niche post feeds

**Auth & security**
- JWT-based authentication, shared across HTTP routes and WebSocket connections
- Passwords hashed with bcrypt (salted, cost factor 10)
- Parameterized SQL queries throughout (no string-concatenated queries — SQL injection safe)
- Ownership/membership checks on every sensitive route (e.g. group message access requires verified membership, not just a valid ID)

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **Database:** MySQL (mysql2), with composite keys, self-referencing foreign keys, and multi-table joins/aggregations
- **Auth:** JWT (jsonwebtoken), bcryptjs
- **File uploads:** Multer
- **Frontend:** Vanilla JavaScript, no framework — DOM built manually to keep the fundamentals visible

## Architecture Highlights

- **Deterministic room naming** for 1:1 chat (`[userA, userB].sort().join('-')`) vs. **stable room IDs** for groups (`group-${groupId}`) — two different strategies for two different relationship shapes.
- **Cursor-based pagination** (`WHERE id < ?`) instead of offset pagination — avoids the classic "gets slower the deeper you page" problem.
- **Self-referencing foreign keys** used for both threaded niche replies (`parent_reply_id`) and niche hierarchy (`parent_niche_id`).
- **Composite primary keys** (e.g. `(user_id, niche_id)` on `niche_follows`) for pure relationship tables — no artificial surrogate ID where the natural key already guarantees uniqueness.
- **Optimistic client-side updates** (e.g. unread badges) with periodic re-sync from the server as source of truth.

## Measured Performance

- Added a composite index on `(sender_id, receiver_id, sent_at)` for the conversation-history query. Benchmarked on 200,000 seeded messages:
  - **Without index:** ~73ms average query latency
  - **With index:** ~5–7ms average query latency
  - **~91% reduction**
- Load-tested the Socket.IO layer with 100 concurrent simulated clients: sustained 350+ messages/sec with zero connection failures.

## Database Schema (overview)

`users`, `messages`, `connections`, `niches`, `niche_posts`, `niche_replies`, `niche_post_votes`, `niche_reply_votes`, `niche_follows`, `favorite_contacts`, `groups_table`, `group_members`, `group_messages`

## Running Locally

1. Clone the repo and run `npm install`
2. Set up a MySQL database and run the schema: mysql -u root -p chat_app < schema.sql
3. Create a `.env` file with:
DB_HOST=localhost,
DB_USER=root,
DB_PASSWORD=your_password,
DB_NAME=chat_app,
JWT_SECRET=your_secret_here,
PORT=3000
4. Run `node server.js`
5. Open `app.html` in a browser (via Live Server or similar)

## Known Limitations

- File uploads are stored on local disk — not yet backed by cloud storage (e.g. S3), so uploads won't persist across deployments/restarts in production.
- A few admin/creation flows use native browser dialogs rather than fully custom modals in a small number of remaining spots.
- No automated test suite yet — testing was done manually and via load-testing scripts during development.
