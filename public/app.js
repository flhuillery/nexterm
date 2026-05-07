/* global Terminal, FitAddon, WebLinksAddon */
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  servers:     [],      // sanitized from API (no passwords)
  sessions:    new Map(), // tabId → SessionTab
  activeTabId: null,
  tabSeq:      0,
};

// ─── Avatar colours ───────────────────────────────────────────────────────────
const GRADIENTS = [
  ['#06b6d4','#8b5cf6'],
  ['#10b981','#06b6d4'],
  ['#f59e0b','#ef4444'],
  ['#8b5cf6','#ec4899'],
  ['#3b82f6','#06b6d4'],
  ['#10b981','#3b82f6'],
  ['#f43f5e','#fb923c'],
];

function avatarGradient(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  const [a, b] = GRADIENTS[Math.abs(h) % GRADIENTS.length];
  return `linear-gradient(135deg,${a},${b})`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const getServers    = ()        => api('GET',    '/api/servers');
const createServer  = (body)    => api('POST',   '/api/servers', body);
const updateServer  = (id, b)   => api('PUT',    `/api/servers/${id}`, b);
const deleteServer  = (id)      => api('DELETE', `/api/servers/${id}`);

// ─── Escape HTML ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── Notifications ────────────────────────────────────────────────────────────
function notify(msg, type = 'info', duration = 3500) {
  const wrap = document.getElementById('notifications');
  const el   = document.createElement('div');
  el.className = `notif ${type}`;
  el.innerHTML = `<div class="notif-dot"></div><span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  const dismiss = () => {
    el.classList.add('notif-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

// ─── Render server list ───────────────────────────────────────────────────────
function renderServers() {
  const list = document.getElementById('server-list');
  if (!state.servers.length) {
    list.innerHTML = `<div class="srv-empty">No servers yet.<br>Click <strong>+</strong> to add one.</div>`;
    return;
  }

  list.innerHTML = state.servers.map(s => {
    const initials = (s.name || s.host).slice(0,2).toUpperCase();
    const gradient = avatarGradient(s.name || s.host);
    const active   = [...state.sessions.values()].find(t => t.serverId === s.id && t.status === 'connected');

    return `
      <div class="srv-item" data-id="${esc(s.id)}">
        <div class="srv-avatar" style="background:${gradient}">
          ${esc(initials)}
          <div class="srv-status-dot${active ? ' connected' : ''}"></div>
        </div>
        <div class="srv-info">
          <div class="srv-name">${esc(s.name)}</div>
          <div class="srv-host">${esc(s.username)}@${esc(s.host)}:${esc(s.port)}</div>
        </div>
        <div class="srv-actions">
          <button class="srv-connect-btn" data-action="connect" data-id="${esc(s.id)}" title="Connect">
            SSH
          </button>
          <button class="srv-action-btn" data-action="edit" data-id="${esc(s.id)}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="srv-action-btn danger" data-action="delete" data-id="${esc(s.id)}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── Server Modal ─────────────────────────────────────────────────────────────
let currentAuthSeg = 'password';

function openServerModal(server = null) {
  const modal  = document.getElementById('server-modal');
  const title  = document.getElementById('server-modal-title');
  const idFld  = document.getElementById('edit-server-id');

  document.getElementById('f-name').value       = server?.name       || '';
  document.getElementById('f-host').value       = server?.host       || '';
  document.getElementById('f-port').value       = server?.port       || 22;
  document.getElementById('f-username').value   = server?.username   || '';
  document.getElementById('f-password').value   = '';
  document.getElementById('f-private-key').value = '';
  document.getElementById('f-passphrase').value  = '';
  idFld.value = server?.id || '';

  title.textContent = server ? 'Edit Server' : 'Add Server';

  // Reset auth seg
  setAuthSeg('password');

  modal.style.display = 'flex';
  document.getElementById('f-host').focus();
}

function setAuthSeg(seg) {
  currentAuthSeg = seg;
  document.querySelectorAll('#auth-seg .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.seg === seg);
  });
  document.getElementById('auth-password-sec').classList.toggle('hidden', seg !== 'password');
  document.getElementById('auth-key-sec').classList.toggle('hidden', seg !== 'key');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ─── Quick-connect Modal ──────────────────────────────────────────────────────
let currentQcAuth = 'password';

function openConnectModal(server) {
  document.getElementById('qc-server-id').value   = server.id;
  document.getElementById('qc-subtitle').textContent =
    `${server.username}@${server.host}:${server.port}`;
  document.getElementById('qc-password').value    = '';
  document.getElementById('qc-private-key').value = '';
  document.getElementById('qc-passphrase').value  = '';
  setQcAuthSeg('password');
  document.getElementById('connect-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('qc-password').focus(), 50);
}

function setQcAuthSeg(seg) {
  currentQcAuth = seg;
  document.querySelectorAll('#qc-auth-seg .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.qcseg === seg);
  });
  document.getElementById('qc-password-sec').classList.toggle('hidden', seg !== 'password');
  document.getElementById('qc-key-sec').classList.toggle('hidden', seg !== 'key');
}

// ─── SSH Session + Tab ────────────────────────────────────────────────────────
function startSession(server, authOverride = null) {
  const tabId = ++state.tabSeq;

  // Create terminal container
  const wrapper = document.getElementById('terminals-wrapper');
  const div     = document.createElement('div');
  div.id        = `term-${tabId}`;
  div.className = 'term-instance';
  div.innerHTML = `
    <div class="term-connecting">
      <div class="spinner"></div>
      <p>Connecting to</p>
      <span class="conn-host">${esc(server.username)}@${esc(server.host)}:${esc(server.port)}</span>
    </div>`;
  wrapper.appendChild(div);

  // Build xterm terminal (hidden until connected)
  const termEl = document.createElement('div');
  termEl.style.cssText = 'width:100%;height:100%;position:relative;';
  div.appendChild(termEl);

  const terminal = new Terminal({
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
    fontSize:   14,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback:  5000,
    theme: {
      background:    '#07070f',
      foreground:    '#e2e8f0',
      cursor:        '#06b6d4',
      cursorAccent:  '#07070f',
      selectionBackground: 'rgba(6,182,212,0.25)',
      black:         '#1e1e2e',
      red:           '#f38ba8',
      green:         '#a6e3a1',
      yellow:        '#f9e2af',
      blue:          '#89b4fa',
      magenta:       '#cba6f7',
      cyan:          '#89dceb',
      white:         '#cdd6f4',
      brightBlack:   '#585b70',
      brightRed:     '#f38ba8',
      brightGreen:   '#a6e3a1',
      brightYellow:  '#f9e2af',
      brightBlue:    '#89b4fa',
      brightMagenta: '#cba6f7',
      brightCyan:    '#89dceb',
      brightWhite:   '#a6adc8',
    },
  });

  const fitAddon      = new FitAddon.FitAddon();
  const webLinksAddon = new WebLinksAddon.WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.open(termEl);
  termEl.style.display = 'none'; // hide until connected

  // WebSocket
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws    = new WebSocket(`${proto}//${location.host}/ws`);
  ws.binaryType = 'arraybuffer';

  const session = {
    tabId,
    serverId:  server.id,
    serverName: server.name,
    server,
    status:    'connecting',
    terminal,
    fitAddon,
    ws,
    resizeObserver: null,
  };

  state.sessions.set(tabId, session);

  // Create tab element
  createTabEl(tabId, server.name);
  activateTab(tabId);
  showTerminalArea();

  // ── WebSocket handlers ──
  ws.addEventListener('open', () => {
    const dims = getTermDims(fitAddon, terminal);
    const msg  = { type: 'connect', serverId: server.id, cols: dims.cols, rows: dims.rows };
    if (authOverride?.password)   msg.password   = authOverride.password;
    if (authOverride?.privateKey) { msg.privateKey = authOverride.privateKey; if (authOverride.passphrase) msg.passphrase = authOverride.passphrase; }
    ws.send(JSON.stringify(msg));
  });

  ws.addEventListener('message', (evt) => {
    if (evt.data instanceof ArrayBuffer) {
      terminal.write(new Uint8Array(evt.data));
      return;
    }
    try {
      const msg = JSON.parse(evt.data);
      handleControlMsg(tabId, msg);
    } catch (_) {}
  });

  ws.addEventListener('close',  () => handleDisconnect(tabId, 'Connection closed'));
  ws.addEventListener('error',  () => handleDisconnect(tabId, 'WebSocket error'));

  // Terminal input → binary ws
  terminal.onData(data => {
    if (ws.readyState === WebSocket.OPEN && session.status === 'connected') {
      ws.send(new TextEncoder().encode(data));
    }
  });

  return tabId;
}

function getTermDims(fitAddon, terminal) {
  try { fitAddon.fit(); } catch (_) {}
  return { cols: terminal.cols || 80, rows: terminal.rows || 24 };
}

function handleControlMsg(tabId, msg) {
  const session = state.sessions.get(tabId);
  if (!session) return;

  if (msg.type === 'connected') {
    session.status = 'connected';

    // Remove connecting overlay, show terminal
    const div = document.getElementById(`term-${tabId}`);
    div.querySelector('.term-connecting')?.remove();
    const termEl = div.querySelector('div[style]');
    if (termEl) termEl.style.display = '';

    // Fit terminal now that it's visible
    if (state.activeTabId === tabId) {
      setTimeout(() => { try { session.fitAddon.fit(); } catch (_) {} }, 50);
    }

    // Watch for resize
    const termWrapper = document.getElementById(`term-${tabId}`);
    session.resizeObserver = new ResizeObserver(() => {
      if (state.activeTabId !== tabId) return;
      try {
        session.fitAddon.fit();
        const { cols, rows } = session.terminal;
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      } catch (_) {}
    });
    session.resizeObserver.observe(termWrapper);

    updateTabStatus(tabId, 'connected');
    renderServers();
    notify(`Connected to ${session.server.host}`, 'success');

  } else if (msg.type === 'error') {
    session.status = 'error';
    updateTabStatus(tabId, 'error');
    showDisconnectedOverlay(tabId, msg.message || 'Connection error');
    notify(`SSH error: ${msg.message}`, 'error', 5000);

  } else if (msg.type === 'closed') {
    handleDisconnect(tabId, 'Remote connection closed');
  }
}

function handleDisconnect(tabId, reason) {
  const session = state.sessions.get(tabId);
  if (!session) return;
  if (session.status === 'closed') return;
  session.status = 'closed';
  session.resizeObserver?.disconnect();
  updateTabStatus(tabId, 'closed');
  showDisconnectedOverlay(tabId, reason);
  renderServers();
  if (session.status !== 'error') notify(reason, 'warning');
}

function showDisconnectedOverlay(tabId, msg) {
  const div = document.getElementById(`term-${tabId}`);
  if (!div) return;
  div.querySelector('.term-connecting')?.remove();
  if (div.querySelector('.term-disconnected')) return;

  const ov = document.createElement('div');
  ov.className = 'term-disconnected';
  ov.innerHTML = `
    <svg style="width:40px;height:40px;color:#475569" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
    </svg>
    <div class="disc-title">Disconnected</div>
    <div class="disc-sub">${esc(msg)}</div>
    <button class="btn btn-ghost" id="close-tab-${tabId}">Close Tab</button>`;
  div.appendChild(ov);
  document.getElementById(`close-tab-${tabId}`)?.addEventListener('click', () => closeTab(tabId));
}

// ─── Tab management ───────────────────────────────────────────────────────────
function createTabEl(tabId, name) {
  const container = document.getElementById('tabs-container');
  const tab = document.createElement('div');
  tab.id        = `tab-${tabId}`;
  tab.className = 'tab';
  tab.dataset.tabId = tabId;
  tab.innerHTML = `
    <div class="tab-dot connecting"></div>
    <span class="tab-label" title="${esc(name)}">${esc(name)}</span>
    <button class="tab-close" data-close-tab="${tabId}" title="Close (Ctrl+W)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;
  container.appendChild(tab);
  tab.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-tab]')) return;
    activateTab(tabId);
  });
  tab.querySelector('[data-close-tab]').addEventListener('click', () => closeTab(tabId));
}

function activateTab(tabId) {
  state.activeTabId = tabId;

  // Tabs
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', parseInt(t.dataset.tabId) === tabId));

  // Terminal instances
  document.querySelectorAll('.term-instance').forEach(t =>
    t.classList.toggle('active', t.id === `term-${tabId}`));

  // Fit after CSS shows the container
  const session = state.sessions.get(tabId);
  if (session?.status === 'connected') {
    setTimeout(() => { try { session.fitAddon.fit(); } catch (_) {} }, 30);
    session.terminal.focus();
  }
}

function closeTab(tabId) {
  const session = state.sessions.get(tabId);
  if (session) {
    session.resizeObserver?.disconnect();
    try { session.ws.close(); } catch (_) {}
    try { session.terminal.dispose(); } catch (_) {}
    state.sessions.delete(tabId);
  }

  document.getElementById(`tab-${tabId}`)?.remove();
  document.getElementById(`term-${tabId}`)?.remove();

  // Activate neighbouring tab
  const remaining = [...state.sessions.keys()];
  if (remaining.length) {
    activateTab(remaining[remaining.length - 1]);
  } else {
    state.activeTabId = null;
    hideTerminalArea();
  }
  renderServers();
}

function updateTabStatus(tabId, status) {
  const dot = document.querySelector(`#tab-${tabId} .tab-dot`);
  if (dot) dot.className = `tab-dot ${status}`;
}

function showTerminalArea() {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('terminal-area').classList.remove('hidden');
}

function hideTerminalArea() {
  document.getElementById('terminal-area').classList.add('hidden');
  document.getElementById('welcome-screen').classList.remove('hidden');
}

// ─── Connect flow ─────────────────────────────────────────────────────────────
function connectServer(serverId) {
  const server = state.servers.find(s => s.id === serverId);
  if (!server) return;

  if (server.hasPassword || server.hasPrivateKey) {
    startSession(server);
  } else {
    openConnectModal(server);
  }
}

// ─── Initialise app ───────────────────────────────────────────────────────────
async function init() {
  try {
    state.servers = await getServers();
  } catch (_) {
    notify('Could not load servers', 'error');
  }
  renderServers();
  bindEvents();
}

// ─── Event bindings ───────────────────────────────────────────────────────────
function bindEvents() {

  // Sidebar collapse
  document.getElementById('collapse-btn').addEventListener('click', () => {
    document.getElementById('app').classList.toggle('collapsed');
  });

  // Add server buttons
  document.getElementById('add-server-btn').addEventListener('click', () => openServerModal());
  document.getElementById('welcome-add-btn').addEventListener('click', () => openServerModal());

  // Server list delegation
  document.getElementById('server-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'connect') {
      connectServer(id);
    } else if (btn.dataset.action === 'edit') {
      const s = state.servers.find(x => x.id === id);
      if (s) openServerModal(s);
    } else if (btn.dataset.action === 'delete') {
      if (!confirm(`Delete "${state.servers.find(x=>x.id===id)?.name}"?`)) return;
      try {
        await deleteServer(id);
        state.servers = state.servers.filter(x => x.id !== id);
        renderServers();
        notify('Server deleted', 'info');
      } catch (err) {
        notify(err.message, 'error');
      }
    }
  });

  // Modal backdrops / close buttons
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-close]');
    if (target) closeModal(target.dataset.close);
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('server-modal');
      closeModal('connect-modal');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      openServerModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (state.activeTabId) closeTab(state.activeTabId);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    }
  });

  // ── Server form ──
  document.getElementById('server-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id  = document.getElementById('edit-server-id').value;
    const body = {
      name:    document.getElementById('f-name').value.trim(),
      host:    document.getElementById('f-host').value.trim(),
      port:    document.getElementById('f-port').value,
      username: document.getElementById('f-username').value.trim(),
    };

    if (currentAuthSeg === 'password') {
      body.password = document.getElementById('f-password').value;
    } else if (currentAuthSeg === 'key') {
      body.privateKey  = document.getElementById('f-private-key').value.trim();
      body.passphrase  = document.getElementById('f-passphrase').value;
    }

    const btn = document.getElementById('server-save-btn');
    btn.disabled   = true;
    btn.textContent = 'Saving…';

    try {
      if (id) {
        const updated = await updateServer(id, body);
        const idx = state.servers.findIndex(s => s.id === id);
        if (idx !== -1) state.servers[idx] = updated;
        notify(`"${updated.name}" updated`, 'success');
      } else {
        const created = await createServer(body);
        state.servers.push(created);
        notify(`"${created.name}" added`, 'success');
      }
      closeModal('server-modal');
      renderServers();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Save Server';
    }
  });

  // Auth segmented control (server form)
  document.getElementById('auth-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn) setAuthSeg(btn.dataset.seg);
  });

  // Auth segmented control (quick connect)
  document.getElementById('qc-auth-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn) setQcAuthSeg(btn.dataset.qcseg);
  });

  // Quick connect form
  document.getElementById('connect-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id     = document.getElementById('qc-server-id').value;
    const server = state.servers.find(s => s.id === id);
    if (!server) return;

    const auth = {};
    if (currentQcAuth === 'password') {
      auth.password = document.getElementById('qc-password').value;
    } else {
      auth.privateKey = document.getElementById('qc-private-key').value.trim();
      auth.passphrase = document.getElementById('qc-passphrase').value;
    }

    closeModal('connect-modal');
    startSession(server, auth);
  });

  // Password visibility toggles
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.input-eye');
    if (!btn) return;
    const input   = document.getElementById(btn.dataset.target);
    const isPass  = input.type === 'password';
    input.type    = isPass ? 'text' : 'password';
    btn.querySelector('.eye-open').style.display  = isPass ? 'none'  : '';
    btn.querySelector('.eye-closed').style.display = isPass ? ''     : 'none';
  });

  // Tab bar add button
  document.getElementById('tab-add-btn').addEventListener('click', () => openServerModal());
}

// ─── Cycle tabs ───────────────────────────────────────────────────────────────
function cycleTab(dir) {
  const ids = [...state.sessions.keys()];
  if (!ids.length) return;
  const idx = ids.indexOf(state.activeTabId);
  const next = ids[(idx + dir + ids.length) % ids.length];
  activateTab(next);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
