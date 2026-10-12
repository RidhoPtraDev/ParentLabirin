// A1+A2: Connect to host-specific namespace — receives full game data (door statuses, clues)
// and is the only namespace that can trigger startNewGame.
const socket = io('/ns-host');

// UI Bindings
const sessionIdVal  = document.getElementById('session-id');
const timerVal      = document.getElementById('timer-val');
const sessionStatus = document.getElementById('session-status');
const doorsBody     = document.getElementById('doors-body');
const cluesList     = document.getElementById('clues-list');
const qrImg         = document.getElementById('qr-img');

// BUG #3: simpan status sesi terakhir agar startNewGame() bisa cek sebelum emit
let lastKnownActive = false;
// Flag: true saat host baru saja klik Mulai Game Baru — menekan notifikasi game:ended
// yang datang dari startNewSession() (untuk menghindari flash status "Selesai" sesaat)
let newGamePending = false;

socket.on('hostState', (state) => {
  lastKnownActive = !!state.active;

  // Clear the newGamePending flag once the new active session arrives
  if (state.active && newGamePending) {
    newGamePending = false;
    console.log('[Parent Labirin] New session confirmed — newGamePending cleared.');
  }

  sessionIdVal.textContent = state.sessionId || 'Tidak Ada Sesi';

  const mins = Math.floor(state.timer / 60);
  const secs = state.timer % 60;
  timerVal.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  if (state.active) {
    sessionStatus.textContent = 'Permainan Berlangsung';
    sessionStatus.style.color = '#ff6b9d';
  } else {
    if (state.result) {
      if (state.result === 'win') {
        sessionStatus.textContent = 'Selesai - Menang (Pemain Lolos)';
        sessionStatus.style.color = '#4ade80';
      } else if (state.result === 'aborted_by_host') {
        sessionStatus.textContent = 'Selesai - Dihentikan Host';
        sessionStatus.style.color = '#fb923c';
      } else {
        sessionStatus.textContent = `Selesai - Kalah (${state.result.replace('lose_', '')})`;
        sessionStatus.style.color = '#f87171';
      }
    } else {
      sessionStatus.textContent = 'Idle';
      sessionStatus.style.color = '#a06070';
    }
  }

  if (state.qrCode) {
    qrImg.src = state.qrCode;
  }

  if (state.doors && state.doors.length > 0) {
    doorsBody.innerHTML = '';
    state.doors.forEach(door => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Pintu ${door.label}</strong></td>
        <td>Grid (${door.x}, ${door.y}) [Sisi ${door.side ? door.side.toUpperCase() : '-'}]</td>
        <td class="${door.status === 'lolos' ? 'door-lolos' : 'door-zonk'}">${door.status.toUpperCase()}</td>
      `;
      doorsBody.appendChild(tr);
    });
  } else {
    doorsBody.innerHTML = `<tr><td colspan="3">Menunggu sesi permainan...</td></tr>`;
  }

  if (state.clues && state.clues.length > 0) {
    cluesList.innerHTML = '';
    state.clues.forEach(clue => {
      const div = document.createElement('div');
      div.className = 'clue-item';
      div.innerHTML = `
        <p><strong>Clue di Grid (${clue.row}, ${clue.col}):</strong> ${clue.description}</p>
      `;
      cluesList.appendChild(div);
    });
  } else {
    cluesList.innerHTML = `<p>Belum ada petunjuk.</p>`;
  }
});

socket.on('game:ended', (data) => {
  console.log(`[Parent Labirin] Game ended: ${data.result}`);
  lastKnownActive = false;

  // If the host just triggered startNewGame, suppress the status flash.
  // A fresh hostState with active=true will arrive within milliseconds and set
  // the correct status, so we don't need to show "Selesai" in between.
  if (newGamePending) {
    console.log('[Parent Labirin] game:ended suppressed (newGamePending)');
    return;
  }

  if (data.result === 'win') {
    sessionStatus.textContent = 'Selesai - Menang';
    sessionStatus.style.color = '#4ade80';
  } else if (data.result === 'aborted_by_host') {
    sessionStatus.textContent = 'Selesai - Dihentikan Host';
    sessionStatus.style.color = '#fb923c';
  } else {
    sessionStatus.textContent = `Selesai - Kalah (${data.result.replace('lose_', '')})`;
    sessionStatus.style.color = '#f87171';
  }
});

socket.on('player:disconnected', (data) => {
  console.log(`[Parent Labirin] Player disconnected: ${data.reason}`);
  sessionStatus.textContent = 'Terputus Mendadak';
  sessionStatus.style.color = '#ef4444';
});

socket.on('connect', () => {
  console.log(`[Parent Labirin] Host socket connected: ${socket.id}`);
});

socket.on('disconnect', (reason) => {
  console.log(`[Parent Labirin] Host socket disconnected: Reason = ${reason}`);
});

// Non-blocking toast notification — replaces window.alert() so that the
// browser event loop is never blocked and socket callbacks always fire correctly.
function showToast(msg, isError = false) {
  let toast = document.getElementById('host-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'host-toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'padding:12px 24px', 'border-radius:10px', 'font-weight:600',
      'font-size:14px', 'z-index:9999', 'max-width:420px', 'text-align:center',
      'box-shadow:0 4px 20px rgba(0,0,0,0.4)', 'transition:opacity 0.4s'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#B91C1C' : '#1d4ed8';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

function startNewGame() {
  console.log(`[Parent Labirin] startNewGame called. lastKnownActive = ${lastKnownActive}, socket.connected = ${socket.connected}`);

  if (!socket.connected) {
    showToast('Tidak terhubung ke server. Tunggu sebentar lalu coba lagi.', true);
    return;
  }

  const btn = document.getElementById('btn-new-game');
  btn.disabled = true;
  btn.textContent = 'Memulai...';

  // Set flag so game:ended handler suppresses the "Selesai" flash during the transition
  newGamePending = true;
  // Show a neutral loading state
  sessionStatus.textContent = 'Memulai sesi baru...';
  sessionStatus.style.color = '#a0aec0';

  // Use 8s timeout — startNewSession() can take a few seconds for door reachability checks
  const timeoutId = setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Mulai Game Baru';
    newGamePending = false;
    showToast('Server lambat merespons. Coba lagi atau restart server.', true);
  }, 8000);

  socket.emit('startNewGame', (response) => {
    clearTimeout(timeoutId);
    btn.disabled = false;
    btn.textContent = 'Mulai Game Baru';
    // Keep newGamePending = true until hostState arrives with active=true
    // (it will be cleared in the hostState handler below)

    if (!response || !response.ok) {
      newGamePending = false;
      showToast('Gagal memulai game baru: ' + (response && response.error ? response.error : 'Tidak ada respons dari server.'), true);
    }
  });
}

// Host force end current session
function forceEndGame() {
  if (!lastKnownActive) {
    showToast('Tidak ada sesi permainan aktif yang bisa dihentikan.', true);
    return;
  }
  const konfirmasi = confirm('Apakah Anda yakin ingin menghentikan sesi permainan ini secara paksa?');
  if (konfirmasi) {
    const btn = document.getElementById('btn-force-end');
    const originalText = btn ? btn.textContent : 'Hentikan Paksa Selesai';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Menghentikan...';
    }

    const timeoutId = setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      showToast('Server lambat merespons. Coba lagi.', true);
    }, 6000);

    socket.emit('forceEndGame', (response) => {
      clearTimeout(timeoutId);
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      if (!response || !response.ok) {
        showToast('Gagal menghentikan sesi: ' + (response && response.error ? response.error : 'Tidak ada respons dari server.'), true);
      }
    });
  }
}

// Host triggers server shutdown completely
function shutdownServer() {
  const konfirmasi = confirm(
    'PERINGATAN!\n\nApakah Anda yakin ingin MEMATIKAN server secara permanen?\nSemua pemain akan terputus dan Dashboard tidak akan bisa diakses kembali.'
  );
  if (konfirmasi) {
    sessionStatus.textContent = 'Mematikan server...';
    sessionStatus.style.color = '#ef4444';
    socket.emit('server:shutdown');
  }
}

// Listen for server shutting down announcement
socket.on('server:shuttingDown', () => {
  sessionStatus.textContent = 'Server Nonaktif (Offline)';
  sessionStatus.style.color = '#718096';
  showToast('Server sedang mematikan diri. Koneksi terputus.', true);
  socket.disconnect();
});