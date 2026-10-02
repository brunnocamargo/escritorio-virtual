/**
 * Escritorio Virtual - servidor de sinalizacao + estado dos jogadores.
 *
 * Responsabilidades:
 *  - servir o cliente estatico (public/)
 *  - manter a lista de pessoas conectadas (nome, aparencia, posicao, sala)
 *  - repassar mensagens de sinalizacao WebRTC entre os pares (mesh P2P)
 *  - repassar chat de texto (global e por sala)
 *
 * O audio/video NAO passa pelo servidor: as chamadas sao ponto a ponto.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const mapcheck = require('./public/js/mapcheck.js');
const accounts = require('./lib/accounts.js');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 60;

// Chave opcional para editar o mapa. Sem ela, qualquer pessoa conectada edita.
const EDITOR_KEY = process.env.EDITOR_KEY || '';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

// --------------------------------------------------------------- o mapa ---

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAP_FILE = path.join(DATA_DIR, 'office.json');
const contas = accounts.criarStore(DATA_DIR);
const MAP_DEFAULT = path.join(__dirname, 'data', 'office.default.json');

function loadMap() {
  for (const file of [MAP_FILE, MAP_DEFAULT]) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const check = mapcheck.validate(parsed);
      if (check.ok) return parsed;
      console.warn('[mapa] ' + path.basename(file) + ' invalido: ' + check.errors.join(' | '));
    } catch (err) {
      console.warn('[mapa] nao consegui ler ' + path.basename(file) + ':', err.message);
    }
  }
  throw new Error('Nenhum mapa valido. Rode: node scripts/build-default-map.js');
}

let officeMap = loadMap();

function saveMap(next) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(next, null, 2) + String.fromCharCode(10));
  officeMap = next;
}

/**
 * Quem pode publicar uma planta nova:
 *  - com EDITOR_KEY configurada: so quem mandar a chave certa
 *  - sem EDITOR_KEY: qualquer pessoa com conta (visitante nao edita)
 */
function editorAllowed(req) {
  if (EDITOR_KEY) return req.get('x-editor-key') === EDITOR_KEY;
  return !!contas.verificar(tokenDoPedido(req));
}

// ------------------------------------------------------------- contas ---

/** Mesmo formato para cadastro e salvamento, senao o historico enche a toa. */
function perfilLimpo(perfil, usuarioPadrao) {
  const p = perfil || {};
  return {
    nome: sanitize(p.nome, 20) || contas.nomeSugerido(usuarioPadrao),
    status: sanitize(p.status, 40),
    look: sanitizeLook(p.look || {}),
  };
}

