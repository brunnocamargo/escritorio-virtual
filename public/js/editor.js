/**
 * editor.js - Centro de configuracao: edita a planta do escritorio.
 *
 * Trabalha sobre uma copia do mapa. So ao clicar em "Publicar" ele vai para o
 * servidor, que valida, grava em data/office.json e avisa todo mundo.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});
  const TILES = VO.tiles;

  const $ = (sel) => document.querySelector(sel);
  const TILE = 32;
  const MAX_HISTORY = 60;

  const TOOLS = [
    { id: 'pincel', label: 'Pincel', hint: 'Clique e arraste para pintar a peca escolhida.' },
    { id: 'retangulo', label: 'Retangulo', hint: 'Arraste para preencher uma area retangular.' },
    { id: 'balde', label: 'Balde', hint: 'Clique para trocar toda uma area continua da mesma peca.' },
    { id: 'contagotas', label: 'Conta-gotas', hint: 'Clique para copiar a peca que ja esta no mapa.' },
    { id: 'sala', label: 'Sala', hint: 'Arraste para criar uma sala de audio (use com paredes em volta).' },
    { id: 'privada', label: 'Area privada', hint: 'Arraste para criar uma area privada: sem paredes, quem pisa dentro conversa em particular.' },
    { id: 'entrada', label: 'Entrada', hint: 'Clique para adicionar ou remover um ponto de entrada.' },
  ];

  const ed = {
    open: false,
    grid: [],
    rooms: [],
    spawns: [],
    name: '',
    tool: 'pincel',
    brush: '#',
    zoom: 1,
    dpr: 1,
    cam: { x: 0, y: 0 },
    hover: null,
    drag: null,
    panning: null,
    painting: false,
    selectedRoom: null,
    pickingDoor: false,
    history: [],
    future: [],
    canvas: null,
    ctx: null,
  };

  // ------------------------------------------------------------- historico ---

  function currentJSON() {
    return JSON.stringify({
      rows: ed.grid.map((r) => r.join('')),
      rooms: ed.rooms,
      spawns: ed.spawns,
      name: ed.name,
    });
  }

  function snapshot() {
    ed.history.push(currentJSON());
    if (ed.history.length > MAX_HISTORY) ed.history.shift();
    ed.future.length = 0;
  }

  function restore(json) {
    const data = JSON.parse(json);
    ed.grid = data.rows.map((r) => r.split(''));
    ed.rooms = data.rooms;
    ed.spawns = data.spawns;
    ed.name = data.name;
    $('#edMapName').value = ed.name;
    ed.selectedRoom = null;
    refreshSidebars();
  }

  function undo() {
    if (!ed.history.length) return;
    ed.future.push(currentJSON());
    restore(ed.history.pop());
  }

  function redo() {
    if (!ed.future.length) return;
    ed.history.push(currentJSON());
    restore(ed.future.pop());
  }

  // ----------------------------------------------------------------- mapa ---

  const width = () => (ed.grid[0] ? ed.grid[0].length : 0);
  const height = () => ed.grid.length;
  const inside = (x, y) => x >= 0 && y >= 0 && x < width() && y < height();
  const charAt = (x, y) => (inside(x, y) ? ed.grid[y][x] : '#');

  function setTile(x, y, ch) {
    if (inside(x, y)) ed.grid[y][x] = ch;
  }

  function fillRect(x1, y1, x2, y2, ch) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) setTile(x, y, ch);
    }
  }

  function bucket(x, y, ch) {
    const alvo = charAt(x, y);
    if (alvo === ch) return;
    const fila = [[x, y]];
    const visto = new Set([x + ',' + y]);
    while (fila.length) {
      const ponto = fila.pop();
      setTile(ponto[0], ponto[1], ch);
      const vizinhos = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < vizinhos.length; i++) {
        const nx = ponto[0] + vizinhos[i][0];
        const ny = ponto[1] + vizinhos[i][1];
        const key = nx + ',' + ny;
        if (!inside(nx, ny) || visto.has(key)) continue;
        visto.add(key);
        if (charAt(nx, ny) === alvo) fila.push([nx, ny]);
      }
    }
  }

  function toMap() {
    return {
      version: 1,
      name: ed.name || 'Escritorio',
      rows: ed.grid.map((r) => r.join('')),
      rooms: ed.rooms,
      spawns: ed.spawns,
    };
  }

  function slug(text) {
    const limpo = (text || 'sala')
      .toLowerCase()
      .normalize('NFD')
      .split('')
      .filter((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === ' ' || c === '-')
      .join('')
      .trim()
      .split(' ')
      .filter(Boolean)
      .join('-');
    return limpo.slice(0, 24) || 'sala';
  }

  function idLivre(base) {
    let id = base;
    let n = 2;
    while (id === 'open' || ed.rooms.some((r) => r.id === id)) id = base + '-' + (n++);
    return id;
  }

  function pontoLivreNaSala(sala) {
    for (let y = sala.y1; y <= sala.y2; y++) {
      for (let x = sala.x1; x <= sala.x2; x++) {
        if (!TILES.isSolid(charAt(x, y))) return [x, y];
      }
    }
    return [sala.x1, sala.y1];
  }

  const CORES = ['#7aa2ff', '#7ad3ff', '#ffd07a', '#7ef0a5', '#c79bff', '#ff9bb5', '#f7b955'];

  function criarSala(x1, y1, x2, y2, privada) {
    const rx1 = Math.max(1, Math.min(x1, x2));
    const ry1 = Math.max(1, Math.min(y1, y2));
    const rx2 = Math.min(width() - 2, Math.max(x1, x2));
    const ry2 = Math.min(height() - 2, Math.max(y1, y2));
    if (rx2 - rx1 < 1 || ry2 - ry1 < 1) {
      VO.ui.toast('A sala precisa ter pelo menos 2x2 tiles.');
      return;
    }
    snapshot();
    const nome = privada
      ? 'Area privada ' + (ed.rooms.filter((r) => r.kind === 'privada').length + 1)
      : 'Sala ' + (ed.rooms.filter((r) => r.kind !== 'privada').length + 1);
    const piso = TILES.isFloor(ed.brush) ? ed.brush : (privada ? 'o' : 'c');
    const sala = {
      id: idLivre(slug(nome)),
      name: nome,
      kind: privada ? 'privada' : 'sala',
      x1: rx1, y1: ry1, x2: rx2, y2: ry2,
      floor: piso,
      color: CORES[ed.rooms.length % CORES.length],
      door: [rx1, ry1],
    };
    fillRect(rx1, ry1, rx2, ry2, piso);
    sala.door = pontoLivreNaSala(sala);
    ed.rooms.push(sala);
    ed.selectedRoom = sala.id;
    refreshSidebars();
  }

  function toggleSpawn(x, y) {
    const i = ed.spawns.findIndex((s) => s[0] === x && s[1] === y);
    snapshot();
    if (i >= 0) ed.spawns.splice(i, 1);
    else ed.spawns.push([x, y]);
    refreshSidebars();
  }

  function redimensionar(novaL, novaA) {
    const L = Math.max(16, Math.min(140, novaL | 0));
    const A = Math.max(12, Math.min(100, novaA | 0));
    if (L === width() && A === height()) return;
    snapshot();
    const grid = [];
    for (let y = 0; y < A; y++) {
      const linha = [];
      for (let x = 0; x < L; x++) {
        const borda = x === 0 || y === 0 || x === L - 1 || y === A - 1;
        linha.push(borda ? '#' : (inside(x, y) ? ed.grid[y][x] : '#'));
      }
      grid.push(linha);
    }
    ed.grid = grid;
    ed.rooms = ed.rooms.filter((r) => r.x2 < L - 1 && r.y2 < A - 1);
    ed.spawns = ed.spawns.filter((s) => s[0] < L - 1 && s[1] < A - 1);
    if (!ed.spawns.length) ed.spawns.push([1, 1]);
    enquadrar();
    refreshSidebars();
  }

  // --------------------------------------------------------------- render ---

  function ajustarCanvas() {
    const stage = ed.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ed.canvas.width = Math.floor(stage.clientWidth * dpr);
    ed.canvas.height = Math.floor(stage.clientHeight * dpr);
    ed.dpr = dpr;
  }

  function enquadrar() {
    const stage = ed.canvas.parentElement;
    const zx = stage.clientWidth / (width() * TILE);
    const zy = stage.clientHeight / (height() * TILE);
    ed.zoom = Math.max(0.2, Math.min(zx, zy) * 0.96);
    ed.cam.x = (width() * TILE - stage.clientWidth / ed.zoom) / 2;
    ed.cam.y = (height() * TILE - stage.clientHeight / ed.zoom) / 2;
  }

  function telaParaTile(ev) {
    const rect = ed.canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    return [
      Math.floor((mx / ed.zoom + ed.cam.x) / TILE),
      Math.floor((my / ed.zoom + ed.cam.y) / TILE),
    ];
  }

  /** Piso por baixo, considerando as salas em edicao. */
  function pisoDe(tx, ty) {
    const ch = charAt(tx, ty);
    if (TILES.isFloor(ch)) return ch;
    for (const sala of ed.rooms) {
      if (tx >= sala.x1 && tx <= sala.x2 && ty >= sala.y1 && ty <= sala.y2) return sala.floor || '.';
    }
    return '.';
  }

  function render() {
    if (!ed.open) return;
    const ctx = ed.ctx;
    const k = ed.zoom * ed.dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1e2240';
    ctx.fillRect(0, 0, ed.canvas.width, ed.canvas.height);
    ctx.setTransform(k, 0, 0, k, -ed.cam.x * k, -ed.cam.y * k);
    ctx.imageSmoothingEnabled = false;

    const viewW = ed.canvas.width / k;
    const viewH = ed.canvas.height / k;
    const x1 = Math.max(0, Math.floor(ed.cam.x / TILE));
    const y1 = Math.max(0, Math.floor(ed.cam.y / TILE));
    const x2 = Math.min(width() - 1, Math.ceil((ed.cam.x + viewW) / TILE));
    const y2 = Math.min(height() - 1, Math.ceil((ed.cam.y + viewH) / TILE));

    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        ctx.drawImage(
          VO.sprites.tile(charAt(tx, ty), pisoDe(tx, ty), VO.sprites.varianteEm(tx, ty)),
          tx * TILE, ty * TILE
        );
      }
    }
    for (let ty = y1; ty <= y2; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        if (TILES.isSolid(charAt(tx, ty))) continue;
        let mask = 0;
        if (TILES.isSolid(charAt(tx, ty - 1))) mask |= 1;
        if (TILES.isSolid(charAt(tx - 1, ty))) mask |= 2;
        if (TILES.isSolid(charAt(tx + 1, ty))) mask |= 4;
        if (mask) ctx.drawImage(VO.sprites.shadow(mask), tx * TILE, ty * TILE);
      }
    }

    if (ed.zoom > 0.5) {
      ctx.strokeStyle = 'rgba(255, 255, 255, .06)';
      ctx.lineWidth = 1 / ed.zoom;
      ctx.beginPath();
      for (let tx = x1; tx <= x2 + 1; tx++) {
        ctx.moveTo(tx * TILE, y1 * TILE);
        ctx.lineTo(tx * TILE, (y2 + 1) * TILE);
      }
      for (let ty = y1; ty <= y2 + 1; ty++) {
        ctx.moveTo(x1 * TILE, ty * TILE);
        ctx.lineTo((x2 + 1) * TILE, ty * TILE);
      }
      ctx.stroke();
    }

    for (const sala of ed.rooms) {
      const selecionada = sala.id === ed.selectedRoom;
      if (sala.kind === 'privada') {
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.fillRect(
          sala.x1 * TILE, sala.y1 * TILE,
          (sala.x2 - sala.x1 + 1) * TILE, (sala.y2 - sala.y1 + 1) * TILE
        );
        ctx.restore();
      }
      const w = (sala.x2 - sala.x1 + 1) * TILE;
      const h = (sala.y2 - sala.y1 + 1) * TILE;
      ctx.strokeStyle = sala.color || '#7aa2ff';
      ctx.lineWidth = (selecionada ? 3 : 1.5) / ed.zoom;
      ctx.strokeRect(sala.x1 * TILE, sala.y1 * TILE, w, h);
      if (selecionada) {
        ctx.fillStyle = 'rgba(255, 255, 255, .10)';
        ctx.fillRect(sala.x1 * TILE, sala.y1 * TILE, w, h);
      }
      ctx.fillStyle = sala.color || '#7aa2ff';
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.fillText(sala.name, sala.x1 * TILE + 3, sala.y1 * TILE + 12);
      ctx.fillStyle = 'rgba(255, 255, 255, .85)';
      ctx.fillRect(sala.door[0] * TILE + 10, sala.door[1] * TILE + 10, 12, 12);
      ctx.fillStyle = sala.color || '#7aa2ff';
      ctx.fillRect(sala.door[0] * TILE + 13, sala.door[1] * TILE + 13, 6, 6);
    }

    for (const spawn of ed.spawns) {
      ctx.fillStyle = 'rgba(99, 224, 176, .35)';
      ctx.fillRect(spawn[0] * TILE, spawn[1] * TILE, TILE, TILE);
      ctx.strokeStyle = '#63e0b0';
      ctx.lineWidth = 2 / ed.zoom;
      ctx.strokeRect(spawn[0] * TILE + 2, spawn[1] * TILE + 2, TILE - 4, TILE - 4);
    }

    if (ed.drag) {
      const dx1 = Math.min(ed.drag.x1, ed.drag.x2);
      const dy1 = Math.min(ed.drag.y1, ed.drag.y2);
      const dw = Math.abs(ed.drag.x2 - ed.drag.x1) + 1;
      const dh = Math.abs(ed.drag.y2 - ed.drag.y1) + 1;
      ctx.fillStyle = 'rgba(79, 142, 247, .28)';
      ctx.fillRect(dx1 * TILE, dy1 * TILE, dw * TILE, dh * TILE);
      ctx.strokeStyle = '#4f8ef7';
      ctx.lineWidth = 2 / ed.zoom;
      ctx.strokeRect(dx1 * TILE, dy1 * TILE, dw * TILE, dh * TILE);
    }

    if (ed.hover && inside(ed.hover[0], ed.hover[1])) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / ed.zoom;
      ctx.strokeRect(ed.hover[0] * TILE + 1, ed.hover[1] * TILE + 1, TILE - 2, TILE - 2);
    }

    requestAnimationFrame(render);
  }

  // ------------------------------------------------------------- interacao ---

  function aplicarClique(tx, ty) {
    if (!inside(tx, ty)) return;

    if (ed.pickingDoor) {
      const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
      if (sala && tx >= sala.x1 && tx <= sala.x2 && ty >= sala.y1 && ty <= sala.y2) {
        snapshot();
        sala.door = [tx, ty];
        ed.pickingDoor = false;
        VO.ui.toast('Ponto de chegada de ' + sala.name + ' atualizado.');
        refreshSidebars();
      } else {
        VO.ui.toast('Clique dentro da sala selecionada.');
      }
      return;
    }

    if (ed.tool === 'pincel') setTile(tx, ty, ed.brush);
    else if (ed.tool === 'balde') { snapshot(); bucket(tx, ty, ed.brush); validar(); }
    else if (ed.tool === 'contagotas') escolherPeca(charAt(tx, ty));
    else if (ed.tool === 'entrada') toggleSpawn(tx, ty);
  }

  function atualizarDica(tx, ty) {
    const ferramenta = TOOLS.find((t) => t.id === ed.tool);
    const sob = inside(tx, ty) ? TILES.name(charAt(tx, ty)) : '-';
    $('#edHint').textContent = ferramenta.hint +
      '   |   peca: ' + TILES.name(ed.brush) +
      '   |   sob o cursor: ' + sob + ' (' + tx + ',' + ty + ')' +
      '   |   botao direito arrasta, roda do mouse da zoom';
  }

  function bindCanvas() {
    const c = ed.canvas;

    c.addEventListener('contextmenu', (ev) => ev.preventDefault());

    c.addEventListener('mousedown', (ev) => {
      const alvo = telaParaTile(ev);
      if (ev.button === 2 || ev.button === 1) {
        ed.panning = { x: ev.clientX, y: ev.clientY, camX: ed.cam.x, camY: ed.cam.y };
        return;
      }
      if (ed.tool === 'retangulo' || ed.tool === 'sala' || ed.tool === 'privada') {
        ed.drag = { x1: alvo[0], y1: alvo[1], x2: alvo[0], y2: alvo[1] };
        return;
      }
      if (ed.tool === 'pincel') snapshot();
      ed.painting = true;
      aplicarClique(alvo[0], alvo[1]);
    });

    window.addEventListener('mousemove', (ev) => {
      if (!ed.open) return;
      const alvo = telaParaTile(ev);
      ed.hover = alvo;
      atualizarDica(alvo[0], alvo[1]);

      if (ed.panning) {
        ed.cam.x = ed.panning.camX - (ev.clientX - ed.panning.x) / ed.zoom;
        ed.cam.y = ed.panning.camY - (ev.clientY - ed.panning.y) / ed.zoom;
        return;
      }
      if (ed.drag) {
        ed.drag.x2 = alvo[0];
        ed.drag.y2 = alvo[1];
        return;
      }
      if (ed.painting && ed.tool === 'pincel') setTile(alvo[0], alvo[1], ed.brush);
    });

    window.addEventListener('mouseup', () => {
      if (!ed.open) return;
      ed.panning = null;
      if (ed.painting) {
        ed.painting = false;
        validar();
      }
      if (ed.drag) {
        const area = ed.drag;
        ed.drag = null;
        if (ed.tool === 'sala' || ed.tool === 'privada') {
          criarSala(area.x1, area.y1, area.x2, area.y2, ed.tool === 'privada');
        } else {
          snapshot();
          fillRect(area.x1, area.y1, area.x2, area.y2, ed.brush);
          validar();
        }
      }
    });

    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const antes = telaParaTile(ev);
      const fator = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      ed.zoom = Math.max(0.2, Math.min(4, ed.zoom * fator));
      const depois = telaParaTile(ev);
      ed.cam.x += (antes[0] - depois[0]) * TILE;
      ed.cam.y += (antes[1] - depois[1]) * TILE;
    }, { passive: false });
  }

  // --------------------------------------------------------------- paineis ---

  function escolherPeca(ch) {
    if (!TILES.isKnown(ch)) return;
    ed.brush = ch;
    document.querySelectorAll('.ed-piece').forEach((b) => {
      b.classList.toggle('active', b.dataset.ch === ch);
    });
  }

  function montarFerramentas() {
    const box = $('#edTools');
    box.textContent = '';
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'ed-tool' + (t.id === ed.tool ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => {
        ed.tool = t.id;
        ed.pickingDoor = false;
        document.querySelectorAll('.ed-tool').forEach((o) => o.classList.remove('active'));
        b.classList.add('active');
      });
      box.appendChild(b);
    }
  }

  function montarPaleta() {
    const box = $('#edPalette');
    box.textContent = '';
    for (const grupo of TILES.GROUPS) {
      const wrap = document.createElement('div');
      wrap.className = 'ed-palette-group';
      const titulo = document.createElement('span');
      titulo.textContent = TILES.GROUP_LABEL[grupo];
      const linha = document.createElement('div');
      linha.className = 'ed-swatches';
      for (const tile of TILES.byGroup(grupo)) {
        const b = document.createElement('button');
        b.className = 'ed-piece' + (tile.ch === ed.brush ? ' active' : '');
        b.dataset.ch = tile.ch;
        b.title = tile.name;
        const mini = document.createElement('canvas');
        mini.width = 32;
        mini.height = 32;
        const mctx = mini.getContext('2d');
        mctx.imageSmoothingEnabled = false;
        mctx.drawImage(VO.sprites.tile(tile.ch, '.'), 0, 0);
        b.appendChild(mini);
        b.addEventListener('click', () => escolherPeca(tile.ch));
        linha.appendChild(b);
      }
      wrap.append(titulo, linha);
      box.appendChild(wrap);
    }
  }

  function montarFormularioSala() {
    const form = $('#edRoomForm');
    const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
    form.hidden = !sala;
    if (!sala) return;
    $('#edRoomName').value = sala.name;
    $('#edRoomColor').value = sala.color || '#7aa2ff';
    $('#edRoomKind').value = sala.kind === 'privada' ? 'privada' : 'sala';
    const sel = $('#edRoomFloor');
    sel.textContent = '';
    for (const ch of TILES.FLOORS) {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = TILES.name(ch);
      opt.selected = ch === sala.floor;
      sel.appendChild(opt);
    }
  }

  function montarSalas() {
    const lista = $('#edRooms');
    lista.textContent = '';
    $('#edRoomCount').textContent = '(' + ed.rooms.length + ')';
    for (const sala of ed.rooms) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = sala.id === ed.selectedRoom ? 'active' : '';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = sala.color;
      const nome = document.createElement('span');
      nome.textContent = sala.kind === 'privada' ? sala.name + ' *' : sala.name;
      if (sala.kind === 'privada') nome.title = 'Area privada (sem paredes)';
      const tam = document.createElement('span');
      tam.className = 'size';
      tam.textContent = (sala.x2 - sala.x1 + 1) + 'x' + (sala.y2 - sala.y1 + 1);
      b.append(dot, nome, tam);
      b.addEventListener('click', () => {
        ed.selectedRoom = ed.selectedRoom === sala.id ? null : sala.id;
        ed.pickingDoor = false;
        montarSalas();
      });
      li.appendChild(b);
      lista.appendChild(li);
    }
    montarFormularioSala();
  }

  let validarTimer = null;
  function validar() {
    clearTimeout(validarTimer);
    validarTimer = setTimeout(() => {
      const resultado = VO.mapcheck.validate(toMap());
      const lista = $('#edProblems');
      lista.textContent = '';
      const add = (texto, classe) => {
        const li = document.createElement('li');
        li.className = classe;
        li.textContent = texto;
        lista.appendChild(li);
      };
      resultado.errors.forEach((e) => add(e, 'bad'));
      resultado.warnings.forEach((w) => add(w, 'warn'));
      if (resultado.ok && !resultado.warnings.length) add('Tudo certo para publicar.', 'good');

      const status = $('#edStatus');
      status.className = 'ed-status ' + (resultado.ok ? 'good' : 'bad');
      status.textContent = resultado.ok
        ? width() + 'x' + height() + ' tiles, ' + ed.rooms.length + ' salas - pronto para publicar'
        : resultado.errors.length + ' problema(s) impedem publicar';
      $('#edSave').disabled = !resultado.ok;
    }, 120);
  }

  function refreshSidebars() {
    $('#edW').value = width();
    $('#edH').value = height();
    $('#edSpawnCount').textContent = '(' + ed.spawns.length + ')';
    $('#edUndo').disabled = !ed.history.length;
    $('#edRedo').disabled = !ed.future.length;
    montarSalas();
    validar();
  }

  // ---------------------------------------------------------- abrir/fechar ---

  let jaLigado = false;

  function abrir() {
    if (ed.open) return;
    const base = VO.world.raw;
    ed.grid = base.rows.map((r) => r.split(''));
    ed.rooms = JSON.parse(JSON.stringify(base.rooms || []));
    ed.spawns = JSON.parse(JSON.stringify(base.spawns || []));
    ed.name = base.name || 'Escritorio';
    ed.history.length = 0;
    ed.future.length = 0;
    ed.selectedRoom = null;
    ed.pickingDoor = false;

    $('#edMapName').value = ed.name;
    $('#editor').hidden = false;
    ed.open = true;
    VO.game.inputEnabled = false;

    ed.canvas = $('#edCanvas');
    ed.ctx = ed.canvas.getContext('2d');
    if (!jaLigado) {
      bindCanvas();
      jaLigado = true;
    }
    ajustarCanvas();
    enquadrar();
    montarFerramentas();
    montarPaleta();
    refreshSidebars();
    atualizarDica(0, 0);
    requestAnimationFrame(render);
  }

  function fechar() {
    if (!ed.open) return;
    ed.open = false;
    $('#editor').hidden = true;
    VO.game.inputEnabled = true;
  }

  /** Cabecalhos com a sessao, para o servidor saber quem esta publicando. */
  function cabecalhos() {
    const h = { 'Content-Type': 'application/json' };
    if (VO.auth && VO.auth.token) h.Authorization = 'Bearer ' + VO.auth.token;
    return h;
  }

  async function publicar() {
    const mapa = toMap();
    const resultado = VO.mapcheck.validate(mapa);
    if (!resultado.ok) {
      VO.ui.toast('Corrija os problemas antes de publicar.', 4000);
      return;
    }
    $('#edSave').disabled = true;
    $('#edStatus').textContent = 'Publicando...';
    try {
      const res = await fetch('/api/map', {
        method: 'PUT',
        headers: cabecalhos(),
        body: JSON.stringify({ map: mapa, author: VO.game.self ? VO.game.self.name : 'alguem' }),
      });
      const corpo = await res.json();
      if (!res.ok) {
        $('#edStatus').className = 'ed-status bad';
        $('#edStatus').textContent = (corpo.errors || [corpo.error]).join(' | ');
        $('#edSave').disabled = false;
        return;
      }
      VO.ui.toast('Planta publicada para todo mundo.');
      fechar();
    } catch (err) {
      $('#edStatus').textContent = 'Falhou: ' + err.message;
      $('#edSave').disabled = false;
    }
  }

  async function restaurarPadrao() {
    if (!window.confirm('Isto descarta a planta atual e volta para o escritorio padrao. Confirma?')) return;
    try {
      const res = await fetch('/api/map/reset', { method: 'POST', headers: cabecalhos() });
      if (!res.ok) throw new Error('o servidor recusou');
      VO.ui.toast('Planta padrao restaurada.');
      fechar();
    } catch (err) {
      VO.ui.toast('Nao consegui restaurar: ' + err.message, 4000);
    }
  }

  function bindUI() {
    $('#edClose').addEventListener('click', fechar);
    $('#edSave').addEventListener('click', publicar);
    $('#edReset').addEventListener('click', restaurarPadrao);
    $('#edUndo').addEventListener('click', undo);
    $('#edRedo').addEventListener('click', redo);
    $('#edApplySize').addEventListener('click', () => {
      redimensionar(Number($('#edW').value), Number($('#edH').value));
    });
    $('#edMapName').addEventListener('change', (ev) => {
      snapshot();
      ed.name = ev.target.value.trim() || 'Escritorio';
    });
    $('#edRoomName').addEventListener('change', (ev) => {
      const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
      if (!sala) return;
      snapshot();
      sala.name = ev.target.value.trim() || sala.name;
      montarSalas();
    });
    $('#edRoomFloor').addEventListener('change', (ev) => {
      const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
      if (!sala) return;
      snapshot();
      const antigo = sala.floor;
      sala.floor = ev.target.value;
      for (let y = sala.y1; y <= sala.y2; y++) {
        for (let x = sala.x1; x <= sala.x2; x++) {
          if (charAt(x, y) === antigo) setTile(x, y, sala.floor);
        }
      }
      validar();
    });
    $('#edRoomKind').addEventListener('change', (ev) => {
      const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
      if (!sala) return;
      snapshot();
      sala.kind = ev.target.value;
      montarSalas();
    });
    $('#edRoomColor').addEventListener('change', (ev) => {
      const sala = ed.rooms.find((r) => r.id === ed.selectedRoom);
      if (!sala) return;
      sala.color = ev.target.value;
      montarSalas();
    });
    $('#edRoomDoor').addEventListener('click', () => {
      ed.pickingDoor = true;
      VO.ui.toast('Clique dentro da sala para definir onde as pessoas chegam.');
    });
    $('#edRoomDelete').addEventListener('click', () => {
      const i = ed.rooms.findIndex((r) => r.id === ed.selectedRoom);
      if (i < 0) return;
      snapshot();
      ed.rooms.splice(i, 1);
      ed.selectedRoom = null;
      refreshSidebars();
    });

    window.addEventListener('resize', () => {
      if (ed.open) ajustarCanvas();
    });

    window.addEventListener('keydown', (ev) => {
      if (!ed.open) return;
      const ativo = document.activeElement;
      const digitando = ativo && ['INPUT', 'SELECT', 'TEXTAREA'].includes(ativo.tagName);
      if (ev.key === 'Escape') {
        fechar();
        return;
      }
      if (digitando) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      const atalhos = {
        KeyB: 'pincel', KeyR: 'retangulo', KeyG: 'balde',
        KeyI: 'contagotas', KeyO: 'sala', KeyN: 'entrada',
      };
      if (atalhos[ev.code]) {
        ed.tool = atalhos[ev.code];
        montarFerramentas();
      }
    });
  }

  VO.editor = {
    abrir,
    fechar,
    bindUI,
    get aberto() { return ed.open; },
  };
})();
