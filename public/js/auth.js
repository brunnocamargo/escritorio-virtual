/**
 * auth.js - tela de login e a sessao da pessoa.
 *
 * A sessao e um token assinado pelo servidor, guardado no localStorage. Quem
 * entra como visitante nao tem conta: o personagem vale so para aquela visita.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});

  const $ = (sel) => document.querySelector(sel);
  const CHAVE_TOKEN = 'vo:token';

  const auth = {
    token: localStorage.getItem(CHAVE_TOKEN) || null,
    conta: null,          // { usuario, perfil, historico } ou null se visitante
    visitante: false,
  };

  // ------------------------------------------------------------------- API ---

  async function chamar(caminho, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers);
    if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
    const res = await fetch(caminho, Object.assign({}, options, { headers }));
    let corpo = {};
    try {
      corpo = await res.json();
    } catch (err) {
      corpo = {};
    }
    if (!res.ok) throw new Error(corpo.error || 'Falha na comunicacao com o servidor.');
    return corpo;
  }

  function guardarSessao(resposta) {
    auth.token = resposta.token;
    auth.conta = resposta.conta;
    auth.visitante = false;
    localStorage.setItem(CHAVE_TOKEN, auth.token);
    return auth.conta;
  }

  const registrar = (usuario, senha, perfil) =>
    chamar('/api/auth/register', { method: 'POST', body: JSON.stringify({ usuario, senha, perfil }) })
      .then(guardarSessao);

  const entrar = (usuario, senha) =>
    chamar('/api/auth/login', { method: 'POST', body: JSON.stringify({ usuario, senha }) })
      .then(guardarSessao);

  /** Reaproveita o token salvo, se ainda valer. */
  async function retomarSessao() {
    if (!auth.token) return null;
    try {
      const corpo = await chamar('/api/auth/me');
      auth.conta = corpo.conta;
      auth.visitante = false;
      return auth.conta;
    } catch (err) {
      sair();
      return null;
    }
  }

  async function salvarPerfil(perfil) {
    if (auth.visitante || !auth.token) return null;
    const corpo = await chamar('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ perfil }),
    });
    auth.conta = corpo.conta;
    return auth.conta;
  }

  async function limparHistorico() {
    if (auth.visitante || !auth.token) return null;
    const corpo = await chamar('/api/auth/history', { method: 'DELETE' });
    auth.conta = corpo.conta;
    return auth.conta;
  }

  function sair() {
    auth.token = null;
    auth.conta = null;
    auth.visitante = false;
    localStorage.removeItem(CHAVE_TOKEN);
  }

  // ------------------------------------------------------------------ tela ---

  let modo = 'entrar';
  let previewTimer = null;

  function mostrarErro(texto) {
    const el = $('#authError');
    el.textContent = texto;
    el.hidden = !texto;
  }

  function trocarModo(novo) {
    modo = novo;
    document.querySelectorAll('.auth-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === novo);
    });
    $('#authPass2Field').hidden = novo !== 'criar';
    $('#authSubmit').textContent = novo === 'criar' ? 'Criar conta e continuar' : 'Entrar';
    $('#authPass').autocomplete = novo === 'criar' ? 'new-password' : 'current-password';
    mostrarErro('');
  }

  /** Um personagem aleatorio girando no card, so para dar vida a tela. */
  function animarPreview() {
    const canvas = $('#authPreview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dirs = ['down', 'right', 'up', 'left'];
    let look = VO.avatar.random();
    let tick = 0;
    clearInterval(previewTimer);
    previewTimer = setInterval(() => {
      tick++;
      if (tick % 32 === 0) look = VO.avatar.random();
      const dir = dirs[Math.floor(tick / 8) % dirs.length];
      const frame = tick % 2;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sprite = VO.avatar.sprite(look, dir, frame);
      const escala = Math.floor(canvas.height / sprite.height);
      ctx.drawImage(
        sprite,
        Math.round((canvas.width - sprite.width * escala) / 2),
        Math.round((canvas.height - sprite.height * escala) / 2),
        sprite.width * escala,
        sprite.height * escala
      );
    }, 240);
  }

  function pararPreview() {
    clearInterval(previewTimer);
    previewTimer = null;
  }

  /**
   * Mostra a tela de login e resolve quando a pessoa entra (com conta ou como
   * visitante). Se ja houver sessao salva, passa direto.
   */
  async function telaDeLogin() {
    const salva = await retomarSessao();
    if (salva) {
      esconder();
      return salva;
    }

    animarPreview();
    trocarModo('entrar');
    $('#authUser').value = localStorage.getItem('vo:ultimoUsuario') || '';
    $('#authUser').focus();

    return new Promise((resolve) => {
      const finalizar = (conta) => {
        pararPreview();
        esconder();
        resolve(conta);
      };

      const enviar = async () => {
        const usuario = $('#authUser').value.trim();
        const senha = $('#authPass').value;
        mostrarErro('');
        if (!usuario || !senha) return mostrarErro('Preencha usuario e senha.');
        if (modo === 'criar' && !/^[A-Za-z0-9]+$/.test(senha)) {
          return mostrarErro('A senha deve usar apenas letras e numeros.');
        }
        if (modo === 'criar' && senha !== $('#authPass2').value) {
          return mostrarErro('As senhas nao sao iguais.');
        }

        const botao = $('#authSubmit');
        botao.disabled = true;
        const textoOriginal = botao.textContent;
        botao.textContent = modo === 'criar' ? 'Criando...' : 'Entrando...';
        try {
          const conta = modo === 'criar'
            ? await registrar(usuario, senha, { nome: usuario.split('@')[0], status: '', look: VO.avatar.random() })
            : await entrar(usuario, senha);
          localStorage.setItem('vo:ultimoUsuario', usuario);
          finalizar(conta);
        } catch (err) {
          mostrarErro(err.message);
          botao.disabled = false;
          botao.textContent = textoOriginal;
        }
      };

      document.querySelectorAll('.auth-tab').forEach((tab) => {
        tab.addEventListener('click', () => trocarModo(tab.dataset.mode));
      });
      $('#authSubmit').addEventListener('click', enviar);
      ['#authUser', '#authPass', '#authPass2'].forEach((sel) => {
        $(sel).addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') enviar();
        });
      });
      $('#guestBtn').addEventListener('click', () => {
        sair();
        auth.visitante = true;
        finalizar(null);
      });
    });
  }

  function esconder() {
    const tela = $('#login');
    tela.hidden = true;
    tela.style.display = 'none';
  }

  function mostrar() {
    const tela = $('#login');
    tela.hidden = false;
    tela.style.display = '';
    animarPreview();
  }

  VO.auth = {
    estado: auth,
    telaDeLogin,
    salvarPerfil,
    limparHistorico,
    sair,
    mostrar,
    esconder,
    get logado() { return !!auth.conta; },
    get token() { return auth.token; },
  };
})();
