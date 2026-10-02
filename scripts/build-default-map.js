/**
 * Monta o escritorio padrao e grava em data/office.default.json.
 *
 *   node scripts/build-default-map.js
 *
 * Planta compacta, no modelo do Gather:
 *
 *   - 3 salas de reuniao no alto; cada uma e uma zona de conversa fechada
 *   - corredor no meio, ligando tudo
 *   - open space embaixo com 6 estacoes de trabalho; CADA estacao e uma zona
 *     de conversa propria (bloco 3x3, sendo 3 quadrados de mesa)
 *   - lounge no canto e uma faixa verde do lado de fora
 *
 * Desenhar 30 linhas de 44 caracteres na mao da erro; aqui o mapa e composto
 * por retangulos e a validacao roda no fim.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const mapcheck = require('../public/js/mapcheck.js');
const tiles = require('../public/js/tiles.js');

const W = 44;
const H = 30;

const grid = Array.from({ length: H }, () => Array(W).fill('j'));

const put = (x, y, ch) => {
  if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = ch;
};
const rect = (x1, y1, x2, y2, ch) => {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) put(x, y, ch);
};
const rowOf = (x1, x2, y, ch) => rect(x1, y, x2, y, ch);
const scatter = (pontos, ch) => pontos.forEach(([x, y]) => put(x, y, ch));

// ------------------------------------------------------------ area externa ---

rect(4, 2, 40, 2, 's');             // calcada em volta do predio
rect(4, 27, 40, 27, 's');
rect(4, 2, 4, 27, 's');
rect(40, 2, 40, 27, 's');

scatter([[2, 4], [2, 9], [2, 14], [2, 19], [2, 24], [42, 6], [42, 13], [42, 21]], 'e');
scatter([[2, 6], [2, 21], [42, 9], [42, 17], [1, 12], [1, 26], [42, 3]], 'f');

// cerca viva fechando o quarteirao
rect(0, 0, W - 1, 0, 'n');
rect(0, H - 1, W - 1, H - 1, 'n');
rect(0, 0, 0, H - 1, 'n');
rect(W - 1, 0, W - 1, H - 1, 'n');

// ----------------------------------------------------------------- predio ---

const PREDIO = { x1: 5, y1: 3, x2: 40, y2: 26 };
rect(PREDIO.x1, PREDIO.y1, PREDIO.x2, PREDIO.y2, '#');
rect(PREDIO.x1 + 1, PREDIO.y1 + 1, PREDIO.x2 - 1, PREDIO.y2 - 1, '.');

// janelas nas fachadas e a porta de entrada ao sul
for (let x = 8; x <= 37; x += 5) put(x, PREDIO.y1, 'w');
for (let x = 9; x <= 37; x += 7) put(x, PREDIO.y2, 'w');
for (let y = 6; y <= 23; y += 5) {
  put(PREDIO.x1, y, 'w');
  put(PREDIO.x2, y, 'w');
}
put(21, PREDIO.y2, '+');

// ---------------------------------------------- 3 salas de reuniao no alto ---

const SALAS = [
  { id: 'reuniao-a', name: 'Reuniao A', x1: 6, y1: 4, x2: 15, y2: 12, porta: 10, color: '#8f90d8' },
  { id: 'reuniao-b', name: 'Reuniao B', x1: 17, y1: 4, x2: 26, y2: 12, porta: 21, color: '#9a9be2' },
  { id: 'reuniao-c', name: 'Reuniao C', x1: 28, y1: 4, x2: 39, y2: 12, porta: 33, color: '#b3b4e6' },
];

rowOf(6, 39, 13, '#');              // parede entre as salas e o corredor
rect(16, 4, 16, 12, '#');           // divisorias entre as salas
rect(27, 4, 27, 12, '#');

for (const sala of SALAS) {
  rect(sala.x1, sala.y1, sala.x2, sala.y2, 'c');
  put(sala.porta, 13, '+');
  sala.door = [sala.porta, sala.y2];
  sala.floor = 'c';
  sala.kind = 'sala';

  // lousa no fundo, mesa comprida e cadeiras dos dois lados
  const meio = Math.floor((sala.x1 + sala.x2) / 2);
  rowOf(meio - 3, meio + 3, sala.y1, 'W');
  rowOf(meio - 3, meio + 2, sala.y1 + 3, 'T');
  rowOf(meio - 3, meio + 2, sala.y1 + 2, 'H');
  rowOf(meio - 3, meio + 2, sala.y1 + 4, 'H');
  put(sala.x1, sala.y2, 'P');
  put(sala.x2, sala.y2, 'P');
  put(sala.x1, sala.y1 + 2, 'B');
  put(sala.x2, sala.y1 + 2, 'x');
}

// -------------------------------------- open space com estacoes de trabalho ---

/**
 * Estacao de trabalho: a mesa ocupa 3 quadrados e a estacao inteira e um
 * bloco 3x3 (mesa, cadeira, fileira livre). Cada uma vira uma zona de
 * conversa propria - quem esta ali fala so com quem esta na mesma estacao.
 */
