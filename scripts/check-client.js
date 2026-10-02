/**
 * Executa a arte e o loop do jogo fora do navegador, com um canvas simulado.
 * Serve para pegar erro de runtime (sprite quebrado, tile sem pintor, render
 * estourando) sem precisar abrir o Chrome.
 *
 *   node scripts/check-client.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const problems = [];
const ok = (label) => console.log('  ok   ' + label);
const fail = (label, err) => {
  problems.push(label);
  console.log('  FALHOU ' + label + (err ? ': ' + (err.stack || err.message || err) : ''));
};

// --------------------------------------------------------------- DOM falso ---

function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return () => ({ width: 24 });
      if (prop === 'canvas') return { width: 1280, height: 720 };
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function makeCanvas(width, height) {
  return { width, height, getContext: () => makeCtx(), style: {} };
}

const rafQueue = [];
const sandbox = {
  console,
  window: {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: () => {},
  },
  document: {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas(32, 32) : { style: {} }),
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => rafQueue.push(cb),
  setInterval: () => 0,
  clearTimeout: () => {},
  setTimeout: () => 0,
};
sandbox.window.document = sandbox.document;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
// tiles.js e mapcheck.js se penduram em `self`; no navegador self === window
sandbox.self = sandbox.window;
vm.createContext(sandbox);

for (const file of ['tiles.js', 'mapcheck.js', 'world.js', 'avatar.js', 'sprites.js', 'game.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', file), 'utf8');
  try {
    vm.runInContext(src, sandbox, { filename: file });
    ok('carregou ' + file);
  } catch (err) {
    fail('carregou ' + file, err);
  }
}

const VO = sandbox.window.VO;

// carrega a planta padrao, como o cliente faz via /api/map
const mapaPadrao = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'office.default.json'), 'utf8'));
try {
  VO.world.load(mapaPadrao);
  ok('planta padrao carregada: ' + VO.world.WIDTH + 'x' + VO.world.HEIGHT + ', ' + VO.world.ROOMS.length + ' salas');
} catch (err) {
  fail('carregar a planta padrao', err);
}
const W = VO.world;

// ------------------------------------------------------------------ sprites ---

try {
  const chars = new Set();
  for (let y = 0; y < W.HEIGHT; y++) {
    for (let x = 0; x < W.WIDTH; x++) chars.add(W.tileAt(x, y));
  }
  for (const ch of chars) {
    for (let ty = 0; ty < W.HEIGHT; ty++) {
      for (let tx = 0; tx < W.WIDTH; tx++) {
        if (W.tileAt(tx, ty) === ch) {
          VO.sprites.tile(ch, W.floorAt(tx, ty));
          break;
        }
      }
    }
  }
  ok('todos os ' + chars.size + ' tipos de tile do mapa foram pintados');
} catch (err) {
  fail('pintura dos tiles', err);
}

try {
  const antigo = { skin: '#f2c49b', hair: '#3b2b23', shirt: '#4f8ef7', pants: '#2f3a55' };
  for (const dir of ['up', 'down', 'left', 'right']) {
    for (const frame of [0, 1]) VO.sprites.avatar(antigo, dir, frame);
  }
  ok('look antigo (so cores) continua funcionando');
} catch (err) {
  fail('compatibilidade com o look antigo', err);
}

// cada peca do criador precisa desenhar nas 4 direcoes sem estourar
try {
  const O = VO.avatar.OPTIONS;
  let combinacoes = 0;
  for (const campo of Object.keys(O)) {
    for (const opcao of O[campo]) {
      const look = VO.avatar.normalize({ [campo]: opcao.id });
      for (const dir of ['up', 'down', 'left', 'right']) {
        for (const frame of [0, 1]) {
          VO.avatar.sprite(look, dir, frame);
          combinacoes++;
        }
      }
    }
  }
  ok('todas as ' + Object.values(O).reduce((n, l) => n + l.length, 0) +
    ' pecas do personagem desenharam (' + combinacoes + ' combinacoes)');
} catch (err) {
  fail('pecas do personagem', err);
}

try {
  const desconhecido = VO.avatar.normalize({ body: 'inexistente', hairstyle: 'zzz', outfit: null });
  const ok1 = desconhecido.body === 'neutro' && desconhecido.hairstyle === 'curto';
  (ok1 ? ok : fail)('opcoes invalidas caem no padrao em vez de quebrar');
} catch (err) {
  fail('normalizacao do look', err);
}

try {
  for (let i = 0; i < 30; i++) VO.avatar.sprite(VO.avatar.random(), 'down', 0);
  ok('30 personagens aleatorios gerados');
} catch (err) {
  fail('personagem aleatorio', err);
}

// -------------------------------------------------------------------- jogo ---

const look = { skin: '#f2c49b', hair: '#3b2b23', shirt: '#4f8ef7', pants: '#2f3a55' };
const inicio = VO.world.SPAWNS[0];
const self = { id: 'aaa', name: 'Ana', look, x: inicio[0] * 32 + 16, y: inicio[1] * 32 + 16, dir: 'down', room: 'open' };
const other = { id: 'zzz', name: 'Bruno', look, x: self.x + 32, y: self.y, dir: 'down', room: 'open' };

try {
  VO.game.init(makeCanvas(1280, 720), self, [other]);
  for (let i = 0; i < 5; i++) {
    const cb = rafQueue.shift();
    if (cb) cb(performance.now() + i * 16);
  }
  ok('loop do jogo rodou ' + 5 + ' quadros sem erro');
} catch (err) {
  fail('loop do jogo', err);
}

try {
  VO.game.drawMinimap(makeCanvas(240, 150));
  ok('minimapa desenhado');
} catch (err) {
  fail('minimapa', err);
}

// --------------------------------------------------- regras de audio/proximidade ---

function volumeAt(dxTiles, roomA, roomB) {
  return VO.game.volumeBetween(
    { x: 0, y: 0, room: roomA },
    { x: dxTiles * 32, y: 0, room: roomB }
  );
}

const cases = [
  ['lado a lado no open space ouve em volume cheio', volumeAt(1, 'open', 'open') === 1],
  ['a 5 tiles ouve baixinho', volumeAt(5, 'open', 'open') > 0 && volumeAt(5, 'open', 'open') < 1],
  ['a 10 tiles nao ouve', volumeAt(10, 'open', 'open') === 0],
  ['mesma sala ouve mesmo longe', volumeAt(30, 'copa', 'copa') === 1],
  ['salas diferentes nao se ouvem', volumeAt(1, 'copa', 'lounge') === 0],
  ['quem esta na sala nao ouve o corredor', volumeAt(1, 'copa', 'open') === 0],
];
for (const [label, passed] of cases) (passed ? ok : fail)(label);

try {
  const targets = VO.game.audioTargets();
  (targets.length === 1 && targets[0].id === 'zzz' && targets[0].volume === 1
    ? ok
    : fail)('audioTargets liga a chamada com quem esta ao lado');
} catch (err) {
  fail('audioTargets', err);
}

// colisao
(!W.canStand(0 * 32 + 16, 0 * 32 + 16) ? ok : fail)('parede bloqueia a passagem');
(W.canStand(self.x, self.y) ? ok : fail)('o ponto de entrada e caminhavel');

// areas privadas: sem parede, mas a conversa e fechada
try {
  const privada = W.ROOMS.find((r) => r.kind === 'privada');
  if (!privada) throw new Error('a planta padrao nao tem area privada');

  const dentroA = { x: (privada.x1 + 1) * 32 + 16, y: (privada.y1 + 1) * 32 + 16 };
  const dentroB = { x: (privada.x2 - 1) * 32 + 16, y: (privada.y2 - 1) * 32 + 16 };
  const foraColado = { x: (privada.x1 - 1) * 32 + 16, y: (privada.y1 + 1) * 32 + 16 };

  const idDe = (p) => W.roomId(p.x, p.y);
  (idDe(dentroA) === privada.id && idDe(dentroB) === privada.id ? ok : fail)(
    'quem pisa na ' + privada.name + ' entra na zona privada'
  );
  (idDe(foraColado) === 'open' ? ok : fail)('um tile fora da borda ja e open space');

  const vol = (a, b) => VO.game.volumeBetween(
    { x: a.x, y: a.y, room: idDe(a) },
    { x: b.x, y: b.y, room: idDe(b) }
  );
  (vol(dentroA, dentroB) === 1 ? ok : fail)('dentro da area privada todos se ouvem por inteiro');
  (vol(dentroA, foraColado) === 0 ? ok : fail)('quem esta colado do lado de fora nao ouve nada');
  (vol(foraColado, dentroA) === 0 ? ok : fail)('e quem esta dentro tambem nao vaza para fora');
} catch (err) {
  fail('regra das areas privadas', err);
}

// troca de planta a quente
try {
  const menor = JSON.parse(JSON.stringify(mapaPadrao));
  menor.rows = menor.rows.map((r, y) => (y === 0 || y === menor.rows.length - 1
    ? r
    : '#' + '.'.repeat(r.length - 2) + '#'));
  menor.rooms = [];
  VO.game.applyMap(menor);
  ok('troca de planta a quente sem erro (todos reposicionados)');
  VO.game.applyMap(mapaPadrao);
} catch (err) {
  fail('troca de planta a quente', err);
}

console.log('');
if (problems.length) {
  console.log(problems.length + ' problema(s) no cliente.');
  process.exit(1);
}
console.log('Cliente ok.');
