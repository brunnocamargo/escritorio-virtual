/**
 * creator.js - o criador de personagem.
 *
 * Mostra o boneco girando e as opcoes divididas por categoria. Cada opcao tem
 * uma miniatura que ja mostra como fica no SEU personagem (nao um icone
 * generico), recortada na parte do corpo que aquela categoria muda.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});
  const $ = (sel) => document.querySelector(sel);

  const A = () => VO.avatar;

  // recorte da miniatura por categoria, em pixels do sprite (24x32)
  const RECORTES = {
    corpo: [0, 0, 24, 32],
    cabelo: [4, 0, 16, 16],
    roupa: [2, 10, 20, 17],
    rosto: [5, 1, 14, 14],
    acessorios: [3, 0, 18, 15],
  };

  const CATEGORIAS = [
    {
      id: 'corpo',
      label: 'Corpo',
      grupos: [
        { tipo: 'opcao', campo: 'body', titulo: 'Tipo de corpo' },
        { tipo: 'cor', campo: 'skin', titulo: 'Tom de pele', paleta: 'skin' },
      ],
    },
    {
      id: 'cabelo',
      label: 'Cabelo',
      grupos: [
        { tipo: 'opcao', campo: 'hairstyle', titulo: 'Corte' },
        { tipo: 'cor', campo: 'hair', titulo: 'Cor do cabelo', paleta: 'hair' },
      ],
    },
    {
      id: 'roupa',
      label: 'Roupa',
      grupos: [
        { tipo: 'opcao', campo: 'outfit', titulo: 'Peca' },
        { tipo: 'cor', campo: 'shirt', titulo: 'Cor principal', paleta: 'shirt' },
        { tipo: 'cor', campo: 'pants', titulo: 'Calca / saia', paleta: 'pants' },
      ],
    },
    {
      id: 'rosto',
      label: 'Rosto',
      grupos: [
        { tipo: 'opcao', campo: 'face', titulo: 'Oculos, mascaras e barba' },
      ],
    },
    {
      id: 'acessorios',
      label: 'Acessorios',
      grupos: [
        { tipo: 'opcao', campo: 'head', titulo: 'Cabeca' },
        { tipo: 'cor', campo: 'detail', titulo: 'Cor do acessorio', paleta: 'detail' },
      ],
    },
  ];

  const cr = {
    look: null,
    categoria: 'corpo',
    girando: true,
    dirIndex: 0,
    tick: 0,
    timer: null,
    conta: null,
  };

  // ------------------------------------------------------------- miniaturas ---

  function desenharRecorte(canvas, look, categoria, dir) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sprite = A().sprite(look, dir || 'down', 0);
    const [sx, sy, sw, sh] = RECORTES[categoria] || RECORTES.corpo;
    const escala = Math.min(canvas.width / sw, canvas.height / sh);
    const dw = Math.round(sw * escala);
    const dh = Math.round(sh * escala);
    ctx.drawImage(sprite, sx, sy, sw, sh, Math.round((canvas.width - dw) / 2), Math.round((canvas.height - dh) / 2), dw, dh);
  }

  // ------------------------------------------------------------------ preview ---

  function animarPreview() {
    const canvas = $('#creatorPreview');
    const ctx = canvas.getContext('2d');
    const dirs = ['down', 'right', 'up', 'left'];
    clearInterval(cr.timer);
    cr.timer = setInterval(() => {
      cr.tick++;
      if (cr.girando && cr.tick % 8 === 0) cr.dirIndex = (cr.dirIndex + 1) % dirs.length;
      const dir = dirs[cr.dirIndex];
      const frame = cr.tick % 2;
      const sprite = A().sprite(cr.look, dir, frame);
      const escala = Math.floor(canvas.height / sprite.height);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // chao de referencia
      ctx.fillStyle = 'rgba(0, 0, 0, .25)';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height - 24, 46, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.drawImage(
        sprite,
        Math.round((canvas.width - sprite.width * escala) / 2),
        Math.round(canvas.height - 18 - sprite.height * escala),
        sprite.width * escala,
        sprite.height * escala
      );
    }, 220);
  }

  // ------------------------------------------------------------------- abas ---

  function montarAbas() {
    const box = $('#catTabs');
    box.textContent = '';
    for (const cat of CATEGORIAS) {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (cat.id === cr.categoria ? ' active' : '');
      b.textContent = cat.label;
      b.addEventListener('click', () => {
        cr.categoria = cat.id;
        montarAbas();
        montarCategoria();
      });
      box.appendChild(b);
    }
  }

  function montarCategoria() {
    const cat = CATEGORIAS.find((c) => c.id === cr.categoria);
    const box = $('#catBody');
    box.textContent = '';

    for (const grupo of cat.grupos) {
      const bloco = document.createElement('div');
      bloco.className = 'opt-group';

      const titulo = document.createElement('span');
      titulo.className = 'opt-title';
      titulo.textContent = grupo.titulo;
      bloco.appendChild(titulo);

      if (grupo.tipo === 'opcao') {
        const grade = document.createElement('div');
        grade.className = 'opt-grid';
        for (const opcao of A().OPTIONS[grupo.campo]) {
          const b = document.createElement('button');
          b.className = 'opt-card' + (cr.look[grupo.campo] === opcao.id ? ' active' : '');
          const mini = document.createElement('canvas');
          mini.width = 56;
          mini.height = 56;
          const previa = Object.assign({}, cr.look);
          previa[grupo.campo] = opcao.id;
          desenharRecorte(mini, previa, cat.id, 'down');
          const nome = document.createElement('span');
          nome.textContent = opcao.label;
          b.append(mini, nome);
          b.addEventListener('click', () => {
            cr.look[grupo.campo] = opcao.id;
            montarCategoria();
          });
          grade.appendChild(b);
        }
        bloco.appendChild(grade);
      } else {
        const linha = document.createElement('div');
        linha.className = 'color-row';
        for (const cor of A().PALETTES[grupo.paleta]) {
          const b = document.createElement('button');
          b.className = 'color-dot' + (cr.look[grupo.campo] === cor ? ' active' : '');
          b.style.background = cor;
          b.title = cor;
          b.addEventListener('click', () => {
            cr.look[grupo.campo] = cor;
            montarCategoria();
          });
          linha.appendChild(b);
        }
        const livre = document.createElement('input');
        livre.type = 'color';
        livre.className = 'color-free';
        livre.value = cr.look[grupo.campo];
        livre.title = 'Escolher outra cor';
        livre.addEventListener('input', (ev) => {
          cr.look[grupo.campo] = ev.target.value;
        });
        livre.addEventListener('change', () => montarCategoria());
        linha.appendChild(livre);
        bloco.appendChild(linha);
      }

      box.appendChild(bloco);
    }
  }

  // -------------------------------------------------------------- historico ---

  function montarHistorico() {
    const caixa = $('#historyBox');
    const lista = $('#historyList');
    const historico = (cr.conta && cr.conta.historico) || [];
    caixa.hidden = historico.length === 0;
    lista.textContent = '';

    for (const item of historico.slice(0, 8)) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'history-item';

      const mini = document.createElement('canvas');
      mini.width = 34;
      mini.height = 46;
      desenharRecorte(mini, item.look, 'corpo', 'down');

      const texto = document.createElement('span');
      const data = new Date(item.em);
      texto.innerHTML = '';
      const nome = document.createElement('strong');
      nome.textContent = item.nome || 'sem nome';
      const quando = document.createElement('em');
      quando.textContent = data.toLocaleDateString('pt-BR') + ' ' +
        data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      texto.append(nome, quando);

      b.append(mini, texto);
      b.title = 'Usar este visual de novo';
      b.addEventListener('click', () => {
        cr.look = A().normalize(item.look);
        if (item.nome) $('#nameInput').value = item.nome;
        montarCategoria();
        VO.ui.toast('Visual anterior restaurado.');
      });
      li.appendChild(b);
      lista.appendChild(li);
    }
  }

  // ------------------------------------------------------------------ tela ---

  function mostrarErro(texto) {
    const el = $('#lobbyError');
    el.textContent = texto;
    el.hidden = !texto;
    el.classList.remove('info');
  }

  /**
   * Abre o criador. `conta` vem do login (ou null para visitante).
   * Resolve com o perfil escolhido.
   */
  function mostrar(conta) {
    cr.conta = conta;
    const perfil = (conta && conta.perfil) || {};
    cr.look = A().normalize(perfil.look && Object.keys(perfil.look).length ? perfil.look : A().random());
    cr.categoria = 'corpo';
    cr.girando = true;

    $('#creator').hidden = false;
    $('#creator').style.display = '';
    // de um login por e-mail, sugere so a parte antes do arroba como nome
    const daConta = conta ? String(conta.usuario).split('@')[0].slice(0, 20) : '';
    $('#nameInput').value = perfil.nome || daConta || localStorage.getItem('vo:name') || '';
    $('#statusInput').value = perfil.status || '';
    $('#creatorWho').textContent = conta
      ? 'Conectado como ' + conta.usuario + '. O que voce salvar aqui volta no proximo login.'
      : 'Voce esta como visitante: o personagem vale so para esta visita.';
    $('#logoutBtn').textContent = conta ? 'trocar de conta' : 'entrar com uma conta';

    montarAbas();
    montarCategoria();
    montarHistorico();
    animarPreview();
    $('#nameInput').focus();

    return new Promise((resolve, reject) => {
      const entrar = async () => {
        const nome = $('#nameInput').value.trim();
        if (!nome) {
          mostrarErro('Escolha um nome para entrar.');
          $('#nameInput').focus();
          return;
        }
        mostrarErro('');
        localStorage.setItem('vo:name', nome);

        const perfilFinal = {
          nome,
          status: $('#statusInput').value.trim(),
          look: cr.look,
        };

        // salva na conta (visitante nao salva)
        if (conta) {
          try {
            await VO.auth.salvarPerfil(perfilFinal);
          } catch (err) {
            mostrarErro('Nao consegui salvar o personagem: ' + err.message);
            return;
          }
        }

        clearInterval(cr.timer);
        esconder();
        resolve({
          name: nome,
          status: perfilFinal.status,
          look: cr.look,
          mic: $('#micOnJoin').checked,
          cam: $('#camOnJoin').checked,
        });
      };

      $('#joinBtn').addEventListener('click', entrar);
      $('#nameInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); });
      $('#statusInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); });

      $('#randomBtn').addEventListener('click', () => {
        cr.look = A().normalize(A().random());
        montarCategoria();
      });
      $('#spinBtn').addEventListener('click', () => {
        cr.girando = !cr.girando;
        if (!cr.girando) cr.dirIndex = (cr.dirIndex + 1) % 4;
        $('#spinBtn').textContent = cr.girando ? 'Girar' : 'Parado';
      });
      $('#clearHistoryBtn').addEventListener('click', async () => {
        try {
          cr.conta = await VO.auth.limparHistorico();
          montarHistorico();
          VO.ui.toast('Historico apagado.');
        } catch (err) {
          mostrarErro(err.message);
        }
      });
      $('#logoutBtn').addEventListener('click', () => {
        clearInterval(cr.timer);
        VO.auth.sair();
        window.location.reload();
      });
      void reject;
    });
  }

  function esconder() {
    const tela = $('#creator');
    tela.hidden = true;
    tela.style.display = 'none';
  }

  VO.creator = { mostrar, esconder };
})();
