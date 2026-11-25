# StarConquest Master & Match Server (`src/server/`) — Architecture & Implementation Plan

> **Planning Phase Only**: This document defines the architecture, requirements, protocol, infrastructure, and phased implementation plan for the headless authoritative WebSocket server under `src/server/`. No server code has been written yet.

---

## 1. Goal & Why This Gives the Best Player Experience

Players want to click **Host Online Room**, share a short `SC-XXXX` code, and play with up to 3 friends immediately—without copy-pasting SDP tokens, configuring router port forwarding, or losing the match if the host's browser tab closes.

Because `src/shared/sim/` already has **zero browser, DOM, or Three.js dependencies**, running a headless **Authoritative WebSocket Server** under `src/server/` delivers the cleanest experience:

| Player Experience Dimension | Current Browser P2P (`WebRTCPeerAdapter`) | Proposed `src/server/` (`wss://` WebSockets) |
| :--- | :--- | :--- |
| **Joining a Match** | Same-machine `SC-XXXX` or 2-round manual token copy-paste | Instant `SC-XXXX` room code from anywhere |
| **Firewalls & Strict NATs** | Fails on Symmetric NAT / VPNs without a TURN relay | Works everywhere over standard outbound `TCP 443` (`wss://`) |
| **Host Disconnects** | Entire match dies if the host closes their tab | Match continues; players can reconnect with a session token |
| **Fog-of-War Anti-Cheat** | Host browser holds full galaxy state | Only the server holds full state; clients only receive their own `StateSnapshot` |
| **Offline / Solo Play** | `LocalSimAdapter` (100% in-browser) | Unchanged (`LocalSimAdapter` stays 100% local with zero server dependency) |

---

## 2. Repository Layout & Shared Core Integration

Because `src/server/` lives inside the `StarConquest` repository, it imports `../shared/` (`config/`, `sim/`, `ai/`, `protocol/`) directly with TypeScript strict mode—no git submodules or separate npm package publishing required.

```text
src/
├── shared/                   # Authoritative simulation, AI bots, balance config, StateSnapshot protocol
├── client/                   # Browser Three.js + HUD client + LocalSimAdapter / WebSocketSimAdapter
└── server/                   # Headless Node.js Master & Authoritative Match Server
    ├── index.ts              # HTTP + WebSocket server entrypoint & graceful SIGTERM shutdown
    ├── config.ts             # Env config (PORT, ALLOWED_ORIGINS, MAX_ROOMS, SNAPSHOT_HZ)
    ├── roomManager.ts        # SC-XXXX room lifecycle, slot assignment, reconnect tokens, idle eviction
    ├── matchRunner.ts        # Wraps GameSimulation + StandardAIBot fixed-tick loop & 20 Hz snapshots
    ├── wsTransport.ts        # Boundary parsing, per-peer rate limiting, ping/pong RTT telemetry
    ├── health.ts             # GET /healthz & lightweight readiness metrics
    └── __tests__/
        ├── roomManager.test.ts   # Room creation, join, slot swap, reconnect, idle eviction
        └── matchRunner.test.ts   # Multi-client command auth, Fog-of-War snapshot isolation, AI slots
```

### Build & Script Integration (`package.json`)
- Add `ws` (and `@types/ws`) as server dependencies.
- Keep `npm run build` (`tsc --noEmit && vite build`) building the browser client cleanly without bundling `src/server/`.
- Add dedicated server scripts:
  - `npm run server:dev` — Run `src/server/index.ts` locally on `ws://localhost:8080`.
  - `npm run server:build` — Compile `src/server/` to `dist-server/` via a dedicated `tsconfig.server.json`.
  - `npm run server:start` — Run `node dist-server/server/index.js` in production.

---

## 3. Protocol & Client Integration Requirements

### Server Wire Protocol (Extends `src/shared/protocol/snapshots.ts`)
- Reuses existing `StateSnapshot`, `LobbyPeerSlotInfo`, `GameCommand`, and `parseP2PWireMessage` boundary validation.
- Adds server-specific lobby/session messages:
  - `create_room` / `room_created` (`roomCode`, `hostToken`, `sessionToken`)
  - `join_room` / `room_joined` (`roomCode`, `sessionToken`, `assignedSlotId`)
  - `reconnect_room` (`roomCode`, `sessionToken`) — restores a dropped player's slot mid-match
  - `ping` / `pong` — measures live RTT (ms) for a HUD connection indicator
  - `room_error` — explicit user-facing errors (`ROOM_NOT_FOUND`, `ROOM_FULL`, `MATCH_ALREADY_STARTED`, `RATE_LIMITED`)

