<p align="center">
  <img src="https://raw.githubusercontent.com/RidhoPtraDev/ParentLabirin/main/docs/assets/logo.png" alt="Parent Labirin Logo" width="130" height="150" />
</p>

<h1 align="center">Parent Labirin</h1>

<p align="center">
  <strong>Engine Game Labirin 2D Real-Time & Pusat Orkestrasi Host Terintegrasi</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Runtime-Node.js%20v18%2B%20%2F%20v22%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="https://socket.io"><img src="https://img.shields.io/badge/Protocol-Socket.IO%20v4-010101?style=flat-square&logo=socketdotio&logoColor=white" alt="Socket.IO"></a>
  <a href="https://expressjs.com"><img src="https://img.shields.io/badge/Server-Express.js%20v5-000000?style=flat-square&logo=express&logoColor=white" alt="Express"></a>
  <a href="https://www.sqlite.org"><img src="https://img.shields.io/badge/Database-SQLite%20(better--sqlite3)-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-All%20Rights%20Reserved-blue?style=flat-square" alt="License"></a>
</p>

---

## 📌 Ikhtisar Proyek (Executive Summary)

**Parent Labirin** adalah platform permainan maze 2D real-time berbasis jaringan lokal (LAN/WebSocket) yang dirancang untuk skenario permainan interaktif antara **Pemain (Player)** dan **Pemandu Game (Host)**. 

Mengusung arsitektur **Authoritative Server**, sistem memisahkan tampilan pemain dari kendali telemetri administratif. Pemain disajikan pengalaman bermain 60 FPS pada HTML5 Canvas dengan prediktor pergerakan responsif tanpa membocorkan rahasia labirin. Di sisi lain, Host dibekali **Dashboard Control Center** real-time untuk memantau status sesi, membaca lokasi petunjuk (*clues*), mengidentifikasi pintu keluar asli (*LOLOS vs ZONK*), serta mengontrol alur permainan dari laptop maupun *smartphone* via pemindaian kode QR otomatis.

---

## ✨ Fitur Utama (Key Features)

### 1. 🎮 Mesin Canvas 2D Adaptif & Prediksi Klien (Client Engine)
* **Rendering Performa Tinggi (60 FPS)**: Kanvas grafis responsif dengan pewarnaan tematik (*white & pink pastel*), bayangan dinamis, dan efek partikel cahaya pintu.
* **Client-Side Prediction & Reconciliation**: Input pergerakan direspon instan di sisi pemain dan disinkronkan kembali terhadap validasi server (*zero-lag experience*).
* **Linear Entity Interpolation (LERP)**: Transisi pergerakan halus (koefisien `0.55` untuk pemain dan `0.22` untuk monster) sehingga karakter meluncur mulus tanpa patah-patah antar sel grid.
* **Umpan Balik Visual Haptik**: Efek getar (*sprite shake*) dan kedip border merah (*screen flash*) otomatis saat pemain menabrak dinding atau terkena *rate-limiting* cooldown pergerakan (200ms).

### 2. 🤖 AI Pathfinding Monster Adaptif (Dynamic BFS Engine)
* **7 Varian Monster Mandiri**: Mengitari labirin dengan identitas visual unik (Red, Pink, Red2, White Horn, Rainbow Puff, Star, Blue).
* **Algoritma Jalur Terpendek (Shortest Path)**: Mengejar pemain secara cerdas menggunakan algoritma Breadth-First Search (BFS) dengan radius ancaman dinamis 3 fase:
  * **Fase Awal (> 60 detik)**: Patroli santai (radius deteksi 2 grid).
  * **Fase Menengah (60 - 30 detik)**: Pengejaran aktif (radius deteksi 4 grid).
  * **Fase Bahaya (< 30 detik)**: Mode *enrage* kecepatan tinggi (radius deteksi 6 grid).
* **Deteksi Tabrakan Presisi**: Memvalidasi sentuhan langsung pada satu sel dan mengeliminasi eksploitasi silang (*crossing/swapped cells*).

### 3. 🛡️ Telemetri Host & Isolasi Namespace (Dual-Namespace Isolation)
* **Keamanan Informasi Tingkat Tinggi (*Zero-Knowledge*)**:
  * Namespace `/ns-player` hanya menerima data publik (labirin, monster, timer, dan label pintu). Status pintu rahasia (*LOLOS* atau *ZONK*) tidak pernah dikirim ke pemain untuk mencegah *inspect-element cheating*.
  * Namespace `/ns-host` memiliki otorisasi penuh membaca data rahasia serta mengeksekusi kendali sesi (*Start Game*, *Force End*, dan *Server Graceful Shutdown*).
* **Akses Cepat QR Code LAN**: Mendeteksi IP jaringan fisik (Wi-Fi/Ethernet) dan menghasilkan QR Code instan di dashboard agar Host dapat memandu jalannya game langsung dari HP.

### 4. 🗺️ Generator Labirin Terverifikasi (Topological Map Pool)
* Dilengkapi kumpulan map labirin tetap (*Fixed Map Pool 10x10*) yang divalidasi dengan algoritma traversi graf saat server dijalankan.
* Menjamin 100% sel labirin selalu dapat dijangkau dan selalu ada jalur bebas hambatan menuju pintu *LOLOS*.