function tokenDoPedido(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Middleware: exige sessao valida e coloca req.usuario. */
function exigirSessao(req, res, next) {
  const sessao = contas.verificar(tokenDoPedido(req));
  if (!sessao) return res.status(401).json({ error: 'Sessao expirada. Entre de novo.' });
  req.usuario = sessao.u;
  next();
}

app.post('/api/auth/register', (req, res) => {
  const { usuario, senha, perfil } = req.body || {};
  const resultado = contas.registrar(usuario, senha, perfilLimpo(perfil, usuario));
  if (resultado.erro) return res.status(400).json({ error: resultado.erro });
  console.log('[contas] nova conta: ' + resultado.conta.usuario);
  res.json(resultado);
});

app.post('/api/auth/login', (req, res) => {
  const { usuario, senha } = req.body || {};
  const resultado = contas.entrar(usuario, senha);
  if (resultado.erro) return res.status(401).json({ error: resultado.erro });
  res.json(resultado);
});

app.get('/api/auth/me', exigirSessao, (req, res) => {
  res.json({ conta: contas.publico(req.usuario) });
});

app.put('/api/auth/profile', exigirSessao, (req, res) => {
  const resultado = contas.salvarPerfil(req.usuario, perfilLimpo(req.body && req.body.perfil, req.usuario));
  if (resultado.erro) return res.status(400).json({ error: resultado.erro });
  res.json(resultado);
});

app.delete('/api/auth/history', exigirSessao, (req, res) => {
  const resultado = contas.apagarHistorico(req.usuario);
  if (resultado.erro) return res.status(400).json({ error: resultado.erro });
  res.json(resultado);
});

// --------------------------------------------------------------- mapa ---

app.get('/api/map', (req, res) => {
  res.json({ map: officeMap, locked: !!EDITOR_KEY, customized: fs.existsSync(MAP_FILE) });
});

app.put('/api/map', (req, res) => {
  if (!editorAllowed(req)) {
    return res.status(403).json({ error: EDITOR_KEY ? 'Chave de edicao invalida.' : 'Entre com sua conta para editar a planta.' });
  }
  const next = req.body && req.body.map;
  const check = mapcheck.validate(next);
  if (!check.ok) {
    return res.status(400).json({ error: 'Mapa invalido.', errors: check.errors });
  }
  const autor = String((req.body && req.body.author) || 'alguem').slice(0, 20);
  try {
    saveMap(next);
  } catch (err) {
    return res.status(500).json({ error: 'Nao consegui gravar: ' + err.message });
  }
  io.emit('map:updated', { map: officeMap, by: autor });
  io.emit('system', { text: autor + ' publicou uma nova planta do escritorio.', at: Date.now() });
  console.log('[mapa] atualizado por ' + autor + ' (' + officeMap.rows[0].length + 'x' + officeMap.rows.length + ')');
  res.json({ ok: true, warnings: check.warnings });
});

app.post('/api/map/reset', (req, res) => {
  if (!editorAllowed(req)) return res.status(403).json({ error: EDITOR_KEY ? 'Chave de edicao invalida.' : 'Entre com sua conta para editar a planta.' });
  try {
    if (fs.existsSync(MAP_FILE)) fs.unlinkSync(MAP_FILE);
    officeMap = loadMap();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  io.emit('map:updated', { map: officeMap, by: 'padrao' });
  res.json({ ok: true, map: officeMap });
});

// Se existirem certificados em ./certs, sobe em HTTPS (necessario para usar
// camera/microfone fora de localhost).
const certDir = path.join(__dirname, 'certs');
const keyFile = path.join(certDir, 'key.pem');
const certFile = path.join(certDir, 'cert.pem');
let server;
let scheme = 'http';
if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  server = https.createServer(
    { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) },
    app
  );
  scheme = 'https';
} else {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 20000,
});

/** @type {Map<string, object>} socketId -> player */
const players = new Map();

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Remove caracteres de controle e sinais de tag, e corta no tamanho maximo. */
function sanitize(value, max) {
  const raw = String(value == null ? '' : value);
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code < 32 || code === 127) continue;
    if (ch === '<' || ch === '>') continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}

// Aparencia do personagem: cores em hex e ids de peca (corpo, cabelo, roupa...).
const LOOK_COLORS = ['skin', 'hair', 'shirt', 'pants', 'detail'];
const LOOK_PARTS = ['body', 'hairstyle', 'outfit', 'face', 'head'];

function sanitizeLook(look = {}) {
  const out = {};
  for (const campo of LOOK_COLORS) {
    const valor = sanitize(look[campo], 7);
    out[campo] = /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : null;
  }
  for (const campo of LOOK_PARTS) {
    const valor = sanitize(look[campo], 20);
    out[campo] = /^[a-z-]{1,20}$/.test(valor) ? valor : null;
  }
  // o cliente completa o que vier nulo com os padroes de avatar.js
  return out;
}

function pickSpawn() {
  const spawns = officeMap.spawns;
  const spot = spawns[Math.floor(Math.random() * spawns.length)];
  return { x: spot[0] * 32 + 16, y: spot[1] * 32 + 16 };
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, look: p.look, x: p.x, y: p.y,
    dir: p.dir, moving: p.moving, room: p.room, status: p.status,
    mic: p.mic, cam: p.cam, screen: p.screen, account: p.account,
  };
}

