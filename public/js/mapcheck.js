/**
 * mapcheck.js - validacao do mapa, usada pelo servidor (antes de salvar),
 * pelo editor (antes de publicar) e pelos scripts. Navegador e Node.
 *
 * Um mapa e:
 *   { name, rows: ["####", ...], rooms: [...], spawns: [[x,y], ...] }
 */
(function (root, factory) {
  const dep = (typeof module === 'object' && module.exports)
    ? require('./tiles.js')
    : (root.VO && root.VO.tiles);
  const api = factory(dep);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.VO = root.VO || {}).mapcheck = api;
})(typeof self !== 'undefined' ? self : this, function (TILES) {
  'use strict';

  const LIMITS = { minW: 16, maxW: 140, minH: 12, maxH: 100, maxRooms: 40, maxSpawns: 40 };

  function validate(map) {
    const errors = [];
    const warnings = [];
    const add = (list, msg) => list.push(msg);

    if (!map || typeof map !== 'object') {
      return { ok: false, errors: ['Mapa vazio ou invalido.'], warnings: [] };
    }

    // ------------------------------------------------------------- linhas ---
    const rows = map.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, errors: ['O mapa precisa de pelo menos uma linha.'], warnings: [] };
    }
    const height = rows.length;
    const width = rows[0].length;

    if (width < LIMITS.minW || width > LIMITS.maxW) {
      add(errors, 'Largura ' + width + ' fora do limite (' + LIMITS.minW + ' a ' + LIMITS.maxW + ').');
    }
    if (height < LIMITS.minH || height > LIMITS.maxH) {
      add(errors, 'Altura ' + height + ' fora do limite (' + LIMITS.minH + ' a ' + LIMITS.maxH + ').');
    }
    rows.forEach((row, y) => {
      if (typeof row !== 'string') add(errors, 'Linha ' + y + ' nao e texto.');
      else if (row.length !== width) {
        add(errors, 'Linha ' + y + ' tem ' + row.length + ' tiles, esperado ' + width + '.');
      }
    });
    if (errors.length) return { ok: false, errors, warnings };

    // ----------------------------------------------------------- caracteres ---
    const desconhecidos = new Set();
    for (const row of rows) {
      for (const ch of row) if (!TILES.isKnown(ch)) desconhecidos.add(ch);
    }
    if (desconhecidos.size) {
      add(errors, 'Pecas desconhecidas no mapa: ' + [...desconhecidos].join(' '));
    }

    const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? '#' : rows[y][x]);
    const solid = (x, y) => TILES.isSolid(at(x, y));

    // ---------------------------------------------------------------- bordas ---
    let buracos = 0;
    for (let x = 0; x < width; x++) {
      if (!solid(x, 0)) buracos++;
      if (!solid(x, height - 1)) buracos++;
    }
    for (let y = 0; y < height; y++) {
      if (!solid(0, y)) buracos++;
      if (!solid(width - 1, y)) buracos++;
    }
    if (buracos) add(errors, 'A borda do mapa tem ' + buracos + ' tile(s) sem parede - daria para sair do escritorio.');

    // ---------------------------------------------------------------- spawns ---
    const spawns = Array.isArray(map.spawns) ? map.spawns : [];
    if (!spawns.length) add(errors, 'Defina pelo menos um ponto de entrada.');
    if (spawns.length > LIMITS.maxSpawns) add(errors, 'Maximo de ' + LIMITS.maxSpawns + ' pontos de entrada.');
    spawns.forEach((s, i) => {
      if (!Array.isArray(s) || s.length !== 2) return add(errors, 'Ponto de entrada ' + i + ' malformado.');
      if (solid(s[0], s[1])) add(errors, 'Ponto de entrada ' + (i + 1) + ' (' + s[0] + ',' + s[1] + ') esta em cima de um obstaculo.');
    });

    // ----------------------------------------------------------------- salas ---
    const rooms = Array.isArray(map.rooms) ? map.rooms : [];
    if (rooms.length > LIMITS.maxRooms) add(errors, 'Maximo de ' + LIMITS.maxRooms + ' salas.');
    const ids = new Set();
    for (const room of rooms) {
      const label = room && room.name ? room.name : (room && room.id) || 'sala sem nome';
      if (!room || !room.id) { add(errors, 'Sala sem identificador.'); continue; }
      if (room.id === 'open') add(errors, 'O identificador "open" e reservado para a area comum.');
      if (ids.has(room.id)) add(errors, 'Duas salas com o mesmo identificador: ' + room.id);
      ids.add(room.id);

      const { x1, y1, x2, y2 } = room;
      if ([x1, y1, x2, y2].some((n) => typeof n !== 'number')) {
        add(errors, label + ': retangulo invalido.');
        continue;
      }
      if (x1 > x2 || y1 > y2) { add(errors, label + ': retangulo invertido.'); continue; }
      if (x1 < 1 || y1 < 1 || x2 >= width - 1 || y2 >= height - 1) {
        add(errors, label + ': encosta na borda do mapa.');
      }
      if (room.kind && room.kind !== 'sala' && room.kind !== 'privada') {
        add(errors, label + ': tipo desconhecido "' + room.kind + '".');
      }
      if (room.floor && !TILES.isFloor(room.floor)) {
        add(errors, label + ': "' + room.floor + '" nao e um piso valido.');
      }
      if (!Array.isArray(room.door) || room.door.length !== 2) {
        add(errors, label + ': falta o ponto de chegada (door).');
      } else {
        const [dx, dy] = room.door;
        if (dx < x1 || dx > x2 || dy < y1 || dy > y2) {
          add(errors, label + ': o ponto de chegada esta fora da sala.');
        } else if (solid(dx, dy)) {
          add(errors, label + ': o ponto de chegada esta em cima de um obstaculo.');
        }
      }
    }
    if (errors.length) return { ok: false, errors, warnings };

    // ------------------------------------------------- tudo se alcanca a pe? ---
    const [sx, sy] = spawns[0];
    const visto = new Set([sx + ',' + sy]);
    const fila = [[sx, sy]];
    while (fila.length) {
      const [x, y] = fila.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = nx + ',' + ny;
        if (visto.has(key) || solid(nx, ny)) continue;
        visto.add(key);
        fila.push([nx, ny]);
      }
    }
    for (const room of rooms) {
      if (!visto.has(room.door[0] + ',' + room.door[1])) {
        add(errors, (room.name || room.id) + ' esta isolada: nao da para chegar la andando.');
      }
    }
    spawns.forEach((s, i) => {
      if (i > 0 && !visto.has(s[0] + ',' + s[1])) {
        add(warnings, 'O ponto de entrada ' + (i + 1) + ' fica numa area separada do primeiro.');
      }
    });

    // ------------------------------------------------------------- avisos ---
    let livres = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) if (!solid(x, y)) livres++;
    }
    if (livres < 40) add(warnings, 'Sobrou pouquissimo espaco para andar.');
    if (!rooms.length) add(warnings, 'Nenhuma sala definida: todo o mapa vai usar audio por proximidade.');

    return { ok: errors.length === 0, errors, warnings };
  }

  return { validate, LIMITS };
});