function estacaoDeTrabalho(x, y, numero) {
  rect(x, y, x + 2, y + 2, 'p');     // carpete que marca a estacao
  put(x, y, '[');
  put(x + 1, y, '=');
  put(x + 2, y, ']');
  put(x + 1, y + 1, 'H');
  return {
    id: 'mesa-' + numero,
    name: 'Mesa ' + numero,
    kind: 'privada',
    x1: x, y1: y, x2: x + 2, y2: y + 2,
    floor: 'p',
    color: '#8f90d8',
    door: [x + 1, y + 2],
  };
}

const ESTACOES = [];
let numero = 0;
for (const y of [18, 22]) {
  for (const x of [8, 17, 26]) ESTACOES.push(estacaoDeTrabalho(x, y, ++numero));
}

// lounge no canto direito do open space
rect(32, 18, 38, 24, 'g');
rowOf(33, 36, 18, 'S');
put(32, 21, 'Z');
put(38, 21, 'Z');
rect(34, 21, 35, 22, 'm');
rect(33, 24, 37, 24, 'o');
scatter([[31, 18], [39, 18], [31, 25], [39, 25]], 'P');
put(38, 15, 'C');
put(39, 15, 'V');

// cantinho do cafe no corredor e verde no open space
put(6, 15, '~');
put(7, 15, 'C');
scatter([[6, 25], [12, 25], [24, 25], [30, 25]], 'P');
scatter([[16, 15], [26, 15], [33, 15]], 'P');
rect(19, 15, 23, 16, 'l');
put(21, 16, 'Z');

// quadros no corredor
scatter([[9, 14], [25, 14], [36, 14]], 'q');

// -------------------------------------------------------------- resultado ---

const map = {
  version: 1,
  name: 'Escritorio Exato',
  rows: grid.map((row) => row.join('')),
  rooms: SALAS.map(({ porta, ...sala }) => sala).concat(ESTACOES),
  spawns: [
    [21, 14], [20, 14], [22, 14], [14, 16], [28, 16],
    [21, 20], [12, 21], [21, 25],
  ],
};

const resultado = mapcheck.validate(map);
for (const aviso of resultado.warnings) console.log('  aviso: ' + aviso);
if (!resultado.ok) {
  console.log('');
  for (const erro of resultado.errors) console.log('  ERRO: ' + erro);
  process.exit(1);
}

const destino = path.join(__dirname, '..', 'data', 'office.default.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(map, null, 2) + String.fromCharCode(10));

const livres = map.rows.join('').split('').filter((ch) => !tiles.isSolid(ch)).length;
const privadas = map.rooms.filter((r) => r.kind === 'privada').length;
console.log('Mapa gerado: ' + W + 'x' + H + ' tiles, ' +
  (map.rooms.length - privadas) + ' salas de reuniao + ' + privadas + ' estacoes privadas, ' +
  livres + ' tiles caminhaveis, ' + map.spawns.length + ' pontos de entrada.');
console.log('Gravado em data/office.default.json');