io.on('connection', (socket) => {
  socket.on('join', (payload = {}, ack) => {
    if (players.size >= MAX_PLAYERS) {
      if (typeof ack === 'function') {
        ack({ error: 'Escritorio lotado. Tente novamente em instantes.' });
      }
      return socket.disconnect(true);
    }

    const sessao = contas.verificar(payload.token);
    const spawn = pickSpawn();
    const player = {
      id: socket.id,
      account: sessao ? sessao.u : null,
      name: sanitize(payload.name, 20) || (sessao ? contas.nomeSugerido(sessao.u) : 'Convidado'),
      look: sanitizeLook(payload.look || {}),
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      room: 'open',
      status: sanitize(payload.status, 40),
      mic: true,
      cam: true,
      screen: false,
      joinedAt: Date.now(),
    };
    players.set(socket.id, player);

    if (typeof ack === 'function') {
      ack({
        self: publicPlayer(player),
        players: [...players.values()]
          .filter((p) => p.id !== socket.id)
          .map(publicPlayer),
      });
    }
    socket.broadcast.emit('player:joined', publicPlayer(player));
    io.emit('system', { text: player.name + ' entrou no escritorio.', at: Date.now() });
  });

  socket.on('move', (m = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.x = clamp(Number(m.x) || 0, 0, 100000);
    p.y = clamp(Number(m.y) || 0, 0, 100000);
    p.dir = ['up', 'down', 'left', 'right'].includes(m.dir) ? m.dir : p.dir;
    p.moving = !!m.moving;
    if (typeof m.room === 'string') p.room = sanitize(m.room, 30);
    socket.broadcast.volatile.emit('player:moved', {
      id: p.id, x: p.x, y: p.y, dir: p.dir, moving: p.moving, room: p.room,
    });
  });

  socket.on('state', (s = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (typeof s.mic === 'boolean') p.mic = s.mic;
    if (typeof s.cam === 'boolean') p.cam = s.cam;
    if (typeof s.screen === 'boolean') p.screen = s.screen;
    if (typeof s.status === 'string') p.status = sanitize(s.status, 40);
    if (typeof s.name === 'string' && s.name.trim()) p.name = sanitize(s.name, 20);
    io.emit('player:state', {
      id: p.id, mic: p.mic, cam: p.cam, screen: p.screen, status: p.status, name: p.name,
    });
  });

  socket.on('chat', (msg = {}) => {
    const p = players.get(socket.id);
    if (!p) return;
    const text = sanitize(msg.text, 400);
    if (!text) return;
    const packet = {
      id: p.id,
      name: p.name,
      text,
      at: Date.now(),
      scope: msg.scope === 'room' ? 'room' : 'global',
      room: p.room,
    };
    if (packet.scope === 'room') {
      for (const other of players.values()) {
        if (other.room === p.room) io.to(other.id).emit('chat', packet);
      }
    } else {
      io.emit('chat', packet);
    }
  });

  // Sinalizacao WebRTC (offer / answer / ICE candidates) entre dois pares.
  socket.on('signal', (msg = {}) => {
    const target = msg.to;
    if (!target || !players.has(target) || !players.has(socket.id)) return;
    io.to(target).emit('signal', { from: socket.id, data: msg.data });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (!p) return;
    players.delete(socket.id);
    io.emit('player:left', { id: socket.id });
    io.emit('system', { text: p.name + ' saiu do escritorio.', at: Date.now() });
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Escritorio Virtual no ar');
  console.log('  Contas: ' + contas.total() + ' cadastrada(s)');
  console.log('  Mapa:   ' + officeMap.name + ' (' + officeMap.rows[0].length + 'x' + officeMap.rows.length +
    ', ' + officeMap.rooms.length + ' salas)' + (EDITOR_KEY ? ' - edicao protegida por chave' : ''));
  console.log('  Local:  ' + scheme + '://localhost:' + PORT);
  console.log('  Rede:   ' + scheme + '://SEU-IP-NA-REDE:' + PORT);
  if (scheme === 'http') {
    console.log('  Obs.: fora de localhost o navegador exige HTTPS para camera/microfone (veja o README).');
  }
  console.log('');
});
