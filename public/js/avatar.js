/**
 * avatar.js - o personagem, desenhado em camadas.
 *
 * Estilo: proporcao "chibi" (cabeca grande, corpo pequeno), contorno escuro
 * grosso e olhos grandes com brilho - o visual dos avatares do Gather.
 *
 * A arte tem 24x32 "pixels" e e ampliada 2x (48x64 na tela). Cada peca e uma
 * funcao que pinta retangulos, entao da para combinar corpo + cabelo + roupa
 * + rosto + acessorios sem folha de sprites.
 *
 * Ordem de desenho: pernas, torso, bracos, cabeca, rosto, cabelo, acessorios.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});

  // O tile do mapa tem 32px. O personagem e desenhado em 24x32 e vai para a
  // tela em escala 1, entao ocupa exatamente o espaco de um bloco.
  const ART_W = 24;
  const ART_H = 32;
  const SCALE = 1;
  const W = ART_W * SCALE;   // 24
  const H = ART_H * SCALE;   // 32
  const FOOT_OFFSET = 31;    // do topo do sprite ate o chao sob os pes

  // Proporcoes: a cabeca ocupa quase metade da altura, como na referencia.
  const HEAD = { x: 6, y: 1, w: 12, h: 13 };
  const NECK_Y = 14;
  const TORSO_Y = 15;
  const TORSO_H = 8;
  const LEG_Y = 23;
  const LEG_H = 7;
  const OUTLINE = [26, 22, 32];

  // ------------------------------------------------------------- utilidades ---

  function px(ctx, x, y, w, h, color) {
    if (!color || w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
  }

  function hexToRgb(hex) {
    const s = String(hex || '#000000').replace('#', '');
    const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  }

  /** amount < 0 escurece, > 0 clareia. */
  function shade(hex, amount) {
    const rgb = hexToRgb(hex).map((v) => {
      const alvo = amount < 0 ? 0 : 255;
      return Math.round(v + (alvo - v) * Math.abs(amount));
    });
    return 'rgb(' + rgb.join(',') + ')';
  }

  // --------------------------------------------------------------- catalogo ---

  const OPTIONS = {
    body: [
      { id: 'feminino', label: 'Feminino' },
      { id: 'masculino', label: 'Masculino' },
      { id: 'neutro', label: 'Neutro' },
    ],
    hairstyle: [
      { id: 'curto', label: 'Curto' },
      { id: 'medio', label: 'Medio' },
      { id: 'longo', label: 'Longo' },
      { id: 'cacheado', label: 'Cacheado' },
      { id: 'coque', label: 'Coque' },
      { id: 'rabo', label: 'Rabo de cavalo' },
      { id: 'moicano', label: 'Moicano' },
      { id: 'raspado', label: 'Raspado' },
    ],
    outfit: [
      { id: 'camiseta', label: 'Camiseta' },
      { id: 'social', label: 'Camisa social' },
      { id: 'moletom', label: 'Moletom' },
      { id: 'blazer', label: 'Blazer' },
      { id: 'vestido', label: 'Vestido' },
      { id: 'regata', label: 'Regata' },
      { id: 'jaleco', label: 'Jaleco' },
      { id: 'uniforme', label: 'Polo do time' },
    ],
    face: [
      { id: 'nenhum', label: 'Nada' },
      { id: 'oculos', label: 'Oculos' },
      { id: 'oculos-escuros', label: 'Oculos escuros' },
      { id: 'mascara', label: 'Mascara cirurgica' },
      { id: 'antifaz', label: 'Mascara de heroi' },
      { id: 'mascara-festa', label: 'Mascara de festa' },
      { id: 'barba', label: 'Barba' },
      { id: 'bigode', label: 'Bigode' },
    ],
    head: [
      { id: 'nenhum', label: 'Nada' },
      { id: 'bone', label: 'Bone' },
      { id: 'chapeu', label: 'Chapeu' },
      { id: 'gorro', label: 'Gorro' },
      { id: 'fone', label: 'Fone de ouvido' },
      { id: 'bandana', label: 'Bandana' },
      { id: 'laco', label: 'Laco' },
    ],
  };

  const PALETTES = {
    skin: ['#ffdcc0', '#f5c9a4', '#e3ab7e', '#c88a52', '#a26a3c', '#7d4d2a', '#563218'],
    hair: ['#2a1c16', '#4a3226', '#141414', '#8a5a2b', '#e0b64a', '#b34a3f', '#efefef', '#6a5aa8', '#2f7a55', '#d95f8a'],
    shirt: ['#4f8ef7', '#63e0b0', '#ef5f6b', '#f7b955', '#b06ac9', '#f2f4f8', '#39415c', '#e2688f', '#3e8f56', '#ff8a4c'],
    pants: ['#33406b', '#22283a', '#5b4b8a', '#3d5a3d', '#7d5233', '#8a8f9c', '#243447', '#6b2f3a'],
    detail: ['#f2f4f8', '#2b3040', '#f7b955', '#63e0b0', '#ef5f6b', '#4f8ef7'],
  };

  const DEFAULT_LOOK = {
    body: 'neutro',
    skin: PALETTES.skin[1],
    hair: PALETTES.hair[1],
    hairstyle: 'curto',
    outfit: 'camiseta',
    shirt: PALETTES.shirt[0],
    pants: PALETTES.pants[0],
    detail: PALETTES.detail[0],
    face: 'nenhum',
    head: 'nenhum',
  };

  /** Aceita looks antigos (so cores) e completa o que faltar. */
  function normalize(look) {
    const base = Object.assign({}, DEFAULT_LOOK, look || {});
    const valido = (lista, valor, padrao) => (lista.some((o) => o.id === valor) ? valor : padrao);
    base.body = valido(OPTIONS.body, base.body, 'neutro');
    base.hairstyle = valido(OPTIONS.hairstyle, base.hairstyle, 'curto');
    base.outfit = valido(OPTIONS.outfit, base.outfit, 'camiseta');
    base.face = valido(OPTIONS.face, base.face, 'nenhum');
    base.head = valido(OPTIONS.head, base.head, 'nenhum');
    return base;
  }

  function metrics(body) {
    if (body === 'masculino') return { tx: 6, tw: 12, armL: 3, armR: 18 };
    if (body === 'feminino') return { tx: 7, tw: 10, armL: 4, armR: 17 };
    return { tx: 6, tw: 11, armL: 3, armR: 17 };
  }

  // ------------------------------------------------------------------ pernas ---

  function drawLegs(ctx, look, dir, frame) {
    const vestido = look.outfit === 'vestido';
    const cor = vestido ? shade(look.shirt, -0.12) : look.pants;
    const escuro = shade(cor, -0.28);
    const sapato = '#33384a';
    const solado = '#22262f';

    if (dir === 'left' || dir === 'right') {
      const passo = frame === 1 ? 1 : 0;
      px(ctx, 9, LEG_Y, 6, LEG_H, cor);
      px(ctx, 9, LEG_Y, 6, 1, shade(cor, 0.12));
      px(ctx, 13, LEG_Y, 2, LEG_H, escuro);
      px(ctx, 8 - passo, LEG_Y + LEG_H, 8, 2, sapato);
      px(ctx, 8 - passo, LEG_Y + LEG_H + 1, 8, 1, solado);
      return;
    }

    const gapA = frame === 1 ? 1 : 0;
    const gapB = frame === 1 ? 0 : 1;
    // perna esquerda
    px(ctx, 8 - gapA, LEG_Y, 4, LEG_H, cor);
    px(ctx, 8 - gapA, LEG_Y, 4, 1, shade(cor, 0.12));
    px(ctx, 7 - gapA, LEG_Y + LEG_H, 5, 2, sapato);
    px(ctx, 7 - gapA, LEG_Y + LEG_H + 1, 5, 1, solado);
    // perna direita
    px(ctx, 12 + gapB, LEG_Y, 4, LEG_H, cor);
    px(ctx, 12 + gapB, LEG_Y, 4, 1, shade(cor, 0.12));
    px(ctx, 14 + gapB, LEG_Y, 2, LEG_H, escuro);
    px(ctx, 12 + gapB, LEG_Y + LEG_H, 5, 2, sapato);
    px(ctx, 12 + gapB, LEG_Y + LEG_H + 1, 5, 1, solado);
  }

  // ------------------------------------------------------------------- torso ---

  function drawTorso(ctx, look, dir) {
    const m = metrics(look.body);
    const c = look.shirt;
    const luz = shade(c, 0.16);
    const sombra = shade(c, -0.24);
    const x = m.tx;
    const w = m.tw;
    const y = TORSO_Y;
    const h = TORSO_H;

    px(ctx, x, y, w, h, c);
    px(ctx, x, y, w, 1, luz);
    px(ctx, x + w - 2, y, 2, h, sombra);
    px(ctx, x, y + h - 1, w, 1, sombra);

    switch (look.outfit) {
      case 'social': {
        const meio = x + Math.floor(w / 2);
        px(ctx, meio - 1, y, 2, h, shade(c, 0.28));
        for (let i = 1; i < h - 1; i += 2) px(ctx, meio, y + i, 1, 1, look.detail);
        if (dir !== 'up') {
          px(ctx, meio - 3, y, 3, 2, '#ffffff');
          px(ctx, meio + 1, y, 3, 2, '#f0f2f6');
        }
        break;
      }
      case 'moletom':
        px(ctx, x, y + h - 3, w, 1, sombra);
        px(ctx, x + 2, y + h - 2, w - 4, 2, shade(c, -0.34));
        if (dir === 'up') px(ctx, x + 1, y, w - 2, 4, shade(c, -0.14));
        else {
          px(ctx, x + Math.floor(w / 2) - 3, y, 6, 2, shade(c, -0.14));
          px(ctx, x + Math.floor(w / 2), y + 2, 1, 3, shade(c, -0.3));
        }
        break;
      case 'blazer':
        px(ctx, x + 2, y, w - 4, h, '#f4f6fa');
        px(ctx, x, y, 4, h, c);
        px(ctx, x + w - 4, y, 4, h, c);
        px(ctx, x + 3, y, 2, 4, sombra);
        px(ctx, x + w - 5, y, 2, 4, sombra);
        if (dir !== 'up') px(ctx, x + Math.floor(w / 2) - 1, y + 1, 2, 4, look.detail);
        break;
      case 'vestido':
        px(ctx, x - 1, y + h - 2, w + 2, 2, c);
        px(ctx, x - 2, LEG_Y, w + 4, 5, c);
        px(ctx, x - 2, LEG_Y, w + 4, 1, luz);
        px(ctx, x - 2, LEG_Y + 4, w + 4, 1, sombra);
        break;
      case 'regata':
        px(ctx, x, y, 3, 4, look.skin);
        px(ctx, x + w - 3, y, 3, 4, shade(look.skin, -0.12));
        px(ctx, x + 3, y, w - 6, 1, luz);
        break;
      case 'jaleco':
        px(ctx, x, y, w, h, '#eff3f9');
        px(ctx, x, y, w, 1, '#ffffff');
        px(ctx, x + w - 2, y, 2, h, '#ccd5e1');
        px(ctx, x + Math.floor(w / 2) - 1, y, 2, h, '#dae1ea');
        px(ctx, x + 1, y + 1, 3, 2, c);
        break;
      case 'uniforme':
        px(ctx, x, y + 3, w, 1, look.detail);
        if (dir !== 'up') {
          px(ctx, x + Math.floor(w / 2) - 2, y, 4, 3, shade(c, 0.3));
          px(ctx, x + Math.floor(w / 2), y, 1, 3, sombra);
        }
        break;
      default:
        px(ctx, x, y + 3, w, 1, shade(c, -0.08));
        break;
    }
  }

  // ------------------------------------------------------------------ bracos ---

  function drawArms(ctx, look, dir, frame) {
    const m = metrics(look.body);
    const semManga = look.outfit === 'regata' || look.outfit === 'vestido';
    const manga = look.outfit === 'jaleco' ? '#eff3f9' : look.shirt;
    const costura = shade(look.outfit === 'jaleco' ? '#eff3f9' : look.shirt, -0.5);
    const balanco = frame === 1 ? 1 : 0;
    const mao = look.skin;
    const maoSombra = shade(look.skin, -0.24);
    const y = TORSO_Y + 1;

    if (dir === 'left' || dir === 'right') {
      px(ctx, 14, y + balanco, 4, 4, semManga ? mao : manga);
      px(ctx, 14, y + 4 + balanco, 4, 3, mao);
      px(ctx, 14, y + 6 + balanco, 4, 1, maoSombra);
      px(ctx, 14, y + balanco, 1, 7, costura);
      return;
    }

    // braco esquerdo: manga, mao e a costura que separa do torso
    px(ctx, m.armL, y + balanco, 3, 4, semManga ? mao : manga);
    px(ctx, m.armL, y + 4 + balanco, 3, 3, mao);
    px(ctx, m.armL, y + 6 + balanco, 3, 1, maoSombra);
    px(ctx, m.tx, y, 1, 7, costura);

    // braco direito (lado sombreado)
    px(ctx, m.armR, y - balanco, 3, 4, semManga ? maoSombra : shade(manga, -0.18));
    px(ctx, m.armR, y + 4 - balanco, 3, 3, mao);
    px(ctx, m.armR, y + 6 - balanco, 3, 1, maoSombra);
    px(ctx, m.tx + m.tw - 1, y, 1, 7, costura);
  }

  // ------------------------------------------------------------------ cabeca ---

  function drawHead(ctx, look, dir) {
    const s = look.skin;
    const sombra = shade(s, -0.16);
    const luz = shade(s, 0.1);
    const { x, y, w, h } = HEAD;

    // silhueta com cantos suavizados
    px(ctx, x + 2, y, w - 4, 1, s);
    px(ctx, x + 1, y + 1, w - 2, 1, s);
    px(ctx, x, y + 2, w, h - 4, s);
    px(ctx, x + 1, y + h - 2, w - 2, 1, s);
    px(ctx, x + 2, y + h - 1, w - 4, 1, s);

    if (dir === 'left' || dir === 'right') {
      px(ctx, x + w - 3, y + 2, 3, h - 5, sombra);
      px(ctx, x + 1, y + 2, w - 6, 1, luz);
      px(ctx, x + 1, y + 6, 2, 3, sombra);              // orelha
      px(ctx, x + 4, NECK_Y, 6, 1, s);
      px(ctx, x + 4, NECK_Y, 6, 1, sombra);
      return;
    }

    px(ctx, x + w - 2, y + 2, 2, h - 4, sombra);
    px(ctx, x + 2, y + 2, w - 7, 1, luz);
    px(ctx, x - 1, y + 6, 1, 3, s);                     // orelhas
    px(ctx, x + w, y + 6, 1, 3, sombra);
    px(ctx, x + 5, NECK_Y, 4, 1, sombra);               // pescoco curto
  }

  function drawFace(ctx, look, dir) {
    if (dir === 'up') return;
    const escuro = '#2a2233';
    const branco = '#fbfcfe';
    const { x, y, w } = HEAD;
    const olhoY = y + 6;

    if (dir === 'left' || dir === 'right') {
      px(ctx, x + w - 6, olhoY, 4, 4, branco);
      px(ctx, x + w - 5, olhoY + 1, 3, 3, escuro);
      px(ctx, x + w - 5, olhoY + 1, 1, 1, branco);
      px(ctx, x + w - 6, y + 3, 4, 1, shade(look.hair, -0.2));
      px(ctx, x + w - 5, y + 11, 3, 1, shade(look.skin, -0.42));
      px(ctx, x + w - 7, y + 9, 2, 1, shade(look.skin, -0.14));
      return;
    }

    // olhos grandes, com brilho
    px(ctx, x + 2, olhoY, 4, 4, branco);
    px(ctx, x + w - 6, olhoY, 4, 4, branco);
    px(ctx, x + 3, olhoY + 1, 3, 3, escuro);
    px(ctx, x + w - 6, olhoY + 1, 3, 3, escuro);
    px(ctx, x + 3, olhoY + 1, 1, 1, branco);
    px(ctx, x + w - 6, olhoY + 1, 1, 1, branco);
    // sobrancelhas
    px(ctx, x + 2, y + 3, 4, 1, shade(look.hair, -0.2));
    px(ctx, x + w - 6, y + 3, 4, 1, shade(look.hair, -0.2));
    // boca e bochechas
    px(ctx, x + 6, y + 11, 3, 1, shade(look.skin, -0.42));
    px(ctx, x + 1, y + 9, 2, 1, shade(look.skin, -0.14));
    px(ctx, x + w - 3, y + 9, 2, 1, shade(look.skin, -0.14));
  }

  // ------------------------------------------------------------------ cabelo ---

  function drawHair(ctx, look, dir) {
    const c = look.hair;
    const luz = shade(c, 0.26);
    const escuro = shade(c, -0.3);
    const { x, y, w, h } = HEAD;
    const atras = dir === 'up';
    const lateral = dir === 'left' || dir === 'right';

    /**
     * Moldura do rosto: topo arredondado, franja e as laterais descendo ate a
     * altura das orelhas. Sem as laterais o cabelo vira touca de natacao.
     */
    function moldura(franja, lados) {
      px(ctx, x + 2, y - 1, w - 4, 1, c);
      px(ctx, x + 1, y, w - 2, 1, c);
      px(ctx, x, y + 1, w, franja, c);
      px(ctx, x + w - 2, y, 2, franja + 1, escuro);
      px(ctx, x + 2, y, 3, 1, luz);
      px(ctx, x + 1, y + 1, 2, 1, luz);
      // costeletas
      px(ctx, x, y + 1 + franja, 2, lados, c);
      px(ctx, x + w - 2, y + 1 + franja, 2, lados, escuro);
      // sombra que o cabelo joga na testa
      if (!atras) px(ctx, x + 2, y + 1 + franja, w - 4, 1, shade(look.skin, -0.2));
      // de costas o cabelo cobre a cabeca inteira
      if (atras) px(ctx, x, y + 1, w, h - 1, c);
    }

    switch (look.hairstyle) {
      case 'raspado':
        px(ctx, x + 2, y - 1, w - 4, 1, shade(c, 0.08));
        px(ctx, x + 1, y, w - 2, 2, shade(c, 0.08));
        px(ctx, x, y + 2, w, 2, shade(c, 0.02));
        px(ctx, x + w - 2, y, 2, 4, escuro);
        px(ctx, x, y + 4, 1, 4, c);
        px(ctx, x + w - 1, y + 4, 1, 4, escuro);
        if (atras) px(ctx, x, y + 1, w, h - 3, shade(c, 0.02));
        break;

      case 'moicano':
        px(ctx, x, y + 1, w, 2, escuro);
        px(ctx, x, y + 3, 1, 4, escuro);
        px(ctx, x + w - 1, y + 3, 1, 4, escuro);
        px(ctx, x + 4, y - 5, 4, 8, c);
        px(ctx, x + 5, y - 6, 2, 1, luz);
        px(ctx, x + 7, y - 5, 1, 8, escuro);
        break;

      case 'medio':
        moldura(3, 7);
        px(ctx, x - 1, y + 4, 1, 7, c);
        px(ctx, x + w, y + 4, 1, 7, escuro);
        break;

      case 'longo':
        moldura(3, 9);
        px(ctx, x - 2, y + 4, 3, 15, c);
        px(ctx, x + w - 1, y + 4, 3, 15, escuro);
        px(ctx, x - 2, y + 17, 3, 2, escuro);
        break;

      case 'cacheado':
        // massa volumosa, maior que a cabeca
        px(ctx, x - 1, y - 3, w + 2, 6, c);
        px(ctx, x - 3, y - 1, 3, 9, c);
        px(ctx, x + w, y - 1, 3, 9, escuro);
        px(ctx, x, y - 5, 4, 3, c);
        px(ctx, x + 4, y - 6, 5, 3, c);
        px(ctx, x + 8, y - 5, 4, 3, c);
        px(ctx, x - 1, y - 2, 3, 2, luz);
        px(ctx, x + 5, y - 4, 3, 1, luz);
        px(ctx, x, y + 3, 2, 5, c);
        px(ctx, x + w - 2, y + 3, 2, 5, escuro);
        if (!atras) px(ctx, x + 2, y + 3, w - 4, 1, shade(look.skin, -0.2));
        else px(ctx, x, y + 1, w, h - 1, c);
        break;

      case 'coque':
        moldura(3, 6);
        px(ctx, x + 3, y - 6, 6, 5, c);
        px(ctx, x + 4, y - 6, 2, 2, luz);
        px(ctx, x + 7, y - 5, 2, 4, escuro);
        break;

      case 'rabo':
        moldura(3, 6);
        if (lateral) px(ctx, x - 5, y + 4, 5, 12, c);
        else if (atras) px(ctx, x + 3, y + 5, 6, 15, c);
        else px(ctx, x + w, y + 5, 3, 11, escuro);
        break;

      default: // curto
        moldura(3, 5);
        break;
    }
  }

  // ------------------------------------------------------------- acessorios ---

  function drawFaceAccessory(ctx, look, dir) {
    if (dir === 'up' || look.face === 'nenhum') return;
    const lateral = dir === 'left' || dir === 'right';
    const { x, y, w } = HEAD;
    const olhoY = y + 6;

    switch (look.face) {
      case 'oculos': {
        // so a armacao: as lentes ficam vazadas para o olhar continuar visivel
        const aro = '#2f3544';
        if (lateral) {
          px(ctx, x + w - 7, olhoY - 1, 6, 1, aro);
          px(ctx, x + w - 7, olhoY + 4, 6, 1, aro);
          px(ctx, x + w - 7, olhoY, 1, 4, aro);
          px(ctx, x + w - 2, olhoY, 1, 4, aro);
          px(ctx, x + w - 6, olhoY, 1, 1, 'rgba(255,255,255,.55)');
        } else {
          for (const lente of [x + 1, x + w - 6]) {
            px(ctx, lente, olhoY - 1, 5, 1, aro);
            px(ctx, lente, olhoY + 4, 5, 1, aro);
            px(ctx, lente, olhoY, 1, 4, aro);
            px(ctx, lente + 4, olhoY, 1, 4, aro);
            px(ctx, lente + 1, olhoY, 1, 1, 'rgba(255,255,255,.5)');
          }
          px(ctx, x + 6, olhoY, 1, 1, aro);        // ponte
          px(ctx, x - 1, olhoY, 1, 1, aro);        // hastes
          px(ctx, x + w, olhoY, 1, 1, aro);
        }
        break;
      }

      case 'oculos-escuros':
        if (lateral) px(ctx, x + w - 7, olhoY - 1, 7, 5, '#1b2029');
        else {
          px(ctx, x + 1, olhoY - 1, 5, 5, '#1b2029');
          px(ctx, x + w - 6, olhoY - 1, 5, 5, '#1b2029');
          px(ctx, x + 6, olhoY, 1, 2, '#1b2029');
          px(ctx, x + 2, olhoY, 2, 1, '#49566e');
          px(ctx, x + w - 5, olhoY, 2, 1, '#49566e');
        }
        break;

      case 'mascara':
        // cobre nariz e boca, abaixo dos olhos
        if (lateral) {
          px(ctx, x + w - 8, olhoY + 4, 8, 5, '#e8effa');
          px(ctx, x + w - 8, olhoY + 4, 8, 1, '#c2d1e2');
        } else {
          px(ctx, x - 1, olhoY + 4, w + 2, 5, '#e8effa');
          px(ctx, x - 1, olhoY + 4, w + 2, 1, '#c2d1e2');
          px(ctx, x - 1, olhoY + 6, w + 2, 1, '#d5e0ee');
          px(ctx, x - 2, olhoY + 4, 1, 3, '#c2d1e2');
          px(ctx, x + w + 1, olhoY + 4, 1, 3, '#c2d1e2');
        }
        break;

      case 'antifaz': {
        // faixa nos olhos com recortes: da para ver o olhar por dentro
        const c = look.detail;
        if (lateral) {
          px(ctx, x + w - 8, olhoY - 2, 8, 6, c);
          px(ctx, x + w - 6, olhoY + 1, 3, 3, '#12151f');
        } else {
          px(ctx, x - 1, olhoY - 2, w + 2, 6, c);
          px(ctx, x - 1, olhoY - 2, w + 2, 1, shade(c, 0.3));
          px(ctx, x + 1, olhoY, 5, 4, '#12151f');
          px(ctx, x + w - 6, olhoY, 5, 4, '#12151f');
          px(ctx, x + 2, olhoY + 1, 3, 2, '#fbfcfe');
          px(ctx, x + w - 5, olhoY + 1, 3, 2, '#fbfcfe');
          px(ctx, x + 3, olhoY + 1, 2, 2, '#2a2233');
          px(ctx, x + w - 5, olhoY + 1, 2, 2, '#2a2233');
        }
        break;
      }

      case 'mascara-festa': {
        const dourado = '#c9a227';
        if (lateral) {
          px(ctx, x + w - 8, olhoY - 3, 8, 7, dourado);
          px(ctx, x + w - 6, olhoY, 3, 3, '#12151f');
        } else {
          px(ctx, x - 1, olhoY - 3, w + 2, 7, dourado);
          px(ctx, x - 3, olhoY - 4, 4, 3, '#e6c65a');
          px(ctx, x + w - 1, olhoY - 4, 4, 3, '#e6c65a');
          px(ctx, x + 1, olhoY, 5, 4, '#12151f');
          px(ctx, x + w - 6, olhoY, 5, 4, '#12151f');
          px(ctx, x + 2, olhoY + 1, 3, 2, '#fbfcfe');
          px(ctx, x + w - 5, olhoY + 1, 3, 2, '#fbfcfe');
          px(ctx, x + 3, olhoY + 1, 2, 2, '#2a2233');
          px(ctx, x + w - 5, olhoY + 1, 2, 2, '#2a2233');
          px(ctx, x + 5, olhoY - 2, 3, 1, '#f7e28a');
        }
        break;
      }

      case 'barba':
        if (lateral) {
          px(ctx, x + w - 8, olhoY + 4, 8, 5, look.hair);
          px(ctx, x + w - 7, olhoY + 8, 6, 1, shade(look.hair, -0.25));
        } else {
          px(ctx, x - 1, olhoY + 4, w + 2, 3, look.hair);
          px(ctx, x, olhoY + 7, w, 2, look.hair);
          px(ctx, x + 4, olhoY + 5, 4, 1, shade(look.skin, -0.42));
        }
        break;

      case 'bigode':
        if (lateral) px(ctx, x + w - 7, olhoY + 4, 5, 2, look.hair);
        else px(ctx, x + 3, olhoY + 4, w - 6, 2, look.hair);
        break;

      default:
        break;
    }
  }

  function drawHeadAccessory(ctx, look, dir) {
    if (look.head === 'nenhum') return;
    const { x, y, w } = HEAD;
    const c = look.detail;
    const lateral = dir === 'left' || dir === 'right';

    switch (look.head) {
      case 'bone':
        px(ctx, x, y - 3, w, 5, c);
        px(ctx, x + 2, y - 4, w - 4, 1, shade(c, 0.2));
        px(ctx, x + w - 3, y - 3, 3, 5, shade(c, -0.22));
        if (dir === 'down') px(ctx, x - 2, y + 2, w + 4, 2, shade(c, -0.3));
        else if (lateral) px(ctx, x - 6, y + 2, 7, 2, shade(c, -0.3));
        else px(ctx, x + 5, y - 6, 5, 3, shade(c, -0.3));
        break;

      case 'chapeu':
        px(ctx, x - 5, y, w + 10, 2, shade(c, -0.32));
        px(ctx, x - 5, y, w + 10, 1, shade(c, -0.12));
        px(ctx, x + 1, y - 6, w - 2, 6, c);
        px(ctx, x + 1, y - 2, w - 2, 2, shade(c, -0.42));
        px(ctx, x + 2, y - 6, 4, 1, shade(c, 0.24));
        px(ctx, x + w - 3, y - 6, 2, 6, shade(c, -0.22));
        break;

      case 'gorro':
        px(ctx, x, y - 5, w, 7, c);
        px(ctx, x, y + 1, w, 3, shade(c, 0.22));
        px(ctx, x + 5, y - 8, 5, 3, shade(c, 0.3));
        px(ctx, x + w - 3, y - 5, 3, 7, shade(c, -0.22));
        break;

      case 'fone':
        px(ctx, x + 1, y - 3, w - 2, 3, '#2b3040');
        px(ctx, x + 3, y - 4, w - 6, 1, '#3d4557');
        if (lateral) {
          px(ctx, x + 1, y + 4, 4, 6, '#2b3040');
          px(ctx, x + 2, y + 5, 3, 4, c);
        } else {
          px(ctx, x - 3, y + 4, 4, 6, '#2b3040');
          px(ctx, x + w - 1, y + 4, 4, 6, '#2b3040');
          px(ctx, x - 2, y + 5, 2, 4, c);
          px(ctx, x + w, y + 5, 2, 4, shade(c, -0.15));
        }
        break;

      case 'bandana':
        px(ctx, x, y + 2, w, 3, c);
        px(ctx, x, y + 2, w, 1, shade(c, 0.28));
        px(ctx, x + w - 2, y + 2, 2, 3, shade(c, -0.22));
        if (!lateral) px(ctx, x + w, y + 3, 4, 6, shade(c, -0.15));
        break;

      case 'laco':
        px(ctx, x + 1, y - 3, 4, 4, c);
        px(ctx, x + 6, y - 3, 4, 4, c);
        px(ctx, x + 5, y - 2, 1, 2, shade(c, -0.3));
        px(ctx, x + 2, y - 2, 2, 1, shade(c, 0.3));
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------- montagem ---

  const cache = new Map();

  function chaveDe(look, dir, frame) {
    return [
      look.body, look.skin, look.hair, look.hairstyle, look.outfit,
      look.shirt, look.pants, look.detail, look.face, look.head, dir, frame,
    ].join('|');
  }

  function draw(ctx, lookBruto, dir, frame) {
    const look = normalize(lookBruto);
    const d = ['up', 'down', 'left', 'right'].includes(dir) ? dir : 'down';
    const espelhar = d === 'left';
    const alvo = espelhar ? 'right' : d;

    ctx.save();
    if (espelhar) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    drawLegs(ctx, look, alvo, frame);
    drawTorso(ctx, look, alvo);
    drawArms(ctx, look, alvo, frame);
    drawHead(ctx, look, alvo);
    drawFace(ctx, look, alvo);
    drawHair(ctx, look, alvo);
    drawFaceAccessory(ctx, look, alvo);
    drawHeadAccessory(ctx, look, alvo);
    ctx.restore();
  }

  /**
   * Contorno escuro em volta da silhueta - o traco grosso que faz o
   * personagem descolar do piso. Feito lendo os pixels ja desenhados.
   */
  function contornar(ctx, espessura) {
    let imagem;
    try {
      imagem = ctx.getImageData(0, 0, W, H);
    } catch (err) {
      return; // canvas simulado nos testes; o contorno e so estetico
    }
    if (!imagem || !imagem.data) return;

    for (let passo = 0; passo < (espessura || 1); passo++) {
      const origem = imagem.data;
      const saida = new Uint8ClampedArray(origem);
      const opaco = (x, y) => (
        x >= 0 && y >= 0 && x < W && y < H && origem[(y * W + x) * 4 + 3] > 40
      );
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (origem[i + 3] > 40) continue;
          if (!opaco(x - 1, y) && !opaco(x + 1, y) && !opaco(x, y - 1) && !opaco(x, y + 1)) continue;
          saida[i] = OUTLINE[0];
          saida[i + 1] = OUTLINE[1];
          saida[i + 2] = OUTLINE[2];
          saida[i + 3] = 255;
        }
      }
      imagem.data.set(saida);
    }
    ctx.putImageData(imagem, 0, 0);
  }

  /** Canvas 48x64 com o personagem pronto (com cache). */
  function sprite(lookBruto, dir, frame) {
    const look = normalize(lookBruto);
    const chave = chaveDe(look, dir, frame);
    const pronto = cache.get(chave);
    if (pronto) return pronto;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    draw(ctx, look, dir, frame);
    contornar(ctx, 2);

    if (cache.size > 400) cache.clear();
    cache.set(chave, canvas);
    return canvas;
  }

  /** Um look aleatorio, para o botao "surpresa" do criador. */
  function random() {
    const pega = (lista) => lista[Math.floor(Math.random() * lista.length)];
    return {
      body: pega(OPTIONS.body).id,
      skin: pega(PALETTES.skin),
      hair: pega(PALETTES.hair),
      hairstyle: pega(OPTIONS.hairstyle).id,
      outfit: pega(OPTIONS.outfit).id,
      shirt: pega(PALETTES.shirt),
      pants: pega(PALETTES.pants),
      detail: pega(PALETTES.detail),
      face: Math.random() < 0.5 ? 'nenhum' : pega(OPTIONS.face).id,
      head: Math.random() < 0.6 ? 'nenhum' : pega(OPTIONS.head).id,
    };
  }

  VO.avatar = {
    ART_W, ART_H, SCALE, W, H, FOOT_OFFSET,
    OPTIONS, PALETTES, DEFAULT_LOOK,
    normalize, draw, sprite, random, shade,
  };
})();
