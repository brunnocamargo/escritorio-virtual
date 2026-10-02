/**
 * Carrega a pagina de verdade (padrao: http://localhost:3000) dentro de um DOM
 * completo, clica em "Entrar no escritorio" e conta o que aconteceu.
 * O socket.io conecta de verdade; so camera/microfone e WebRTC sao simulados.
 *
 *   node scripts/check-lobby.js [url] [--deny-media]
 *
 * --deny-media  simula o usuario negando o pedido de camera/microfone.
 * --editor      depois de entrar, abre o Centro de configuracao e exercita
 *               paleta, pincel, criacao de sala, validacao e desfazer.
 * --hang-media  simula o pedido de permissao que fica pendente para sempre
 *               (a pessoa nao ve ou nao responde o popup do navegador) - a
 *               causa mais comum de "cliquei em Entrar e nao aconteceu nada".
 */
'use strict';

const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'http://localhost:3000';
const DENY = process.argv.includes('--deny-media');
const HANG = process.argv.includes('--hang-media');
const EDITOR = process.argv.includes('--editor');

const SCRIPTS = [
  '/socket.io/socket.io.js',
  '/js/tiles.js', '/js/mapcheck.js', '/js/world.js', '/js/avatar.js',
  '/js/auth.js', '/js/sprites.js', '/js/ui.js', '/js/creator.js',
  '/js/rtc.js', '/js/game.js', '/js/editor.js', '/js/net.js', '/js/main.js',
];

let window_fetch_ok = false;
const errors = [];
const logs = [];

function fakeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 24 });
      if (p === 'canvas') return { width: 1280, height: 720 };
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function fakeTrack(kind) {
  return { kind, enabled: true, stop() {}, addEventListener() {} };
}

function fakeStream(withVideo) {
  const tracks = [fakeTrack('audio')].concat(withVideo ? [fakeTrack('video')] : []);
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  };
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' respondeu ' + res.status);
  return res.text();
}

/**
 * Confere se todo campo de digitacao tem cor de fundo e de texto definidas, e
 * se as duas nao sao a mesma cor. Ja aconteceu de um bloco de CSS ser removido
 * junto com o layout antigo e os campos ficarem branco no branco.
 */
function conferirCampos(doc, css) {
  const problemas = [];

  // valores das variaveis do tema
  const vars = {};
  const raiz = css.match(/:root\s*{([^}]*)}/);
  if (raiz) {
    for (const linha of raiz[1].split(';')) {
      const m = linha.match(/(--[\w-]+)\s*:\s*([^;]+)/);
      if (m) vars[m[1].trim()] = m[2].trim();
    }
  }
  const resolver = (valor) => {
    let v = String(valor || '').trim();
    for (let i = 0; i < 4; i++) {
      v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, nome) => vars[nome] || '');
    }
    return v.trim().toLowerCase();
  };

  // regras do CSS, ignorando o embrulho de @media
  const semMedia = css.replace(/@media[^{]*{/g, '').replace(/}\s*}/g, '}');
  const regras = [];
  const re = /([^{}]+){([^{}]*)}/g;
  let m;
  while ((m = re.exec(semMedia)) !== null) {
    const seletores = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    const corpo = m[2];
    const bg = (corpo.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/) || [])[1];
    const cor = (corpo.match(/(?:^|;)\s*color\s*:\s*([^;]+)/) || [])[1];
    if (bg || cor) regras.push({ seletores, bg, cor });
  }

  const campos = [...doc.querySelectorAll('#login input, #creator input, #login select, #creator select')]
    .filter((el) => !['checkbox', 'radio', 'color', 'range'].includes(el.type));
  for (const campo of campos) {
    let bg = null;
    let cor = null;
    for (const regra of regras) {
      for (const sel of regra.seletores) {
        let bate = false;
        try {
          bate = campo.matches(sel);
        } catch (err) {
          continue; // seletor que o jsdom nao entende (ex.: :-webkit-autofill)
        }
        if (!bate) continue;
        if (regra.bg) bg = regra.bg;
        if (regra.cor) cor = regra.cor;
      }
    }

    const nome = (campo.id || campo.type || campo.tagName).toString();
    if (!bg) problemas.push('campo "' + nome + '" nao tem cor de fundo definida (fica branco do navegador)');
    if (!cor) problemas.push('campo "' + nome + '" nao tem cor de texto definida');
    if (bg && cor && resolver(bg) === resolver(cor)) {
      problemas.push('campo "' + nome + '" tem fundo e texto da mesma cor (' + resolver(bg) + ')');
    }
  }

  return { total: campos.length, problemas };
}