### Client Changes in `src/client/` (Implementation Phase 3)
1. **New `WebSocketSimAdapter`** (`src/client/net/wsSimAdapter.ts`):
   - Implements `ClientSimAdapter` and `MultiplayerRoomAdapter` (the exact same interfaces already used by `SystemSceneManager`, `SystemHud`, and `LobbyController`).
   - Connects over `wss://<server-host>` (`TCP 443` in production, `ws://localhost:8080` locally), updates `SnapshotSimulationView` on incoming `state_snapshot` packets, and sends `player_command` packets.
2. **Streamlined `LobbyController`** (`src/client/ui/lobbyController.ts`):
   - When a multiplayer server URL is configured (`VITE_MULTIPLAYER_SERVER_URL`), **Host Online Room** creates an `SC-XXXX` room on the master server and **Join Room Code** joins directly—no manual SDP/ICE token copy-paste needed.
   - Displays live connected player status, RTT ping, and one-click **Copy Room Code**.
   - Keeps `LocalSimAdapter` as the default for instant offline single-player and Guided Tutorial.

---

## 4. Infrastructure, Ports & Operational Requirements

### Network & Firewall Ports
- **Server Inbound**: **1 port only — `TCP 443`** (`HTTPS` + `WSS` WebSockets terminated by platform TLS or Caddy/Nginx, forwarding to internal app port `PORT=8080`).
- **Player Machines**: **Zero inbound ports** and **zero router configuration**. Players only make standard outbound `TCP 443` connections.

### Runtime & Hosting Sizing
- **Runtime**: Node.js 22 LTS + `ws` WebSocket library.
- **CPU / Memory**: Each active 4-player match runs one `GameSimulation` + up to 3 `StandardAIBot` instances at 20 Hz snapshot broadcast (~20–40 MB RAM per active room). A single **1 vCPU / 512 MB–1 GB** instance (e.g., Fly.io, Railway, Render, or a small VPS) comfortably runs 15–25 concurrent matches, with auto-sleep or scale-to-zero supported when no rooms are active.

### Security & Stability Guardrails
- **Origin Allowlist**: Validate WebSocket `Origin` header against the deployed `StarConquest` URL (plus `localhost` in dev).
- **Session Token Auth**: Issue a random per-connection `sessionToken` on `create_room` / `join_room`; bind every incoming `GameCommand.playerId` to the server-verified slot for that token (prevents spoofing).
- **Rate Limiting & Payload Caps**: Cap incoming WebSocket message size (e.g., `16 KB`) and command frequency (e.g., `30 commands/sec` per client).
- **Idle & Finished Room Cleanup**: Evict empty lobby rooms after `10 minutes` of inactivity and finished matches `5 minutes` after `MatchOutcomeState.status !== 'in_progress'`.

---

## 5. Phased Implementation Roadmap (Awaiting Go-Ahead)

1. **Phase 1 — Server Scaffold & Room Manager**: Add `tsconfig.server.json`, `ws`, `src/server/index.ts`, `src/server/health.ts` (`GET /healthz`), `src/server/roomManager.ts`, and unit tests for room lifecycle and reconnect tokens.
2. **Phase 2 — Authoritative Match Loop**: Implement `src/server/matchRunner.ts` wrapping `GameSimulation`, `StandardAIBot`, 20 Hz per-player Fog-of-War `StateSnapshot` broadcasting, and command validation tests.
3. **Phase 3 — Client `WebSocketSimAdapter` & Lobby Polish**: Add `src/client/net/wsSimAdapter.ts`, wire `VITE_MULTIPLAYER_SERVER_URL`, streamline `LobbyController` online room UX, and add live RTT ping display.
4. **Phase 4 — Deployment & End-to-End Verification**: Deploy server behind `wss://` (`TCP 443`), verify multi-browser cross-network 4-player match + mid-game reconnect, and update `README.md`.
