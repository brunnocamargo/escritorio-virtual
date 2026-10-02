/**
 * sprites.js - toda a arte do jogo, desenhada em pixel art por codigo.
 *
 * Nada de imagens externas: cada tile e cada avatar sao pintados em um
 * canvas 16x16 (resolucao de arte) e ampliados 2x com suavizacao desligada,
 * o que produz o visual pixelado classico.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});

  const ART = 16;   // resolucao de arte
  const SCALE = 2;  // 16 * 2 = 32 px na tela
  const SIZE = ART * SCALE;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
  }

  /** Pinta um retangulo em coordenadas de arte (0..15). */
  function p(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
  }

  // --------------------------------------------------------------- pisos ---

  const FLOOR_PAINTERS = {
    // corredor: tijolinho creme, o piso que domina a referencia
    '.': (ctx) => {
      p(ctx, 0, 0, 16, 16, '#f0dfc4');
      for (let y = 0; y < 16; y += 4) {
        p(ctx, 0, y, 16, 1, '#e3cfae');
        p(ctx, 0, y + 1, 16, 1, '#f7ead6');
      }
      p(ctx, 5, 0, 1, 4, '#e3cfae');
      p(ctx, 13, 4, 1, 4, '#e3cfae');
      p(ctx, 2, 8, 1, 4, '#e3cfae');
      p(ctx, 10, 12, 1, 4, '#e3cfae');
    },
    // madeira clara: piso quente das salas de convivio
    t: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#e8cfa6');
      for (let y = 0; y < 16; y += 4) {
        p(ctx, 0, y, 16, 1, '#dabf93');
        p(ctx, 0, y + 1, 16, 1, '#f0dcbb');
      }
      p(ctx, 7, 0, 1, 4, '#d3b789');
      p(ctx, 3, 8, 1, 4, '#d3b789');
    },
    // carpete lilas das salas
    c: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#8f90d8');
      for (let x = 0; x < 16; x += 4) p(ctx, x, 0, 2, 16, '#9a9be2');
      p(ctx, 0, 0, 16, 1, '#a5a6ea');
      p(ctx, 0, 15, 16, 1, 'rgba(70,70,140,.20)');
    },
    // carpete lilas mais claro
    g: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#b3b4e6');
      for (let x = 2; x < 16; x += 4) p(ctx, x, 0, 2, 16, '#bfc0ee');
      p(ctx, 0, 0, 16, 1, '#c9caf3');
      p(ctx, 0, 15, 16, 1, 'rgba(80,80,150,.16)');
    },
    // piso de ladrilho claro com losangos
    k: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#eef0f7');
      p(ctx, 0, 7, 16, 1, '#dde1ee');
      p(ctx, 7, 0, 1, 16, '#dde1ee');
      p(ctx, 3, 3, 2, 2, '#dde1ee');
      p(ctx, 11, 11, 2, 2, '#dde1ee');
      p(ctx, 11, 3, 2, 2, '#e6e9f3');
      p(ctx, 3, 11, 2, 2, '#e6e9f3');
    },
    // carpete cinza das baias
    p: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#a7aeb7');
      for (let i = 0; i < 14; i++) {
        p(ctx, (i * 7) % 16, (i * 5 + 2) % 16, 1, 1, i % 2 ? '#b2b9c1' : '#9ca3ac');
      }
      p(ctx, 0, 0, 16, 1, '#b2b9c1');
    },
    // asfalto
    a: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#6f7681');
      for (let i = 0; i < 12; i++) {
        p(ctx, (i * 5) % 16, (i * 7 + 2) % 16, 1, 1, i % 2 ? '#79818c' : '#666d78');
      }
    },
    y: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#6f7681');
      for (let i = 0; i < 10; i++) p(ctx, (i * 5) % 16, (i * 7 + 2) % 16, 1, 1, '#666d78');
      p(ctx, 7, 0, 2, 10, '#f0d878');
      p(ctx, 7, 0, 1, 10, '#f8e79c');
    },
    // calcada clara
    s: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#d7dae1');
      p(ctx, 0, 0, 16, 1, '#e3e6ec');
      p(ctx, 0, 7, 16, 1, '#c6cad3');
      p(ctx, 7, 0, 1, 16, '#c6cad3');
    },
    f: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#bfe5c6');
      for (let y = 1; y < 16; y += 3) {
        for (let x = (y % 2) * 2; x < 16; x += 4) p(ctx, x, y, 1, 1, '#a9d9b3');
      }
      p(ctx, 3, 4, 2, 2, '#ef7d92');
      p(ctx, 10, 3, 2, 2, '#f5c463');
      p(ctx, 6, 10, 2, 2, '#e88fc0');
      p(ctx, 12, 11, 2, 2, '#ffffff');
    },
    // tapete branco com losangos
    l: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#eceef6');
      for (let i = 0; i < 16; i += 8) {
        p(ctx, i + 3, 1, 2, 2, '#d9dcea');
        p(ctx, i + 1, 3, 2, 2, '#d9dcea');
        p(ctx, i + 5, 3, 2, 2, '#d9dcea');
        p(ctx, i + 3, 5, 2, 2, '#d9dcea');
      }
      p(ctx, 3, 9, 2, 2, '#d9dcea');
      p(ctx, 11, 13, 2, 2, '#d9dcea');
    },
    // gramado externo: verde menta bem claro
    j: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#d5eedb');
      for (let y = 1; y < 16; y += 3) {
        for (let x = (y % 2) * 2; x < 16; x += 4) {
          p(ctx, x, y, 1, 2, '#c6e6ce');
          p(ctx, x + 2, y + 1, 1, 1, '#b9dcc3');
        }
      }
    },
    // tapete de destaque
    o: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#e8a68c');
      for (let y = 1; y < 16; y += 4) p(ctx, 0, y, 16, 1, '#f0b89f');
      for (let x = 2; x < 16; x += 4) p(ctx, x, 0, 1, 16, 'rgba(160,90,60,.14)');
      p(ctx, 4, 4, 2, 2, '#f7cbb6');
      p(ctx, 11, 10, 2, 2, '#f7cbb6');
    },
  };

  function paintFloor(ctx, ch) {
    (FLOOR_PAINTERS[ch] || FLOOR_PAINTERS['.'])(ctx);
  }

  // -------------------------------------------------------------- objetos ---

  /** Tampo branco continuo: e o que faz tres tiles lerem como uma mesa so. */
  function tampoDaMesa(ctx) {
    p(ctx, 0, 5, 16, 10, '#c3cad6');
    p(ctx, 0, 6, 16, 8, '#f6f7fa');
    p(ctx, 0, 6, 16, 1, '#ffffff');
    p(ctx, 0, 13, 16, 1, '#dde1e9');
    p(ctx, 0, 14, 16, 1, '#b9c0cc');
  }

  const OBJECT_PAINTERS = {
    '#': (ctx) => {
      p(ctx, 0, 0, 16, 16, '#98a0ab');
      p(ctx, 0, 0, 16, 4, '#c2c9d1');
      p(ctx, 0, 4, 16, 1, '#8b939e');
      p(ctx, 0, 14, 16, 2, '#7d848e');
      p(ctx, 0, 15, 16, 1, '#6e757f');
      for (let y = 6; y < 14; y += 4) {
        p(ctx, 0, y, 16, 1, '#909955');
        p(ctx, 0, y, 16, 1, '#8f97a2');
      }
    },
    '+': (ctx) => {
      p(ctx, 0, 0, 16, 16, '#b5814f');
      p(ctx, 0, 0, 16, 2, '#8b6238');
      p(ctx, 2, 4, 12, 9, '#8c5b3a');
      p(ctx, 3, 5, 10, 7, '#a86f47');
      p(ctx, 5, 7, 6, 3, '#8c5b3a');
    },
    /**
     * Mesa de trabalho em tres partes. Juntas ocupam 3 tiles e leem como um
     * movel unico, com objetos diferentes em cada pedaco - do jeito que uma
     * bancada aparece no Gather.
     */
    '[': (ctx) => {
      tampoDaMesa(ctx);
      p(ctx, 0, 5, 1, 10, '#aab2c0');       // ponta arredondada
      p(ctx, 0, 5, 1, 1, '#c3cad6');
      p(ctx, 0, 14, 1, 1, '#c3cad6');
      // monitor
      p(ctx, 3, 0, 11, 6, '#2b3140');
      p(ctx, 4, 1, 9, 4, '#5ec2e6');
      p(ctx, 4, 1, 9, 1, '#93dcf3');
      p(ctx, 5, 2, 3, 1, '#c2ecfa');
      p(ctx, 8, 6, 2, 1, '#2b3140');
      p(ctx, 6, 7, 6, 1, '#3b4457');
      // gaveteiro sob a mesa
      p(ctx, 2, 9, 6, 5, '#d3d8e2');
      p(ctx, 2, 10, 6, 1, '#aab2c0');
      p(ctx, 2, 12, 6, 1, '#aab2c0');
    },
    '=': (ctx) => {
      tampoDaMesa(ctx);
      // segundo monitor, menor
      p(ctx, 2, 1, 8, 5, '#2b3140');
      p(ctx, 3, 2, 6, 3, '#7ed0a8');
      p(ctx, 3, 2, 6, 1, '#a9e6c8');
      p(ctx, 5, 6, 2, 1, '#2b3140');
      // teclado e mouse
      p(ctx, 1, 9, 10, 4, '#e4e8f0');
      p(ctx, 2, 10, 8, 2, '#aab2c0');
      p(ctx, 12, 10, 3, 3, '#d3d8e2');
      p(ctx, 12, 10, 3, 1, '#eef1f6');
    },
    ']': (ctx) => {
      tampoDaMesa(ctx);
      p(ctx, 15, 5, 1, 10, '#aab2c0');      // ponta arredondada
      p(ctx, 15, 5, 1, 1, '#c3cad6');
      p(ctx, 15, 14, 1, 1, '#c3cad6');
      // vasinho
      p(ctx, 10, 2, 4, 4, '#4aa15f');
      p(ctx, 11, 1, 2, 2, '#5cb972');
      p(ctx, 11, 6, 3, 2, '#c98b5e');
      // caneca e papelada
      p(ctx, 2, 9, 3, 4, '#e88f4d');
      p(ctx, 2, 9, 3, 1, '#f5b276');
      p(ctx, 5, 10, 1, 2, '#e88f4d');
      p(ctx, 7, 9, 7, 4, '#ffffff');
      p(ctx, 8, 10, 5, 1, '#c3cad6');
      p(ctx, 8, 12, 5, 1, '#c3cad6');
    },
    D: (ctx) => {
      tampoDaMesa(ctx);
      p(ctx, 0, 5, 1, 10, '#aab2c0');
      p(ctx, 15, 5, 1, 10, '#aab2c0');
      p(ctx, 3, 0, 10, 6, '#2b3140');
      p(ctx, 4, 1, 8, 4, '#5ec2e6');
      p(ctx, 4, 1, 8, 1, '#93dcf3');
      p(ctx, 7, 6, 2, 1, '#2b3140');
      p(ctx, 3, 9, 8, 4, '#e4e8f0');
      p(ctx, 4, 10, 6, 2, '#aab2c0');
      p(ctx, 12, 10, 3, 3, '#e88f4d');
    },
    H: (ctx) => {
      // cadeira: encosto, assento e pes (o avatar passa por cima)
      p(ctx, 4, 2, 8, 4, '#20242f');
      p(ctx, 5, 3, 6, 3, '#414a5e');
      p(ctx, 5, 3, 6, 1, '#54607a');
      p(ctx, 3, 6, 10, 6, '#20242f');
      p(ctx, 4, 7, 8, 4, '#4a5468');
      p(ctx, 4, 7, 8, 1, '#5c6880');
      p(ctx, 4, 10, 8, 1, 'rgba(0,0,0,.22)');
      p(ctx, 4, 12, 2, 3, '#20242f');
      p(ctx, 10, 12, 2, 3, '#20242f');
      p(ctx, 4, 12, 2, 1, '#3a4254');
      p(ctx, 10, 12, 2, 1, '#3a4254');
    },
    T: (ctx) => {
      p(ctx, 0, 2, 16, 12, '#4a2f1b');
      p(ctx, 0, 3, 16, 10, '#7d5230');
      p(ctx, 0, 3, 16, 2, '#9a6a3f');
      p(ctx, 0, 11, 16, 2, '#5e3c23');
      p(ctx, 1, 5, 14, 5, '#8a5b36');
      p(ctx, 2, 6, 5, 2, '#96653f');
      p(ctx, 1, 14, 2, 2, '#3f2716');
      p(ctx, 13, 14, 2, 2, '#3f2716');
    },
    P: (ctx) => {
      p(ctx, 6, 11, 5, 5, '#a1553a');
      p(ctx, 6, 11, 5, 1, '#bd6845');
      p(ctx, 7, 8, 3, 3, '#3e8f56');
      p(ctx, 4, 5, 9, 4, '#3e8f56');
      p(ctx, 5, 3, 7, 3, '#4ea767');
      p(ctx, 7, 1, 3, 3, '#5cbd77');
      p(ctx, 3, 7, 2, 2, '#2f7a47');
      p(ctx, 12, 6, 2, 2, '#2f7a47');
    },
    S: (ctx) => {
      p(ctx, 0, 3, 16, 11, '#d98e73');
      p(ctx, 0, 3, 16, 2, '#eaa88f');
      p(ctx, 1, 6, 6, 7, '#f2bda6');
      p(ctx, 9, 6, 6, 7, '#f2bda6');
      p(ctx, 0, 5, 2, 9, '#c67c62');
      p(ctx, 14, 5, 2, 9, '#c67c62');
      p(ctx, 0, 14, 16, 2, '#a9664f');
      p(ctx, 1, 6, 6, 1, '#f8d0be');
    },
    B: (ctx) => {
      p(ctx, 1, 0, 14, 16, '#6b4630');
      p(ctx, 2, 1, 12, 14, '#4f3323');
      const palette = ['#c9524f', '#4f86c9', '#63b06a', '#d8b04a', '#b06ac9'];
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = 2 + shelf * 5;
        for (let i = 0; i < 5; i++) {
          p(ctx, 3 + i * 2, y, 2, 3, palette[(i + shelf) % palette.length]);
        }
        p(ctx, 2, y + 3, 12, 1, '#6b4630');
      }
    },
    W: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#474c60');
      p(ctx, 0, 0, 16, 3, '#5c6379');
      p(ctx, 1, 3, 14, 11, '#aeb6c6');
      p(ctx, 2, 4, 12, 9, '#eef2f8');
      p(ctx, 3, 6, 7, 1, '#7f8aa3');
      p(ctx, 3, 8, 9, 1, '#7f8aa3');
      p(ctx, 3, 10, 5, 1, '#7f8aa3');
    },
    w: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#98a0ab');
      p(ctx, 0, 0, 16, 4, '#c2c9d1');
      p(ctx, 1, 4, 14, 9, '#7d848e');
      p(ctx, 2, 5, 12, 7, '#bfe0ef');
      p(ctx, 2, 5, 12, 2, '#d7eef8');
      p(ctx, 7, 5, 1, 7, '#7d848e');
      p(ctx, 2, 8, 12, 1, '#7d848e');
      p(ctx, 0, 13, 16, 3, '#8b939e');
    },
    v: (ctx) => {
      p(ctx, 0, 0, 16, 2, '#8b93a6');
      p(ctx, 0, 14, 16, 2, '#8b93a6');
      p(ctx, 0, 2, 16, 12, '#b9dced');
      p(ctx, 2, 3, 3, 10, '#d6ecf7');
      p(ctx, 10, 3, 2, 10, '#d6ecf7');
      p(ctx, 7, 2, 1, 12, '#8b93a6');
    },
    q: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#474c60');
      p(ctx, 0, 0, 16, 3, '#5c6379');
      p(ctx, 3, 4, 10, 8, '#c9a227');
      p(ctx, 4, 5, 8, 6, '#2f6b8f');
      p(ctx, 4, 8, 8, 3, '#3e8f56');
      p(ctx, 9, 6, 2, 2, '#f2e07a');
    },
    m: (ctx) => {
      p(ctx, 4, 2, 8, 12, '#6f4728');
      p(ctx, 2, 4, 12, 8, '#6f4728');
      p(ctx, 3, 3, 10, 10, '#7d5230');
      p(ctx, 4, 4, 8, 6, '#96653f');
      p(ctx, 5, 5, 6, 3, '#a87748');
    },
    b: (ctx) => {
      p(ctx, 0, 4, 16, 9, '#c9ced9');
      p(ctx, 0, 4, 16, 2, '#e2e6ee');
      p(ctx, 0, 12, 16, 2, '#8b93a6');
      p(ctx, 2, 7, 5, 3, '#8fb8d0');
      p(ctx, 10, 7, 4, 3, '#6f7789');
    },
    R: (ctx) => {
      p(ctx, 0, 3, 16, 10, '#6b4630');
      p(ctx, 0, 3, 16, 3, '#8a5b36');
      p(ctx, 0, 6, 16, 1, '#573622');
      p(ctx, 1, 8, 14, 4, '#7d5230');
      p(ctx, 3, 9, 4, 2, '#c9ced9');
      p(ctx, 9, 9, 4, 2, '#c9ced9');
    },
    Z: (ctx) => {
      p(ctx, 2, 3, 12, 11, '#e88f4d');
      p(ctx, 2, 3, 12, 2, '#f2a566');
      p(ctx, 3, 6, 10, 6, '#f5b276');
      p(ctx, 1, 5, 2, 8, '#cf7739');
      p(ctx, 13, 5, 2, 8, '#cf7739');
      p(ctx, 3, 14, 2, 2, '#8a5a36');
      p(ctx, 11, 14, 2, 2, '#8a5a36');
      p(ctx, 3, 6, 5, 1, '#f8c79b');
    },
    x: (ctx) => {
      p(ctx, 2, 6, 12, 9, '#b08050');
      p(ctx, 2, 6, 12, 1, '#c79a6b');
      p(ctx, 7, 6, 2, 9, '#8f6640');
      p(ctx, 4, 2, 8, 4, '#c79a6b');
      p(ctx, 4, 2, 8, 1, '#dbb489');
      p(ctx, 7, 2, 2, 4, '#8f6640');
    },
    C: (ctx) => {
      p(ctx, 3, 2, 10, 13, '#3a4152');
      p(ctx, 3, 2, 10, 2, '#4c5568');
      p(ctx, 4, 5, 8, 4, '#1f2430');
      p(ctx, 5, 6, 6, 2, '#c96a3a');
      p(ctx, 6, 10, 4, 3, '#c9ced9');
      p(ctx, 4, 13, 8, 1, '#1f2430');
    },
    V: (ctx) => {
      p(ctx, 2, 1, 12, 14, '#2f6b8f');
      p(ctx, 3, 2, 7, 10, '#1f2430');
      const doces = ['#e0a04a', '#c9524f', '#63b06a'];
      for (let i = 0; i < 3; i++) p(ctx, 4, 3 + i * 3, 5, 2, doces[i]);
      p(ctx, 11, 3, 2, 6, '#8fb8d0');
      p(ctx, 3, 13, 8, 1, '#1f2430');
    },
    A: (ctx) => {
      p(ctx, 3, 1, 10, 14, '#5b3d70');
      p(ctx, 3, 1, 10, 2, '#7a5393');
      p(ctx, 4, 4, 8, 5, '#141821');
      p(ctx, 5, 5, 6, 3, '#63e0b0');
      p(ctx, 4, 10, 8, 2, '#2f3648');
      p(ctx, 5, 10, 2, 2, '#ef5f6b');
      p(ctx, 9, 10, 2, 2, '#f7b955');
      p(ctx, 4, 14, 8, 1, '#3a2a4a');
    },
    M: (ctx) => {
      p(ctx, 0, 3, 16, 10, '#2f6b48');
      p(ctx, 0, 3, 16, 1, '#3e8f56');
      p(ctx, 1, 4, 14, 3, '#357c4f');
      p(ctx, 1, 9, 14, 3, '#357c4f');
      p(ctx, 0, 7, 16, 2, '#e6eaf3');
      p(ctx, 0, 13, 16, 1, '#20402c');
    },
    L: (ctx) => {
      p(ctx, 5, 1, 6, 4, '#f2e07a');
      p(ctx, 4, 4, 8, 1, '#d8c45c');
      p(ctx, 7, 5, 2, 9, '#8b93a6');
      p(ctx, 5, 14, 6, 2, '#5c6379');
    },
    u: (ctx) => {
      p(ctx, 0, 0, 16, 16, '#2f6fa8');
      p(ctx, 0, 0, 16, 3, '#3a7fbb');
      for (let y = 2; y < 16; y += 5) {
        p(ctx, 1, y, 5, 1, '#4b93cc');
        p(ctx, 9, y + 2, 5, 1, '#4b93cc');
      }
      p(ctx, 3, 7, 3, 1, '#7fbbe4');
      p(ctx, 10, 12, 3, 1, '#7fbbe4');
    },
    e: (ctx) => {
      p(ctx, 7, 12, 3, 4, '#8a6242');
      p(ctx, 7, 12, 1, 4, '#a0764f');
      p(ctx, 2, 2, 12, 11, '#4aa15f');
      p(ctx, 3, 1, 10, 2, '#4aa15f');
      p(ctx, 1, 4, 14, 7, '#4aa15f');
      p(ctx, 3, 2, 7, 4, '#5cb972');
      p(ctx, 4, 3, 4, 2, '#74cf89');
      p(ctx, 10, 8, 4, 3, '#37864b');
      p(ctx, 2, 9, 3, 2, '#37864b');
      p(ctx, 5, 11, 6, 1, '#37864b');
    },
    n: (ctx) => {
      // arbusto que preenche o tile inteiro: em fila vira uma cerca viva
      p(ctx, 0, 0, 16, 16, '#4aa15f');
      p(ctx, 0, 0, 16, 3, '#5cb972');
      p(ctx, 1, 1, 5, 2, '#74cf89');
      p(ctx, 9, 2, 4, 2, '#6ac47f');
      p(ctx, 0, 13, 16, 3, '#2c6b3b');
      p(ctx, 3, 6, 3, 3, '#3d8c50');
      p(ctx, 10, 8, 4, 3, '#3d8c50');
      p(ctx, 6, 10, 3, 2, '#5cb972');
    },
    i: (ctx) => {
      p(ctx, 1, 4, 14, 3, '#8a5b36');
      p(ctx, 1, 4, 14, 1, '#a3703f');
      p(ctx, 1, 8, 14, 3, '#7d5230');
      p(ctx, 1, 8, 14, 1, '#96653f');
      p(ctx, 2, 11, 2, 4, '#4a4d59');
      p(ctx, 12, 11, 2, 4, '#4a4d59');
      p(ctx, 1, 7, 14, 1, '#5e3c23');
    },
    z: (ctx) => {
      p(ctx, 7, 4, 2, 12, '#5a6070');
      p(ctx, 7, 4, 1, 12, '#6d7484');
      p(ctx, 5, 1, 6, 4, '#3f4552');
      p(ctx, 6, 2, 4, 2, '#f7e6a8');
      p(ctx, 6, 4, 4, 1, '#e0cf86');
      p(ctx, 5, 15, 6, 1, '#3f4552');
    },
    '~': (ctx) => {
      p(ctx, 5, 7, 6, 8, '#c9ced9');
      p(ctx, 5, 7, 6, 1, '#e2e6ee');
      p(ctx, 6, 2, 4, 5, '#8fd7f0');
      p(ctx, 6, 2, 4, 1, '#b7e8f8');
      p(ctx, 6, 10, 4, 2, '#7f8aa3');
      p(ctx, 5, 15, 6, 1, '#9aa2b3');
    },
  };

  // ------------------------------------------------------------- avatares ---
  // A arte do personagem mora em avatar.js (camadas de corpo, roupa, cabelo e
  // acessorios). Aqui fica so o atalho, para o resto do jogo nao precisar saber.

  function avatar(look, dir, frame) {
    return VO.avatar.sprite(look, dir, frame);
  }

  // ----------------------------------------------------------- tiles cache ---

  // pecas de estrutura pintam o quadro inteiro, sem piso por baixo
  const FULL_TILE = new Set(['#', 'W', 'w', 'v', 'q']);

  /**
   * Sujeirinha deterministica no piso. Sem isso, um corredor grande vira um
   * padrao repetido obvio; com isso, cada tile fica levemente diferente.
   */
  const MARCAS = [[3, 5], [11, 2], [6, 12], [13, 9], [8, 7], [2, 10], [14, 4], [5, 14]];

  function aplicarVariacao(ctx, variante) {
    for (let i = 0; i < 3; i++) {
      const m = MARCAS[(variante * 3 + i) % MARCAS.length];
      p(ctx, m[0], m[1], 1, 1, i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)');
    }
  }

  /**
   * Sombra de contato: escurece a beirada do piso encostada em parede/movel.
   * mask: 1 = tem solido em cima, 2 = a esquerda, 4 = a direita, 8 = embaixo.
   */
  const sombraCache = new Map();

  function shadow(mask) {
    const pronta = sombraCache.get(mask);
    if (pronta) return pronta;

    const { canvas, ctx } = makeCanvas(SIZE, SIZE);
    const faixa = [0.16, 0.10, 0.06, 0.03, 0.015];
    for (let i = 0; i < faixa.length; i++) {
      const cor = 'rgba(0,0,0,' + faixa[i] + ')';
      if (mask & 1) p(ctx, 0, i, 16, 1, cor);
      if (mask & 2) p(ctx, i, 0, 1, 16, cor);
      if (mask & 4) p(ctx, 15 - i, 0, 1, 16, cor);
      if (mask & 8) p(ctx, 0, 15 - i, 16, 1, cor);
    }
    sombraCache.set(mask, canvas);
    return canvas;
  }

  const tileCache = new Map();

  /** Canvas 32x32 do tile (piso + objeto + variacao, ja combinados). */
  function tile(ch, floorCh, variante) {
    const v = variante || 0;
    const key = ch + floorCh + v;
    const cached = tileCache.get(key);
    if (cached) return cached;

    const { canvas, ctx } = makeCanvas(SIZE, SIZE);
    const painter = OBJECT_PAINTERS[ch];
    if (FULL_TILE.has(ch)) {
      painter(ctx);
    } else {
      paintFloor(ctx, FLOOR_PAINTERS[ch] ? ch : floorCh);
      aplicarVariacao(ctx, v);
      if (painter && !FLOOR_PAINTERS[ch]) painter(ctx);
    }
    tileCache.set(key, canvas);
    return canvas;
  }

  /** Variacao deterministica: o mesmo tile sempre recebe a mesma sujeirinha. */
  function varianteEm(tx, ty) {
    return (tx * 7 + ty * 13) % 4;
  }

  VO.sprites = { ART, SCALE, SIZE, tile, shadow, varianteEm, avatar, makeCanvas, p };
})();