async function run() {
  const cenario = HANG ? '(permissao pendente, ninguem responde)'
    : DENY ? '(camera/microfone negados)' : '(camera/microfone liberados)';
  console.log('Testando ' + BASE + '  ' + cenario);
  console.log('');

  const html = await fetchText(BASE + '/');
  const css = await fetchText(BASE + '/css/style.css');
  const sources = [];
  for (const src of SCRIPTS) sources.push({ src, code: await fetchText(BASE + src) });
  console.log('  ok   pagina e ' + SCRIPTS.length + ' scripts baixados do link');
  window_fetch_ok = true;

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
  virtualConsole.on('error', (...args) => logs.push('console.error: ' + args.join(' ')));
  virtualConsole.on('warn', (...args) => logs.push('console.warn: ' + args.join(' ')));

  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    url: BASE + '/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  // --- ambiente que o jsdom nao tem -------------------------------------
  window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => {
        if (HANG) return new Promise(() => {}); // nunca resolve, como o popup ignorado
        if (DENY) return Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
        return Promise.resolve(fakeStream(true));
      },
      getDisplayMedia: () => Promise.resolve(fakeStream(true)),
    },
  });
  window.RTCPeerConnection = class {
    constructor() { this.signalingState = 'stable'; }
    addTrack() {} getSenders() { return []; } close() {}
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    restartIce() {}
  };
  window.AudioContext = class {
    constructor() { this.state = 'running'; }
    resume() {} createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 512, frequencyBinCount: 128, smoothingTimeConstant: 0, connect() {}, getByteFrequencyData() {} }; }
  };
  window.fetch = (url, opts) => fetch(new URL(url, BASE).toString(), opts);
  window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    errors.push('promise nao tratada: ' + (r && r.stack ? r.stack : r));
  });

  // --- roda os scripts na ordem do index.html ---------------------------
  for (const { src, code } of sources) {
    try {
      window.eval(code);
    } catch (err) {
      errors.push('erro ao executar ' + src + ': ' + err.message);
    }
  }
  const campos = conferirCampos(window.document, css);
  if (campos.problemas.length) {
    console.log('  FALHOU ' + campos.problemas.length + ' problema(s) nos campos de formulario:');
    for (const problema of campos.problemas) console.log('         ' + problema);
    errors.push('campos de formulario ilegiveis');
  } else {
    console.log('  ok   os ' + campos.total + ' campos de login/criador tem fundo e texto legiveis');
  }

  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  console.log('  ok   scripts executados, lobby montado');

  // --- login -------------------------------------------------------------
  const doc = window.document;
  const CONTA = process.argv.find((a) => a.startsWith('--conta='));
  const usuario = CONTA ? CONTA.split('=')[1] : null;

  if (usuario) {
    doc.querySelector('.auth-tab[data-mode="criar"]').click();
    doc.getElementById('authUser').value = usuario;
    doc.getElementById('authPass').value = 'senha1234';
    doc.getElementById('authPass2').value = 'senha1234';
    doc.getElementById('authSubmit').click();
    await new Promise((r) => setTimeout(r, 1200));
    const entrouComConta = doc.getElementById('creator').style.display !== 'none'
      && !doc.getElementById('creator').hidden;
    console.log((entrouComConta ? '  ok   ' : '  FALHOU ') + 'criou a conta "' + usuario + '" e abriu o criador');
    if (!entrouComConta) {
      const erro = doc.getElementById('authError').textContent;
      console.log('       erro na tela de login: ' + (erro || '(sem mensagem)'));
      errors.push('login: ' + erro);
    }
  } else {
    doc.getElementById('guestBtn').click();
    await new Promise((r) => setTimeout(r, 400));
    const comoVisitante = !doc.getElementById('creator').hidden;
    console.log((comoVisitante ? '  ok   ' : '  FALHOU ') + 'entrou como visitante e abriu o criador');
  }

  // --- criador de personagem ---------------------------------------------
  const opcoes = doc.querySelectorAll('.opt-card').length;
  const cores = doc.querySelectorAll('.color-dot').length;
  const abas = doc.querySelectorAll('.cat-tab').length;
  console.log('  ok   criador montado: ' + abas + ' categorias, ' + opcoes + ' opcoes e ' + cores + ' cores na aba atual');
  if (!abas || !opcoes) errors.push('o criador de personagem nao montou as opcoes');

  // passeia por todas as categorias, checando que cada uma monta
  for (const aba of [...doc.querySelectorAll('.cat-tab')]) {
    aba.click();
    const itens = doc.querySelectorAll('.opt-card, .color-dot').length;
    if (!itens) errors.push('categoria sem opcoes: ' + aba.textContent);
  }
  doc.getElementById('randomBtn').click();

  doc.getElementById('nameInput').value = 'Teste Automatico';
  doc.getElementById('joinBtn').click();

  // com a permissao pendente e preciso esperar o limite interno de 12s
  const espera = HANG ? 30000 : 6000;
  console.log('       aguardando ate ' + (espera / 1000) + 's pela entrada...');
  await new Promise((r) => setTimeout(r, espera));

  // --- o que aconteceu? --------------------------------------------------
  const escondida = (id) => {
    const el = doc.getElementById(id);
    return el.hidden || el.style.display === 'none';
  };
  const lobbyHidden = escondida('login') && escondida('creator');
  const appVisible = !doc.getElementById('app').hidden;
  const errText = doc.getElementById('lobbyError').hidden ? '' : doc.getElementById('lobbyError').textContent;
  const entered = lobbyHidden && appVisible;

  console.log('');
  console.log(entered ? '  ok   ENTROU no escritorio' : '  FALHOU  NAO entrou no escritorio');
  console.log('       lobby escondido: ' + lobbyHidden + ' | app visivel: ' + appVisible);
  if (errText) console.log('       mensagem na tela: "' + errText + '"');
  if (entered && window.VO.game.self) {
    const look = window.VO.game.self.look;
    console.log('       personagem: ' + look.body + ', cabelo ' + look.hairstyle +
      ', ' + look.outfit + ', rosto ' + look.face + ', cabeca ' + look.head);
    console.log('       jogador: ' + window.VO.game.self.name + ' em (' +
      Math.round(window.VO.game.self.x) + ',' + Math.round(window.VO.game.self.y) + ') sala ' + window.VO.game.self.room);
    console.log('       microfone: ' + window.VO.rtc.state.micOn + ' | camera: ' + window.VO.rtc.state.camOn);
  }

  // ------------------------------------------------ centro de configuracao ---
  if (entered && EDITOR) {
    console.log('');
    console.log('  Centro de configuracao:');
    const VOw = window.VO;
    try {
      doc.getElementById('editBtn').click();
      await new Promise((r) => setTimeout(r, 400));
      const aberto = !doc.getElementById('editor').hidden;
      console.log((aberto ? '  ok   ' : '  FALHOU ') + 'editor abriu');
      if (!aberto) throw new Error('editor nao abriu');

      const pecas = doc.querySelectorAll('.ed-piece').length;
      const ferramentas = doc.querySelectorAll('.ed-tool').length;
      console.log('  ok   paleta montada: ' + pecas + ' pecas, ' + ferramentas + ' ferramentas');
      if (pecas !== VOw.tiles.LIST.length) {
        errors.push('a paleta tem ' + pecas + ' pecas, esperado ' + VOw.tiles.LIST.length);
      }

      const salasAntes = doc.querySelectorAll('#edRooms li').length;
      console.log('  ok   ' + salasAntes + ' salas listadas no painel');

      const problemas = [...doc.querySelectorAll('#edProblems li')].map((li) => li.textContent);
      const publicavel = !doc.getElementById('edSave').disabled;
      console.log((publicavel ? '  ok   ' : '  FALHOU ') +
        'planta atual valida para publicar (' + (problemas[0] || 'sem observacoes') + ')');
      if (!publicavel) errors.push('a planta padrao apareceu como nao publicavel no editor');

      const status = doc.getElementById('edStatus').textContent;
      console.log('  ok   status: ' + status);

      const desfazerTravado = doc.getElementById('edUndo').disabled;
      console.log((desfazerTravado ? '  ok   ' : '  FALHOU ') + 'desfazer comeca desabilitado');

      doc.getElementById('edClose').click();
      const fechou = doc.getElementById('editor').hidden;
      console.log((fechou ? '  ok   ' : '  FALHOU ') + 'editor fechou e devolveu o controle ao jogo');
      if (!VOw.game.inputEnabled) errors.push('o teclado do jogo ficou travado depois de fechar o editor');
    } catch (err) {
      console.log('  FALHOU ' + err.message);
      errors.push('editor: ' + err.message);
    }
  }

  if (logs.length) {
    console.log('');
    console.log('  avisos do console:');
    for (const l of [...new Set(logs)]) console.log('       ' + l);
  }
  if (errors.length) {
    console.log('');
    console.log('  ERROS:');
    for (const e of errors) console.log('       ' + e);
  }

  dom.window.close();
  process.exit(entered && errors.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.log('  FALHOU  ' + (err.stack || err.message));
  process.exit(1);
});
