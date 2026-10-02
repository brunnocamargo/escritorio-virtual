/**
 * world.js - o escritorio em memoria.
 *
 * O mapa nao mora mais aqui: vem do servidor (GET /api/map) e pode ser trocado
 * a quente pelo editor. Este modulo so guarda a grade atual e responde as
 * perguntas do jogo: o que tem neste tile, da para andar, de que sala e isto.
 *
 * Formato do mapa:
 *   { name, rows: ["####", ...], rooms: [{id,name,x1,y1,x2,y2,floor,color,door}], spawns: [[x,y]] }
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});
  const TILES = VO.tiles;

  const TILE = 32;

  const world = {
    TILE,
    name: '',
    WIDTH: 0,
    HEIGHT: 0,
    GRID: [],
    ROOMS: [],
    SPAWNS: [],
    OPEN_SPACE: { id: 'open', name: 'Open Space', color: '#9aa4bf', door: [1, 1] },
    pixelWidth: 0,
    pixelHeight: 0,
    raw: null,
  };

  /** Troca o mapa atual. */
  function load(map) {
    world.raw = map;
    world.name = map.name || 'Escritorio';
    world.GRID = map.rows.map((row) => row.split(''));
    world.HEIGHT = world.GRID.length;
    world.WIDTH = world.GRID[0].length;
    world.pixelWidth = world.WIDTH * TILE;
    world.pixelHeight = world.HEIGHT * TILE;
    world.ROOMS = (map.rooms || []).map((room) => Object.assign({}, room));
    world.SPAWNS = (map.spawns || []).map((s) => s.slice());
    world.OPEN_SPACE = {
      id: 'open',
      name: 'Open Space',
      color: '#9aa4bf',
      door: world.SPAWNS[0] || [1, 1],
    };
    return world;
  }

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= world.WIDTH || ty >= world.HEIGHT) return '#';
    return world.GRID[ty][tx];
  }

  function isSolidTile(tx, ty) {
    return TILES.isSolid(tileAt(tx, ty));
  }

  /** Sala (retangulo) que contem o tile, ou null. */
  function roomAtTile(tx, ty) {
    for (const room of world.ROOMS) {
      if (tx >= room.x1 && tx <= room.x2 && ty >= room.y1 && ty <= room.y2) return room;
    }
    return null;
  }

  function roomAt(x, y) {
    return roomAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  function roomId(x, y) {
    const room = roomAt(x, y);
    return room ? room.id : world.OPEN_SPACE.id;
  }

  function roomById(id) {
    if (id === world.OPEN_SPACE.id) return world.OPEN_SPACE;
    return world.ROOMS.find((r) => r.id === id) || world.OPEN_SPACE;
  }

  /** Piso "por baixo" de qualquer tile - usado para pintar moveis sobre o chao. */
  function floorAt(tx, ty) {
    const ch = tileAt(tx, ty);
    if (TILES.isFloor(ch)) return ch;
    const room = roomAtTile(tx, ty);
    return (room && room.floor) || '.';
  }

  /**
   * Colisao com caixa nos pes do avatar (16x12 px centrada em x, base em y).
   * Retorna true se a posicao for livre.
   */
  const HALF_W = 8;
  const FOOT_TOP = 10;
  const FOOT_BOTTOM = 2;

  function canStand(x, y) {
    const tx1 = Math.floor((x - HALF_W) / TILE);
    const tx2 = Math.floor((x + HALF_W - 1) / TILE);
    const ty1 = Math.floor((y - FOOT_TOP) / TILE);
    const ty2 = Math.floor((y + FOOT_BOTTOM) / TILE);
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        if (isSolidTile(tx, ty)) return false;
      }
    }
    return true;
  }

  /** Ponto de entrada aleatorio, em pixels. */
  function randomSpawn() {
    const list = world.SPAWNS.length ? world.SPAWNS : [[1, 1]];
    const spot = list[Math.floor(Math.random() * list.length)];
    return { x: spot[0] * TILE + TILE / 2, y: spot[1] * TILE + TILE / 2 };
  }

  /** Tile livre mais proximo - usado quando o chao some sob os pes de alguem. */
  function nearestFree(tx, ty) {
    for (let raio = 0; raio < 30; raio++) {
      for (let dy = -raio; dy <= raio; dy++) {
        for (let dx = -raio; dx <= raio; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== raio) continue;
          if (!isSolidTile(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
    }
    return world.SPAWNS[0] || [1, 1];
  }

  Object.assign(world, {
    load,
    tileAt,
    isSolidTile,
    roomAt,
    roomAtTile,
    roomId,
    roomById,
    floorAt,
    canStand,
    randomSpawn,
    nearestFree,
  });

  VO.world = world;
})();
