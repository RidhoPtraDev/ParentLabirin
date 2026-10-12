# Parent Labirin — 2D Web Maze Game + Host Dashboard

Permainan maze 2D berbasis web (top-down grid view) yang dipadukan dengan Dashboard Host real-time. Semua berjalan di jaringan lokal (localhost/LAN) — tidak memerlukan internet.

---

## Cara Menjalankan

```bash
npm install
npm run dev
```

- **Aplikasi Pemain**: `http://localhost:3000`
- **Dashboard Host**: `http://localhost:3000/host` (atau scan QR Code dari HP yang tersambung ke WiFi yang sama)

---

## Mekanika Permainan

- **Grid 10×10**, kontrol keyboard **W/A/S/D** (gerak satu kotak per langkah)
- **5 Pintu Keluar** di tepi grid (A–E): 3 lolos + 2 zonk, diacak tiap sesi baru
- **Pintu posisi dinamis**: posisi & status pintu keluar dapat bergeser setiap 18 detik selama sesi berjalan
- **Labirin dinamis**: sebagian kecil dinding labirin dapat berubah secara berkala
- **2 Monster** dengan AI radius deteksi 3 fase (Pacman Ghost AI — no-reversal rule):
  - Sisa waktu > 1:00 → radius 2 grid
  - Sisa waktu 1:00–0:30 → radius 4 grid
  - Sisa waktu < 0:30 → radius 6 grid
- **Timer countdown 3:00** — waktu habis = kalah
- **Spawn acak** untuk pemain dan monster (jarak minimum 3 kotak pada grid 10x10)
- **Fixed Map Pool**: 4 layout labirin tetap dipilih acak setiap sesi baru

## Visual

- Rendering **2D top-down** menggunakan HTML5 Canvas 2D API
- **Tema Putih + Pink**: background putih `#FAFAFA`, dinding pink `#F5D7E3`
- **Pintu jalur** (dalam grid): sprite `door-style-2.png`
- **Pintu keluar**: sprite `door-style-1.png` mengambang di luar border labirin
- **Karakter**: sprite PNG dari `/public/player/assets/`
  - `player.png` — karakter pemain (robot putih-pink)
  - `monster-red.png` — monster merah
  - `monster-pink.png` — monster pink

---

## Struktur Folder

```
/server/
  index.js      ← Express + Socket.IO + game logic
  maps.js       ← Fixed map pool (4 x 10x10 layouts)
  database.js   ← SQLite schema setup
  game.db       ← SQLite database (auto-dibuat)
/public/
  /player/
    index.html  ← Halaman pemain
    styles.css
    game.js     ← Canvas 2D engine
    /assets/
      player.png
      monster-red.png
      monster-pink.png
      door-style-1.png  ← Pintu keluar (exit)
      door-style-2.png  ← Pintu jalur (passage)
  /host/
    index.html  ← Dashboard host
    styles.css
    host.js
```

---

## Keamanan Data

- Status pintu (lolos/zonk) dan clue **TIDAK** dikirim ke client pemain — validasi sepenuhnya di server
- Semua collision dengan dinding divalidasi berbasis grid cell di server (anti-cheat)

---

## Catatan IP / QR Code

Server otomatis mendeteksi IP WiFi/Ethernet fisik dan mengabaikan virtual adapter (VirtualBox, VMware, dll). Log saat server start:
```
[Parent Labirin] IP lokal terdeteksi untuk QR Code: 192.168.1.x
[Parent Labirin] Dashboard Host dapat diakses di: http://192.168.1.x:3000/host
```

---

## Asumsi yang Diambil

- Soal kuis dibacakan **lisan oleh Host** di luar sistem — tidak ada fitur soal/jawaban di aplikasi
- Semua perangkat harus terhubung ke **jaringan WiFi yang sama**
- Server dijalankan di Windows; IP detection diprioritaskan ke adapter Wi-Fi/Ethernet fisik
- SQLite database akan otomatis dibuat di `server/game.db` saat pertama kali dijalankan
- Validasi reachability semua map dijalankan saat server startup — lihat log console
