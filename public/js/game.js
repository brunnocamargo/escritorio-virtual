/**
 * game.js - mundo 2D: entrada do teclado, colisao, camera, render e a regra
 * de quem escuta quem (proximidade no open space, sala inteira nas salas).
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});
  const W = VO.world;
  const S = VO.sprites;

  const TILE = W.TILE;
  const SPEED = 132;          // px por segundo
  const NEAR_TILES = 3.2;     // volume cheio ate aqui
  const FAR_TILES = 7.5;      // silencio a partir daqui
  const NET_INTERVAL = 60;    // ms entre updates de posicao

  const game = {
    canvas: null,
    ctx: null,
    self: null,
    players: new Map(),
    zoom: 1,
    camera: { x: 0, y: 0 },
    inputEnabled: true,
    running: false,
    onRoomChange: null,
    onPlayersChange: null,
  };

  const keys = new Set();
  let lastNetSend = 0;
  let lastSent = { x: 0, y: 0, dir: 'down', moving: false, room: '' };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ------------------------------------------------------------- entidades ---

  function makeEntity(p, isSelf) {
    return {
      id: p.id,
      name: p.name,
      look: p.look,
      x: p.x,
      y: p.y,
      rx: p.x,          // posicao renderizada (interpolada)
      ry: p.y,
      dir: p.dir || 'down',
      moving: false,
      room: p.room || 'open',
      status: p.status || '',
      mic: p.mic !== false,
      cam: p.cam !== false,
      screen: !!p.screen,
      isSelf: !!isSelf,
      speaking: false,
      walkPhase: 0,
    };
  }

  function addPlayer(p) {
    game.players.set(p.id, makeEntity(p, false));
    notifyPlayers();
  }

  function removePlayer(id) {
    game.players.delete(id);
    notifyPlayers();
  }

  function applyMove(m) {
    const e = game.players.get(m.id);
    if (!e) return;
    e.x = m.x;
    e.y = m.y;
    e.dir = m.dir;
    e.moving = m.moving;
    e.room = m.room;
    // se ficou muito longe (troca de sala, teleporte), corta a interpolacao
    if (Math.hypot(e.rx - e.x, e.ry - e.y) > 160) {
      e.rx = e.x;
      e.ry = e.y;
    }
  }

  function applyState(s) {
    const e = s.id === game.self.id ? game.self : game.players.get(s.id);
    if (!e) return;
    if (typeof s.mic === 'boolean') e.mic = s.mic;
    if (typeof s.cam === 'boolean') e.cam = s.cam;
    if (typeof s.screen === 'boolean') e.screen = s.screen;
    if (typeof s.status === 'string') e.status = s.status;
    if (typeof s.name === 'string') e.name = s.name;
    notifyPlayers();
  }

  function notifyPlayers() {
    if (typeof game.onPlayersChange === 'function') game.onPlayersChange();
  }

  function everyone() {
    return [game.self, ...game.players.values()].filter(Boolean);
  }

  // ----------------------------------------------------------------- audio ---

  /** Volume (0..1) que `self` deve ouvir de `other`. */
  function volumeBetween(a, b) {
    const inRoomA = a.room && a.room !== 'open';
    const inRoomB = b.room && b.room !== 'open';
    if (inRoomA || inRoomB) return a.room === b.room ? 1 : 0;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) / TILE;
    if (dist <= NEAR_TILES) return 1;
    if (dist >= FAR_TILES) return 0;
    return (FAR_TILES - dist) / (FAR_TILES - NEAR_TILES);
  }

  /** Lista de pares que devem estar conectados agora, com o volume de cada um. */
  function audioTargets() {
    if (!game.self) return [];
    const out = [];
    for (const other of game.players.values()) {
      const volume = volumeBetween(game.self, other);
      if (volume > 0.02) out.push({ id: other.id, volume, name: other.name });
    }
    return out;
  }

  // --------------------------------------------------------------- entrada ---

  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  const KEY_MAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  function bindInput() {
    window.addEventListener('keydown', (ev) => {
      if (isTyping()) return;
      const dir = KEY_MAP[ev.code];
      if (dir) {
        keys.add(dir);
        ev.preventDefault();
        return;
      }
      if (ev.code === 'Equal' || ev.code === 'NumpadAdd') setZoom(game.zoom + 1);
      if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') setZoom(game.zoom - 1);
    });
    window.addEventListener('keyup', (ev) => {
      const dir = KEY_MAP[ev.code];
      if (dir) keys.delete(dir);
    });
    window.addEventListener('blur', () => keys.clear());
  }

  function setZoom(z) {
    game.zoom = clamp(Math.round(z), 1, 3);
  }

  // ----------------------------------------------------------------- passo ---

  function step(dt) {
    const self = game.self;
    if (!self) return;

    let dx = 0;
    let dy = 0;
    if (game.inputEnabled) {
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up')) dy -= 1;
      if (keys.has('down')) dy += 1;
    }

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const stepX = (dx / len) * SPEED * dt;
      const stepY = (dy / len) * SPEED * dt;

      if (W.canStand(self.x + stepX, self.y)) self.x += stepX;
      if (W.canStand(self.x, self.y + stepY)) self.y += stepY;

      if (Math.abs(dx) > Math.abs(dy)) self.dir = dx > 0 ? 'right' : 'left';
      else self.dir = dy > 0 ? 'down' : 'up';

      self.walkPhase += dt * 7;
    } else {
      self.walkPhase = 0;
    }
    self.moving = moving;

    const room = W.roomId(self.x, self.y);
    if (room !== self.room) {
      self.room = room;
      if (typeof game.onRoomChange === 'function') game.onRoomChange(W.roomById(room));
    }

    // interpolacao dos outros
    for (const e of game.players.values()) {
      e.rx += (e.x - e.rx) * Math.min(1, dt * 14);
      e.ry += (e.y - e.ry) * Math.min(1, dt * 14);
      e.walkPhase = e.moving ? e.walkPhase + dt * 7 : 0;
    }

    sendMoveIfNeeded();
  }

  function sendMoveIfNeeded() {
    const now = performance.now();
    if (now - lastNetSend < NET_INTERVAL) return;
    const self = game.self;
    const changed =
      Math.abs(self.x - lastSent.x) > 0.4 ||
      Math.abs(self.y - lastSent.y) > 0.4 ||
      self.dir !== lastSent.dir ||
      self.moving !== lastSent.moving ||
      self.room !== lastSent.room;
    if (!changed) return;
    lastNetSend = now;
    lastSent = { x: self.x, y: self.y, dir: self.dir, moving: self.moving, room: self.room };
    if (VO.net && VO.net.sendMove) {
      VO.net.sendMove({ x: self.x, y: self.y, dir: self.dir, moving: self.moving, room: self.room });
    }
  }

  // ---------------------------------------------------------------- render ---

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = game.canvas;
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    game.dpr = dpr;
    game.ctx.imageSmoothingEnabled = false;
    // zoom automatico: telas maiores mostram os tiles maiores
    game.zoom = window.innerHeight >= 1100 ? 2 : 1;
  }

  function updateCamera() {
    const viewW = window.innerWidth / game.zoom;
    const viewH = window.innerHeight / game.zoom;
    const self = game.self;
    let cx = self.x - viewW / 2;
    let cy = self.y - viewH / 2;
    cx = W.pixelWidth > viewW ? clamp(cx, 0, W.pixelWidth - viewW) : (W.pixelWidth - viewW) / 2;
    cy = W.pixelHeight > viewH ? clamp(cy, 0, W.pixelHeight - viewH) : (W.pixelHeight - viewH) / 2;
    game.camera.x = cx;
    game.camera.y = cy;
    return { viewW, viewH };
  }

  function drawTiles(ctx, viewW, viewH) {
    const cam = game.camera;
    const x1 = Math.max(0, Math.floor(cam.x / TILE));
    const y1 = Math.max(0, Math.floor(cam.y / TILE));
    const x2 = Math.min(W.WIDTH - 1, Math.ceil((cam.x + viewW) / TILE));
    const y2 = Math.min(W.HEIGHT - 1, Math.ceil((cam.y + viewH) / TILE));
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const ch = W.tileAt(tx, ty);
        ctx.drawImage(S.tile(ch, W.floorAt(tx, ty), S.varianteEm(tx, ty)), tx * TILE, ty * TILE);
      }
    }

    // sombra de contato onde o chao encosta em parede ou movel
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        if (W.isSolidTile(tx, ty)) continue;
        let mask = 0;
        if (W.isSolidTile(tx, ty - 1)) mask |= 1;
        if (W.isSolidTile(tx - 1, ty)) mask |= 2;
        if (W.isSolidTile(tx + 1, ty)) mask |= 4;
        if (mask) ctx.drawImage(S.shadow(mask), tx * TILE, ty * TILE);
      }
    }
  }

  /** Cor da sala com transparencia, para pintar o chao das areas privadas. */
  function comAlfa(hex, alfa) {
    const s = String(hex || '#7aa2ff').replace('#', '');
    const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    const r = parseInt(full.slice(0, 2), 16) || 0;
    const g = parseInt(full.slice(2, 4), 16) || 0;
    const b = parseInt(full.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alfa + ')';
  }

  /**
   * Areas privadas: nao tem parede nenhuma, so um piso marcado. Quem esta
   * dentro conversa so com quem tambem esta dentro - o mesmo comportamento
   * de uma sala fechada, sem precisar construir a sala.
   */
  function drawPrivateAreas(ctx) {
    for (const room of W.ROOMS) {
      if (room.kind !== 'privada') continue;
      const x = room.x1 * TILE;
      const y = room.y1 * TILE;
      const w = (room.x2 - room.x1 + 1) * TILE;
      const h = (room.y2 - room.y1 + 1) * TILE;
      const dentro = game.self && game.self.room === room.id;

      ctx.save();
      ctx.fillStyle = comAlfa(room.color, dentro ? 0.22 : 0.08);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = comAlfa(room.color, dentro ? 0.85 : 0.35);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    }
  }

  /**
   * Retangulo com cantos "comidos" - desenha arredondado sem depender de
   * roundRect, que nem todo contexto de canvas tem.
   */
  function pilula(ctx, x, y, w, h, cor) {
    ctx.fillStyle = cor;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x + w - 2, y + 1, 1, 1);
    ctx.fillRect(x + 1, y + h - 2, 1, 1);
    ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  }

  function drawRoomLabels(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px "Segoe UI", sans-serif';
    for (const room of W.ROOMS) {
      const cx = ((room.x1 + room.x2 + 1) / 2) * TILE;
      const cy = room.y1 * TILE + 13;
      const largura = ctx.measureText(room.name).width + 16;
      pilula(ctx, Math.round(cx - largura / 2), cy - 8, Math.round(largura), 16, 'rgba(244, 246, 250, .92)');
      ctx.fillStyle = '#5c6472';
      ctx.fillText(room.name, Math.round(cx), cy);
    }
    ctx.restore();
  }

  function drawProximity(ctx) {
    const self = game.self;
    if (self.room !== 'open') return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(self.x, self.y - 4, NEAR_TILES * TILE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(99, 224, 176, .28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(99, 224, 176, .06)';
    ctx.fill();
    ctx.restore();
  }

  function drawEntity(ctx, e) {
    const x = e.isSelf ? e.x : e.rx;
    const y = e.isSelf ? e.y : e.ry;
    const frame = e.moving ? (Math.floor(e.walkPhase) % 2) : 0;

    // sombra
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, .28)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (e.speaking) {
      ctx.save();
      ctx.strokeStyle = '#63e0b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 12, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sprite = S.avatar(e.look, e.dir, frame);
    const bob = e.moving && frame === 1 ? -1 : 0;
    ctx.drawImage(
      sprite,
      Math.round(x - sprite.width / 2),
      Math.round(y - VO.avatar.FOOT_OFFSET + bob)
    );

    // nome em pilula escura com ponto de status, como no design de referencia
    ctx.save();
    ctx.font = '600 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const larguraTexto = ctx.measureText(e.name).width;
    const larguraPilula = Math.round(larguraTexto + 24);
    const alturaPilula = 16;
    const pilulaX = Math.round(x - larguraPilula / 2);
    const pilulaY = Math.round(y - 48);
    const meio = pilulaY + alturaPilula / 2;

    pilula(ctx, pilulaX, pilulaY, larguraPilula, alturaPilula, 'rgba(32, 33, 38, .92)');

    ctx.beginPath();
    ctx.arc(pilulaX + 9, meio, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = e.mic ? '#3ddc84' : '#ef5f6b';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(e.name, pilulaX + 16, meio + 0.5);

    if (e.status) {
      ctx.font = '9px "Segoe UI", sans-serif';
      const larguraStatus = Math.round(ctx.measureText(e.status).width + 14);
      const statusX = Math.round(x - larguraStatus / 2);
      pilula(ctx, statusX, pilulaY - 15, larguraStatus, 14, 'rgba(32, 33, 38, .72)');
      ctx.fillStyle = '#cad8ff';
      ctx.fillText(e.status, statusX + 7, pilulaY - 8);
    }
    ctx.restore();
  }

  function render() {
    const ctx = game.ctx;
    const dpr = game.dpr;
    const { viewW, viewH } = updateCamera();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1e2240';
    ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);

    const k = game.zoom * dpr;
    ctx.setTransform(k, 0, 0, k, -game.camera.x * k, -game.camera.y * k);
    ctx.imageSmoothingEnabled = false;

    drawTiles(ctx, viewW, viewH);
    drawPrivateAreas(ctx);
    drawRoomLabels(ctx);
    drawProximity(ctx);

    const list = everyone().sort((a, b) => (a.isSelf ? a.y : a.ry) - (b.isSelf ? b.y : b.ry));
    for (const e of list) drawEntity(ctx, e);
  }

  // --------------------------------------------------------------- minimapa ---

  const MINI_COLORS = {
    '#': '#394054', '+': '#c08d5c', '.': '#b5814f', c: '#3d4f7c',
    k: '#dde3ec', g: '#2f6b48', o: '#a04d68', H: '#3f4759',
    D: '#7d5233', T: '#6f4728', P: '#3e8f56', S: '#6d4a86',
    B: '#6b4630', W: '#aeb6c6', '~': '#8fd7f0',
  };

  function drawMinimap(canvas) {
    const ctx = canvas.getContext('2d');
    const scale = Math.min(canvas.width / W.WIDTH, canvas.height / W.HEIGHT);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1e2240';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let ty = 0; ty < W.HEIGHT; ty++) {
      for (let tx = 0; tx < W.WIDTH; tx++) {
        ctx.fillStyle = MINI_COLORS[W.tileAt(tx, ty)] || '#1b2130';
        ctx.fillRect(tx * scale, ty * scale, scale, scale);
      }
    }
    for (const e of everyone()) {
      ctx.fillStyle = e.isSelf ? '#ffffff' : e.look.shirt;
      const px = (e.x / TILE) * scale;
      const py = (e.y / TILE) * scale;
      ctx.fillRect(px - scale * 0.6, py - scale * 0.6, scale * 1.4, scale * 1.4);
    }
  }

  // ------------------------------------------------------------------ loop ---

  let lastTime = 0;
  function loop(now) {
    if (!game.running) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    step(dt);
    render();
    requestAnimationFrame(loop);
  }

  /**
   * Troca a planta do escritorio com todo mundo dentro. Quem ficar em cima de
   * um obstaculo novo e empurrado para o tile livre mais proximo.
   */
  function applyMap(map) {
    W.load(map);
    for (const e of everyone()) {
      if (W.canStand(e.x, e.y)) continue;
      const livre = W.nearestFree(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
      e.x = livre[0] * TILE + TILE / 2;
      e.y = livre[1] * TILE + TILE / 2;
      e.rx = e.x;
      e.ry = e.y;
    }
    if (game.self) {
      game.self.room = W.roomId(game.self.x, game.self.y);
      lastSent = { x: -1, y: -1, dir: '', moving: false, room: '' };
      sendMoveIfNeeded();
      if (typeof game.onRoomChange === 'function') game.onRoomChange(W.roomById(game.self.room));
    }
    notifyPlayers();
  }

  function teleport(tileX, tileY) {
    game.self.x = tileX * TILE + TILE / 2;
    game.self.y = tileY * TILE + TILE / 2;
    game.self.room = W.roomId(game.self.x, game.self.y);
    if (typeof game.onRoomChange === 'function') game.onRoomChange(W.roomById(game.self.room));
    sendMoveIfNeeded();
  }

  function init(canvas, selfPlayer, others) {
    game.canvas = canvas;
    game.ctx = canvas.getContext('2d');
    game.self = makeEntity(selfPlayer, true);
    game.players.clear();
    for (const p of others) game.players.set(p.id, makeEntity(p, false));

    resize();
    window.addEventListener('resize', resize);
    bindInput();

    game.running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
    notifyPlayers();
  }

  VO.game = Object.assign(game, {
    init,
    addPlayer,
    removePlayer,
    applyMove,
    applyState,
    applyMap,
    audioTargets,
    volumeBetween,
    everyone,
    teleport,
    drawMinimap,
    setZoom,
  });
})();