### 5. 🗄️ Audit Sesi & Database SQLite Terintegrasi
* Pencatatan riwayat sesi secara terstruktur menggunakan **better-sqlite3**:
  * **Tabel `sessions`**: Waktu mulai, waktu selesai, dan hasil akhir (*Win, Lose Zonk, Lose Monster, Lose Timeout, Aborted*).
  * **Tabel `doors_config`**: Posisi dan tipe rahasia 5 pintu keluar setiap sesi.
  * **Tabel `clues`**: Koordinat dan petunjuk rahasia yang digenerasi per sesi.

---

## 🏗️ Arsitektur & Tech Stack (Architecture & Technology)

Aplikasi dibangun mengacu pada standar pengembangan web modular & real-time:

```
Game Parent Labirin/
├── server/
│   ├── index.js               # Core Express Server, Socket.IO Namespaces, Collision & AI Loop
│   ├── maps.js                # Fixed 10x10 Maze Layout Pool & Topological Rules
│   ├── database.js            # Inisialisasi Database SQLite & Skema Relasional
│   └── game.db                # File Database SQLite (Penyimpanan Audit Lokal)
├── public/
│   ├── host/                  # Modul Dashboard Operasional Host
│   │   ├── index.html         # Struktur Antarmuka Host Control Center
│   │   ├── styles.css         # Desain Modern Glassmorphism & Dark Palette
│   │   └── host.js            # Telemetri Socket Host, Toast UI & Remote Actions
│   └── player/                # Modul Antarmuka Pemain (Canvas Engine)
│       ├── index.html         # Kontainer Layar Game & Pop-up Modal Status
│       ├── styles.css         # Styling HUD & Overlay Animasi
│       ├── game.js            # Engine Canvas 2D, LERP, Keyboard WASD & Client Prediction
│       └── assets/            # Aset Grafis Karakter Pemain, 7 Monster, & Pintu
├── docs/
│   └── assets/                # Aset Dokumentasi & Logo Maskot
├── package.json               # Konfigurasi Dependensi & Script Proyek
└── README.md                  # Dokumentasi Teknis Sistem
```

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Runtime Lingkungan** | Node.js (v18+ / v22+) | Mesin eksekusi JavaScript server-side berperforma tinggi |
| **Protokol Real-Time** | Socket.IO v4.8 | Komunikasi dua arah (duplex) berbasis WebSocket dengan fallback |
| **Web Server** | Express.js v5 | Penyedia HTTP routing & static asset file serving |
| **Database Engine** | SQLite (`better-sqlite3`) | Relasional database embedded berbasis native binding C++ |
| **QR Code Generator** | `qrcode` | Mengonversi URL LAN host menjadi Base64 QR Code dinamis |
| **Game Rendering** | Vanilla HTML5 Canvas 2D | Render grafik 60 FPS bebas dependensi pustaka berat |
| **Styling & UI** | Vanilla CSS3 (Glassmorphism) | Tampilan modern, kartu transparan, dan responsif lintas layar |

---

## 🚀 Panduan Memulai (Getting Started)

### Prasyarat (Prerequisites)
* **Node.js**: Versi `18.0.0` atau yang lebih baru.
* **NPM**: Versi `9.0.0` atau bawaan Node.js.
* Browser modern (Chrome, Edge, Firefox, Safari) yang mendukung Canvas dan WebSocket.

### Instalasi & Setup Lokal

1. **Clone Repository:**
   ```bash
   git clone https://github.com/RidhoPtraDev/ParentLabirin.git
   cd ParentLabirin
   ```

2. **Instalasi Dependensi:**
   ```bash
   npm install
   ```

3. **Menjalankan Server:**
   * **Mode Produksi**:
     ```bash
     npm start
     ```
   * **Mode Pengembangan** (Auto-reload via nodemon):
     ```bash
     npm run dev
     ```

4. **Akses Aplikasi:**
   * **Layar Pemain**: Buka browser di [http://localhost:3000](http://localhost:3000)
   * **Dashboard Host**: Buka browser di [http://localhost:3000/host](http://localhost:3000/host) (atau scan QR Code dari smartphone Anda yang terhubung pada Wi-Fi yang sama).

---

## 🔒 Standar Keamanan & Reliabilitas (Security & Reliability)

* **Server-Authoritative Validation**: Seluruh collision dinding dan interaksi pintu divalidasi ketat di sisi server. Klien tidak dapat memodifikasi posisi atau menembus dinding secara ilegal.
* **Rate-Limiting Input Anti-Macro**: Cooldown 200ms diterapkan di sisi server untuk memitigasi eksekusi skrip bot/makro tombol cepat.
* **Network Adapter Filtering**: Algoritma cerdas yang memilah adaptor fisik Wi-Fi/Ethernet asli dan mengabaikan IP internal virtual (Hyper-V, WSL, VirtualBox) sehingga koneksi QR Code selalu valid.
* **Graceful Server Teardown**: Server menangani sinyal `SIGINT`, `SIGTERM`, dan event remote shutdown dengan memutuskan koneksi socket secara tertib, membersihkan interval timer, dan menutup database tanpa *data corruption*.

---

## 📄 Lisensi (License)

Seluruh hak cipta dilindungi undang-undang (**All Rights Reserved**).

Proyek ini merupakan perangkat lunak berhak cipta eksklusif. Dilarang keras menggandakan, menyalin, mendistribusikan ulang, atau memanfaatkan kode sumber ini untuk keperluan komersial tanpa persetujuan tertulis dari pemilik hak cipta.
