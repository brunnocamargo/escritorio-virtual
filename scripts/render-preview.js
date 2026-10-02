/**
 * Renderiza a arte do jogo em um PNG, sem navegador.
 *
 *   node scripts/render-preview.js [saida.png]
 *
 * Toda a arte do projeto e feita com fillRect de cor solida, entao um
 * rasterizador simples reproduz exatamente o que o Chrome mostraria. Serve
 * para conferir tiles e personagens em revisao de codigo e no CI.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// --------------------------------------------------------- canvas de mentira ---

function parseColor(cor) {
  if (typeof cor !== 'string') return [0, 0, 0, 0];
  const s = cor.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
      1,
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const partes = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [partes[0] | 0, partes[1] | 0, partes[2] | 0, partes.length > 3 ? partes[3] : 1];
  }
  return [0, 0, 0, 1];
}

class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  blend(x, y, [r, g, b, a]) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    if (a >= 1) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return;
    }
    const ia = 1 - a;
    d[i] = r * a + d[i] * ia;
    d[i + 1] = g * a + d[i + 1] * ia;
    d[i + 2] = b * a + d[i + 2] * ia;
    d[i + 3] = Math.max(d[i + 3], Math.round(a * 255));
  }

  get(x, y) {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3] / 255];
  }
}

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    this.font = '';
    this.textAlign = 'left';
    this.pilha = [];
    this.t = { sx: 1, sy: 1, dx: 0, dy: 0 };
  }

  save() { this.pilha.push(Object.assign({}, this.t)); }
  restore() { if (this.pilha.length) this.t = this.pilha.pop(); }
  translate(x, y) { this.t.dx += x * this.t.sx; this.t.dy += y * this.t.sy; }
  scale(x, y) { this.t.sx *= x; this.t.sy *= y; }
  setTransform(a, b, c, d, e, f) { this.t = { sx: a, sy: d, dx: e, dy: f }; }

  // metodos que a arte nao usa, mas o resto do codigo chama
  beginPath() {} closePath() {} moveTo() {} lineTo() {} stroke() {}
  arc() {} ellipse() {} fill() {} clearRect() {} fillText() {}
  setLineDash() {}

  strokeRect(x, y, w, h) {
    const g = this.fillStyle;
    this.fillStyle = this.strokeStyle;
    const l = Math.max(1, this.lineWidth);
    this.fillRect(x, y, w, l);
    this.fillRect(x, y + h - l, w, l);
    this.fillRect(x, y, l, h);
    this.fillRect(x + w - l, y, l, h);
    this.fillStyle = g;
  }
  measureText() { return { width: 0 }; }

  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      for (let pxx = 0; pxx < w; pxx++) {
        const src = ((y + py) * this.canvas.raster.width + (x + pxx)) * 4;
        const dst = (py * w + pxx) * 4;
        for (let k = 0; k < 4; k++) out[dst + k] = this.canvas.raster.data[src + k];
      }
    }
    return { width: w, height: h, data: out };
  }

  putImageData(img, x, y) {
    for (let py = 0; py < img.height; py++) {
      for (let pxx = 0; pxx < img.width; pxx++) {
        const src = (py * img.width + pxx) * 4;
        const dst = ((y + py) * this.canvas.raster.width + (x + pxx)) * 4;
        for (let k = 0; k < 4; k++) this.canvas.raster.data[dst + k] = img.data[src + k];
      }
    }
  }

  fillRect(x, y, w, h) {
    const cor = parseColor(this.fillStyle);
    const x0 = this.t.dx + x * this.t.sx;
    const y0 = this.t.dy + y * this.t.sy;
    const x1 = x0 + w * this.t.sx;
    const y1 = y0 + h * this.t.sy;
    const ix0 = Math.round(Math.min(x0, x1));
    const ix1 = Math.round(Math.max(x0, x1));
    const iy0 = Math.round(Math.min(y0, y1));
    const iy1 = Math.round(Math.max(y0, y1));
    for (let py = iy0; py < iy1; py++) {
      for (let pxx = ix0; pxx < ix1; pxx++) this.canvas.raster.blend(pxx, py, cor);
    }
  }

  drawImage(src, ...args) {
    let sx = 0; let sy = 0; let sw = src.width; let sh = src.height;
    let dx; let dy; let dw; let dh;
    if (args.length === 2) { [dx, dy] = args; dw = sw; dh = sh; }
    else if (args.length === 4) { [dx, dy, dw, dh] = args; }
    else { [sx, sy, sw, sh, dx, dy, dw, dh] = args; }

    const escalaX = dw / sw;
    const escalaY = dh / sh;
    for (let y = 0; y < dh; y++) {
      const oy = sy + Math.floor(y / escalaY);
      if (oy < 0 || oy >= src.height) continue;
      for (let x = 0; x < dw; x++) {
        const ox = sx + Math.floor(x / escalaX);
        if (ox < 0 || ox >= src.width) continue;
        const cor = src.raster.get(ox, oy);
        if (cor[3] <= 0) continue;
        const destX = Math.round(this.t.dx + (dx + x) * this.t.sx);
        const destY = Math.round(this.t.dy + (dy + y) * this.t.sy);
        this.canvas.raster.blend(destX, destY, cor);
      }
    }
  }
}

class Canvas {
  constructor(width = 0, height = 0) {
    this._w = width;
    this._h = height;
    this.raster = new Raster(width || 1, height || 1);
    this.ctx = new Ctx2D(this);
    this.style = {};
  }
  get width() { return this._w; }
  set width(v) { this._w = v; this.raster = new Raster(v || 1, this._h || 1); }
  get height() { return this._h; }
  set height(v) { this._h = v; this.raster = new Raster(this._w || 1, v || 1); }
  getContext() { return this.ctx; }
}

// -------------------------------------------------------------------- PNG ---

function crc32(buf) {
  let c;
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tabela[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function gravarPNG(raster, destino, fundo) {
  const { width, height, data } = raster;
  const linhas = Buffer.alloc((width * 3 + 1) * height);
  let pos = 0;
  const bg = parseColor(fundo || '#0b0e15');
  for (let y = 0; y < height; y++) {
    linhas[pos++] = 0; // filtro "none"
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      linhas[pos++] = Math.round(data[i] * a + bg[0] * (1 - a));
      linhas[pos++] = Math.round(data[i + 1] * a + bg[1] * (1 - a));
      linhas[pos++] = Math.round(data[i + 2] * a + bg[2] * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bits por canal
  ihdr[9] = 2;    // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(destino, png);
  return png.length;
}

// ------------------------------------------------------------- carrega arte ---

const sandbox = {
  console,
  window: { addEventListener: () => {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 },
  document: { createElement: (tag) => (tag === 'canvas' ? new Canvas(0, 0) : { style: {} }) },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => {},
  setInterval: () => 0,
  setTimeout: () => 0,
  clearTimeout: () => {},
};
sandbox.self = sandbox.window;
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
for (const arquivo of ['tiles.js', 'mapcheck.js', 'world.js', 'avatar.js', 'sprites.js']) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'js', arquivo), 'utf8'),
    sandbox,
    { filename: arquivo }
  );
}
const VO = sandbox.window.VO;
const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'office.default.json'), 'utf8'));
VO.world.load(mapa);

// ------------------------------------------------------------------ desenho ---

const W = VO.world;
const S = VO.sprites;
const TILE = 32;

// recorte do mapa: da recepcao ate um pedaco do open space e do corredor
const PERTO = process.argv.includes('--perto');
const RECORTE = PERTO
  ? { x1: 5, y1: 13, x2: 30, y2: 27 }
  : { x1: 0, y1: 0, x2: 43, y2: 29 };
const AMPLIA = PERTO ? 3 : 1;
const mapaW = (RECORTE.x2 - RECORTE.x1 + 1) * TILE;
const mapaH = (RECORTE.y2 - RECORTE.y1 + 1) * TILE;

const FAIXA_PERSONAGENS = 150;
const alvo = new Canvas(mapaW, mapaH + FAIXA_PERSONAGENS);
const ctx = alvo.getContext('2d');

for (let ty = RECORTE.y1; ty <= RECORTE.y2; ty++) {
  for (let tx = RECORTE.x1; tx <= RECORTE.x2; tx++) {
    ctx.drawImage(
      S.tile(W.tileAt(tx, ty), W.floorAt(tx, ty), S.varianteEm(tx, ty)),
      (tx - RECORTE.x1) * TILE,
      (ty - RECORTE.y1) * TILE
    );
  }
}
for (let ty = RECORTE.y1; ty <= RECORTE.y2; ty++) {
  for (let tx = RECORTE.x1; tx <= RECORTE.x2; tx++) {
    if (W.isSolidTile(tx, ty)) continue;
    let mask = 0;
    if (W.isSolidTile(tx, ty - 1)) mask |= 1;
    if (W.isSolidTile(tx - 1, ty)) mask |= 2;
    if (W.isSolidTile(tx + 1, ty)) mask |= 4;
    if (mask) ctx.drawImage(S.shadow(mask), (tx - RECORTE.x1) * TILE, (ty - RECORTE.y1) * TILE);
  }
}

// areas privadas: piso tingido e borda pontilhada, igual ao jogo
function comAlfa(hex, alfa) {
  const t = String(hex).replace('#', '');
  return 'rgba(' + parseInt(t.slice(0, 2), 16) + ',' + parseInt(t.slice(2, 4), 16) +
    ',' + parseInt(t.slice(4, 6), 16) + ',' + alfa + ')';
}
for (const sala of W.ROOMS) {
  if (sala.kind !== 'privada') continue;
  const x = (sala.x1 - RECORTE.x1) * TILE;
  const y = (sala.y1 - RECORTE.y1) * TILE;
  const w = (sala.x2 - sala.x1 + 1) * TILE;
  const h = (sala.y2 - sala.y1 + 1) * TILE;
  ctx.fillStyle = comAlfa(sala.color, 0.16);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = comAlfa(sala.color, 0.75);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

// alguns personagens andando pelo escritorio
const ELENCO = [
  { look: { body: 'feminino', hairstyle: 'longo', outfit: 'blazer', shirt: '#b06ac9', hair: '#a63d3d', skin: '#e0a878', face: 'oculos' }, tile: [21, 15], dir: 'down' },
  { look: { body: 'masculino', hairstyle: 'raspado', outfit: 'moletom', shirt: '#63e0b0', skin: '#8d5524', face: 'barba', head: 'fone' }, tile: [14, 16], dir: 'right' },
  { look: { body: 'neutro', hairstyle: 'coque', outfit: 'jaleco', shirt: '#4f8ef7', skin: '#ffd9b8', face: 'mascara' }, tile: [43, 14], dir: 'down' },
  { look: { body: 'masculino', hairstyle: 'medio', outfit: 'camiseta', shirt: '#f7b955', skin: '#c68642' }, tile: [27, 24], dir: 'up' },
  { look: { body: 'feminino', hairstyle: 'rabo', outfit: 'social', shirt: '#f2f4f8', skin: '#e0a878', face: 'oculos' }, tile: [9, 20], dir: 'down' },
  { look: { body: 'feminino', hairstyle: 'cacheado', outfit: 'vestido', shirt: '#ef5f6b', hair: '#2a1c16', skin: '#c68642', head: 'bandana' }, tile: [21, 27], dir: 'down' },
];
for (const p of ELENCO) {
  const sprite = VO.avatar.sprite(p.look, p.dir, 0);
  ctx.drawImage(
    sprite,
    (p.tile[0] - RECORTE.x1) * TILE + 16 - sprite.width / 2,
    (p.tile[1] - RECORTE.y1) * TILE + 16 - VO.avatar.FOOT_OFFSET
  );
}

// faixa de baixo: vitrine de personagens em 3x
const vitrine = [
  { body: 'feminino', hairstyle: 'longo', outfit: 'vestido', shirt: '#e2688f', hair: '#c9a227', skin: '#ffd9b8', face: 'nenhum', head: 'nenhum' },
  { body: 'masculino', hairstyle: 'curto', outfit: 'social', shirt: '#f2f4f8', hair: '#151515', skin: '#c68642', face: 'oculos', head: 'nenhum' },
  { body: 'neutro', hairstyle: 'moicano', outfit: 'regata', shirt: '#63e0b0', hair: '#d95f8a', skin: '#e0a878', face: 'oculos-escuros', head: 'nenhum' },
  { body: 'feminino', hairstyle: 'rabo', outfit: 'uniforme', shirt: '#4f8ef7', hair: '#3b2b23', skin: '#8d5524', face: 'nenhum', head: 'bone' },
  { body: 'masculino', hairstyle: 'medio', outfit: 'camiseta', shirt: '#f7b955', hair: '#8a5a2b', skin: '#f2c49b', face: 'antifaz', head: 'nenhum' },
  { body: 'neutro', hairstyle: 'cacheado', outfit: 'blazer', shirt: '#5b4b8a', hair: '#2f6b48', skin: '#a1663a', face: 'mascara-festa', head: 'chapeu' },
  { body: 'feminino', hairstyle: 'coque', outfit: 'jaleco', shirt: '#ef5f6b', hair: '#e8e8e8', skin: '#5c3317', face: 'mascara', head: 'nenhum' },
  { body: 'masculino', hairstyle: 'raspado', outfit: 'moletom', shirt: '#2f3a55', hair: '#151515', skin: '#f2c49b', face: 'bigode', head: 'gorro' },
];
ctx.fillStyle = '#11151f';
ctx.fillRect(0, mapaH, mapaW, FAIXA_PERSONAGENS);
vitrine.forEach((look, i) => {
  const sprite = VO.avatar.sprite(look, i % 2 ? 'down' : 'right', i % 2);
  const escala = 4;
  ctx.drawImage(
    sprite,
    0, 0, sprite.width, sprite.height,
    24 + i * 96,
    mapaH + 12,
    sprite.width * escala,
    sprite.height * escala
  );
});

// modo --personagens: so a folha de personagens, bem grande, para revisar arte
if (process.argv.includes('--personagens')) {
  const COLS = 8;
  const CEL = 8 * 24 + 24;
  const LINHAS = 3;
  const ALT = 8 * 32 + 24;
  const folha = new Canvas(COLS * CEL, LINHAS * ALT);
  const fctx = folha.getContext('2d');
  fctx.fillStyle = '#11151f';
  fctx.fillRect(0, 0, folha.width, folha.height);
  const fundos = ['#c98d63', '#b6d15e', '#e8a33d', '#63a8e0', '#4fc7c0', '#e2564f', '#9aa2ae', '#8b6ad6'];
  vitrine.forEach((look, i) => {
    const col = i % COLS;
    fctx.fillStyle = fundos[col];
    fctx.fillRect(col * CEL, 0, CEL, LINHAS * ALT);
    ['down', 'right', 'up'].forEach((dir, linha) => {
      const sp = VO.avatar.sprite(look, dir, linha === 1 ? 1 : 0);
      fctx.drawImage(sp, 0, 0, sp.width, sp.height,
        col * CEL + 12, linha * ALT + 12, sp.width * 8, sp.height * 8);
      if (linha > 0) {
        fctx.fillStyle = fundos[col];
        fctx.fillRect(col * CEL, linha * ALT, CEL, 0);
      }
    });
  });
  const saida = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'personagens.png';
  console.log('folha de personagens: ' + saida);
  gravarPNG(folha.raster, saida, '#11151f');
  process.exit(0);
}

const destino = process.argv[2] || path.join(__dirname, '..', 'preview.png');
let saidaRaster = alvo.raster;
if (AMPLIA > 1) {
  const grande = new Canvas(alvo.width * AMPLIA, alvo.height * AMPLIA);
  grande.getContext("2d").drawImage(alvo, 0, 0, alvo.width, alvo.height, 0, 0, alvo.width * AMPLIA, alvo.height * AMPLIA);
  saidaRaster = grande.raster;
}
const bytes = gravarPNG(saidaRaster, destino);
console.log('PNG gerado: ' + destino);
console.log(saidaRaster.width + 'x' + saidaRaster.height + ' px, ' + Math.round(bytes / 1024) + ' KB');
