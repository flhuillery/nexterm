'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || '/data/servers.json';

app.use(express.json({ limit: '128kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Data persistence ────────────────────────────────────────────────────────

function loadServers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('Failed to load servers:', e.message);
  }
  return [];
}

function saveServers(servers) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save servers:', e.message);
  }
}

function sanitize(s) {
  return {
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    hasPassword: !!s.password,
    hasPrivateKey: !!s.privateKey,
    tags: s.tags || [],
  };
}

function validateInput(body) {
  const host = (body.host || '').trim();
  const username = (body.username || '').trim();
  const port = parseInt(body.port) || 22;
  if (!host || host.length > 253) return 'Invalid host';
  if (!username || username.length > 64) return 'Invalid username';
  if (port < 1 || port > 65535) return 'Invalid port';
  return null;
}

// ─── REST API ─────────────────────────────────────────────────────────────────

app.get('/api/servers', (_req, res) => {
  res.json(loadServers().map(sanitize));
});

app.post('/api/servers', (req, res) => {
  const err = validateInput(req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, host, port, username, password, privateKey, passphrase, tags } = req.body;
  const servers = loadServers();

  const server = {
    id: crypto.randomUUID(),
    name: ((name || host) + '').slice(0, 64),
    host: host.trim(),
    port: parseInt(port) || 22,
    username: username.trim(),
    tags: Array.isArray(tags) ? tags.slice(0, 8) : [],
  };

  if (password && typeof password === 'string') server.password = password;
  if (privateKey && typeof privateKey === 'string') server.privateKey = privateKey;
  if (passphrase && typeof passphrase === 'string') server.passphrase = passphrase;

  servers.push(server);
  saveServers(servers);
  res.status(201).json(sanitize(server));
});

app.put('/api/servers/:id', (req, res) => {
  const servers = loadServers();
  const idx = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Server not found' });

  const merged = { ...servers[idx], ...req.body, id: servers[idx].id };
  const err = validateInput(merged);
  if (err) return res.status(400).json({ error: err });

  const { name, host, port, username, password, privateKey, passphrase, tags } = req.body;
  const s = servers[idx];

  if (name !== undefined) s.name = (name + '').slice(0, 64);
  if (host !== undefined) s.host = (host + '').trim();
  if (port !== undefined) s.port = parseInt(port) || 22;
  if (username !== undefined) s.username = (username + '').trim();
  if (tags !== undefined) s.tags = Array.isArray(tags) ? tags.slice(0, 8) : [];

  if (password !== undefined) {
    if (password === '') delete s.password;
    else s.password = password;
  }
  if (privateKey !== undefined) {
    if (privateKey === '') delete s.privateKey;
    else s.privateKey = privateKey;
  }
  if (passphrase !== undefined) {
    if (passphrase === '') delete s.passphrase;
    else s.passphrase = passphrase;
  }

  servers[idx] = s;
  saveServers(servers);
  res.json(sanitize(s));
});

app.delete('/api/servers/:id', (req, res) => {
  let servers = loadServers();
  const prev = servers.length;
  servers = servers.filter(s => s.id !== req.params.id);
  if (servers.length === prev) return res.status(404).json({ error: 'Not found' });
  saveServers(servers);
  res.json({ ok: true });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── WebSocket SSH proxy ──────────────────────────────────────────────────────

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  let ssh = null;
  let stream = null;
  let live = false;

  const send = (obj) => {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    } catch (_) {}
  };

  const cleanup = () => {
    live = false;
    if (stream) { try { stream.close(); } catch (_) {} stream = null; }
    if (ssh)    { try { ssh.end();      } catch (_) {} ssh = null;    }
  };

  ws.on('message', (msg, isBinary) => {
    // Raw terminal input → forward to shell
    if (isBinary) {
      if (stream && live) stream.write(msg);
      return;
    }

    let data;
    try { data = JSON.parse(msg.toString()); }
    catch (_) { return; }

    if (data.type === 'connect') {
      if (ssh) cleanup();

      const servers = loadServers();
      const server = servers.find(s => s.id === data.serverId);
      if (!server) return send({ type: 'error', message: 'Server not found' });

      const cfg = {
        host: server.host,
        port: server.port || 22,
        username: server.username,
        readyTimeout: 15000,
        keepaliveInterval: 10000,
      };

      // Auth priority: client override → saved server credentials
      if (data.password)    { cfg.password = data.password; }
      else if (data.privateKey) {
        cfg.privateKey = data.privateKey;
        if (data.passphrase) cfg.passphrase = data.passphrase;
      } else if (server.password) {
        cfg.password = server.password;
      } else if (server.privateKey) {
        cfg.privateKey = server.privateKey;
        if (server.passphrase) cfg.passphrase = server.passphrase;
      }

      ssh = new Client();

      ssh.on('ready', () => {
        send({ type: 'connected', host: server.host, username: server.username });

        ssh.shell(
          { term: 'xterm-256color', cols: data.cols || 80, rows: data.rows || 24 },
          (err, s) => {
            if (err) { send({ type: 'error', message: err.message }); cleanup(); return; }
            stream = s;
            live = true;

            const fwd = (chunk) => {
              try { if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true }); }
              catch (_) {}
            };

            stream.on('data', fwd);
            stream.stderr.on('data', fwd);
            stream.on('close', () => { send({ type: 'closed' }); cleanup(); });
          }
        );
      });

      ssh.on('error', (err) => {
        send({ type: 'error', message: err.message });
        cleanup();
      });

      try { ssh.connect(cfg); }
      catch (err) { send({ type: 'error', message: err.message }); cleanup(); }

    } else if (data.type === 'resize') {
      if (stream && live) stream.setWindow(data.rows || 24, data.cols || 80);
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

httpServer.listen(PORT, () => {
  console.log(`NexTerm running → http://localhost:${PORT}`);
});
