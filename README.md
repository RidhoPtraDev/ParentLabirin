<div align="center">

# 🧭 Parent Labirin (Maze Engine & Real-Time Host Orchestration)

[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.io-v4.8-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io/)
[![Express.js](https://img.shields.io/badge/Express.js-v5.0-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Better--SQLite3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](#license)

**A high-performance, real-time interactive 2D maze game platform with bi-directional socket state synchronization, deterministic server-side collision validation, AI pathfinding, and dedicated host control telemetry.**

[Overview](#-system-overview) • [Key Features](#-enterprise-architecture--features) • [Tech Stack](#-technology-stack) • [System Architecture](#-system-architecture--data-flow) • [Quick Start](#-getting-started) • [API & Sockets](#-socketio-event-contracts) • [Security & Validation](#-anti-cheat--security-model)

</div>

---

## 📌 System Overview

**Parent Labirin** is a multi-role, real-time client-server maze game designed for interactive cooperative/competitive events. Built with an **Authoritative Server Architecture**, it decouples the gameplay view from privileged administrative telemetry:

* **Player Experience (`/`)**: A smooth 60 FPS HTML5 Canvas engine featuring client-side prediction, entity interpolation (LERP), directional sprite rendering, and zero knowledge of secret game elements.
* **Host Telemetry Dashboard (`/host`)**: An operations control room giving hosts real-time observability over match states, active sessions, dynamic clues, and underlying door escape statuses (*LOLOS* vs *ZONK*), accessible seamlessly via auto-generated LAN QR codes.

---

## 🚀 Enterprise Architecture & Features

### 🎮 Client Engine & UX (Player Interface)
* **60 FPS Hardware-Accelerated Canvas Rendering**: Custom top-down grid renderer with soft shadows, dynamic glowing borders, and rounded tile geometries.
* **Client-Side Prediction & Reconciliation**: User movements are rendered immediately with local prediction queues and reconciled against authoritative server acknowledgments (`moveAccepted` / `moveRejected`).
* **Linear Interpolation (LERP)**: Dynamic positioning smoothing (`0.55` for players, `0.22` for monsters) prevents tile-jumping and produces fluid character motion.
* **Haptic Visual Feedback**: Integrated sprite shaking effects and screen border flash pulses upon wall impact or input rate-limiting.
* **Multi-Monster Aesthetics**: 7 unique monster sprites with individualized visual identities across the 10×10 grid.

### 🛡️ Authoritative Backend & Network Layer
* **Dual-Namespace Isolation**: Complete cryptographic segregation between `/ns-host` (privileged) and `/ns-player` (restricted public), eliminating state inspection attacks.
* **Dynamic Breadth-First Search (BFS) AI**: Monsters calculate the shortest path towards the player in real-time, adapting chasing behaviors based on dynamic threat radii:
  * **Stage 1 (Time > 60s)**: Passive patrol, 2-cell detection radius.
  * **Stage 2 (60s ≥ Time > 30s)**: Active hunt, 4-cell detection radius.
  * **Stage 3 (Time ≤ 30s)**: High alert enrage, 6-cell detection radius with enhanced movement speed.
* **Deterministic Map Validation**: 100% cell reachability guarantee verified during server initialization through topological graph traversals.
* **Smart Physical Network Adapter Resolution**: Automatic filtering of virtual network adapters (Hyper-V, WSL, VirtualBox, VMware) to bind the QR code to the true physical Wi-Fi/Ethernet IP.
* **Process Lifecycle & Graceful Shutdown**: Graceful teardown of sockets, timers, and SQLite connection pools upon receiving `SIGINT`/`SIGTERM` or host shutdown signals.

### 🗄️ Persistence & Auditing (SQLite Engine)
* **Synchronous Native SQLite Binding (`better-sqlite3`)**: High-throughput, zero-latency in-process database.
* **Full Audit Trail**: Stores completed, timed-out, and host-aborted sessions, complete with door configurations, clue coordinates, and timestamps.

---

## 🛠️ Technology Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+ / v22+) | High-performance asynchronous JavaScript engine |
| **Server Framework** | Express.js v5 | Minimalist web framework serving static web assets |
| **Networking** | Socket.IO v4 | Low-latency full-duplex WebSocket protocol with fallback |
| **Database** | SQLite 3 (`better-sqlite3`) | Embedded C++ backed relational store |
| **Tooling & Network** | `qrcode` | Base64 QR code generation for mobile dashboard handoff |
| **Frontend Core** | Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3 | Zero-dependency, lightweight, native DOM & Canvas rendering |

---

## 📐 System Architecture & Data Flow

```
                           ┌────────────────────────┐
                           │    Host Web Client     │
                           │     (/host /ns-host)   │
                           └───────────┬────────────┘
                                       │ 1. startNewGame / forceEndGame
                                       │ 2. Telemetry (Clues, Status, Doors)
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   AUTHORITATIVE NODE.JS BACKEND                        │
│                                                                        │
│  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │   State Controller   │  │ BFS Pathfinding │  │ Session Manager   │  │
│  │ (Tick, Timer, Rules) │  │  (Monster AI)   │  │ (SQLite Storage)  │  │
│  └──────────────────────┘  └─────────────────┘  └───────────────────┘  │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │
                                       │ 1. Filtered State Broadcast
                                       │ 2. movePlayer / ACK-NACK
                                       ▼
                           ┌────────────────────────┐
                           │   Player Web Client    │
                           │   (/index.html Canvas) │
                           └────────────────────────┘
```

---

## 📂 Project Directory Structure

```text
parent-labirin/
├── package.json               # Node.js dependencies and lifecycle scripts
├── package-lock.json          # Dependency lockfile
├── .gitignore                 # Exclusion rules (node_modules, SQLite DB, local logs)
├── README.md                  # System technical documentation
├── server/                    # Backend source code
│   ├── index.js               # Application entry point, game loops, socket events
│   ├── maps.js                # Fixed maze topology database (4 x 10x10 maps)
│   ├── database.js            # SQLite connection setup and table migration schemas
│   └── game.db                # SQLite database (auto-generated at runtime)
└── public/                    # Web Client Assets
    ├── host/                  # Host Operations Control Center
    │   ├── index.html         # Host dashboard structure
    │   ├── styles.css         # Glassmorphism dark-mode UI
    │   └── host.js            # Host telemetry handler & remote triggers
    └── player/                # Player Game Interface
        ├── index.html         # Main canvas container & status modals
        ├── styles.css         # HUD styling & overlay transitions
        ├── game.js            # Canvas 2D engine, LERP, prediction, WASD handler
        └── assets/            # Static image sprites (Player, 7 Monsters, Doors)
```

---

## 🔒 Anti-Cheat & Security Model

1. **Information Asymmetry (Zero Knowledge Proof)**:
   * Exit doors contain statuses `lolos` (escape) or `zonk` (trap). The client payload strictly strips this field:
   ```json
   // Player Payload (Redacted):
   { "label": "A", "x": 0, "y": 4, "side": "left" }
   
   // Host Payload (Privileged):
   { "label": "A", "x": 0, "y": 4, "side": "left", "status": "lolos" }
   ```
2. **Server-Side Movement Authority**:
   * Every step requested via `movePlayer` is validated against authoritative wall masks in `server/index.js`. Moving through walls or out of bounds returns `moveRejected` with an authoritative rollback snapshot.
3. **Deterministic Rate Limiting**:
   * Input rate limit of **200ms** enforced on the server preventing macro automation and speed hacking.

---

## 📡 Socket.IO Event Contracts

### Host Namespace (`/ns-host`)
| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `hostState` | Server ➔ Client | `HostStateObject` | Full unredacted state including secrets and clues |
| `startNewGame` | Client ➔ Server | `callback(res)` | Initializes maze, resets positions, starts countdown |
| `forceEndGame` | Client ➔ Server | `callback(res)` | Aborts active game session |
| `server:shutdown`| Client ➔ Server | `void` | Triggers graceful application shutdown |

### Player Namespace (`/ns-player`)
| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `playerState` | Server ➔ Client | `PlayerStateObject`| Sanitized state (positions, time, walls, redacted doors) |
| `movePlayer` | Client ➔ Server | `'W'\|'A'\|'S'\|'D'` | Player requested motion vector |
| `moveAccepted`| Server ➔ Client | `{ x, y }` | Position confirmation for local reconciliation |
| `moveRejected`| Server ➔ Client | `{ reason, serverPos }`| Rollback coordinate packet |
| `game:ended` | Server ➔ Client | `{ result, reason }` | Final game termination verdict |

---

## 🚦 Getting Started

### Prerequisites
* **Node.js**: `v18.0.0` or higher
* **NPM**: `v9.0.0` or higher

### Installation & Execution

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RidhoPtraDev/ParentLabirin.git
   cd ParentLabirin
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   * Production mode:
     ```bash
     npm start
     ```
   * Development mode (auto-reload via nodemon):
     ```bash
     npm run dev
     ```

4. **Access the Application:**
   * **Player View**: Open [http://localhost:3000](http://localhost:3000)
   * **Host Dashboard**: Open [http://localhost:3000/host](http://localhost:3000/host) (or scan the console QR code from any smartphone on the local network).

---

## 📄 License

This project is licensed under the [ISC License](package.json).
