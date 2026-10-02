/**
 * Contas: cadastro, login, personagem salvo e historico de visuais.
 * Roda em um diretorio de dados temporario e reinicia o servidor no meio para
 * provar que os dados sobrevivem a um restart.
 *
 *   node scripts/check-auth.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3997;
const URL = 'http://localhost:' + PORT;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'escritorio-contas-'));

const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log((ok ? '  ok   ' : '  FALHOU ') + label);
};

function subirServidor() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  return new Promise((resolve) => {
    server.stdout.on('data', (d) => { if (String(d).includes('no ar')) resolve(server); });
    setTimeout(() => resolve(server), 2500);
  });
}

async function api(caminho, options = {}, token) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers);
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(URL + caminho, Object.assign({}, options, { headers }));
  const corpo = await res.json().catch(() => ({}));
  return { status: res.status, corpo };
}

const LOOK_A = {
  body: 'feminino', skin: '#e0a878', hair: '#a63d3d', hairstyle: 'coque',
  outfit: 'blazer', shirt: '#b06ac9', pants: '#1f2634', detail: '#f7b955',
  face: 'oculos', head: 'nenhum',
};
const LOOK_B = {
  body: 'masculino', skin: '#8d5524', hair: '#151515', hairstyle: 'raspado',
  outfit: 'moletom', shirt: '#63e0b0', pants: '#2f3a55', detail: '#4f8ef7',
  face: 'barba', head: 'fone',
};

async function run() {
  let server = await subirServidor();

  try {
    // ------------------------------------------------------------ cadastro ---
    const curto = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'ab', senha: 'senha123' }),
    });
    check('recusa usuario curto demais', curto.status === 400);

    const comEspaco = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'nao vale espaco', senha: 'senha123' }),
    });
    check('recusa usuario com caractere invalido', comEspaco.status === 400);

    const senhaComSimbolo = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'simbolo@teste.com', senha: 'senha!@#' }),
    });
    check('recusa senha com caractere fora de letras e numeros', senhaComSimbolo.status === 400);

    const senhaVazia = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'vazia@teste.com', senha: '' }),
    });
    check('recusa senha vazia', senhaVazia.status === 400);

    const senhaCurta = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'curta@teste.com', senha: 'a1' }),
    });
    check('aceita senha curta, desde que so tenha letras e numeros', senhaCurta.status === 200);

    const cadastro = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        usuario: 'Teste@Teste.com', senha: 'senha123',
        perfil: { nome: 'Teste', status: '', look: LOOK_A },
      }),
    });
    check('cria a conta', cadastro.status === 200 && !!cadastro.corpo.token);
    check('e-mail e aceito como usuario', !!cadastro.corpo.conta);
    check('maiusculas do e-mail sao normalizadas', cadastro.corpo.conta.usuario === 'teste@teste.com');
    const token1 = cadastro.corpo.token;

    // sem perfil no cadastro, o nome vem da parte antes do arroba
    const semPerfil = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'outro@teste.com', senha: 'senha123' }),
    });
    check('sem perfil, o nome sugerido e a parte antes do arroba',
      semPerfil.corpo.conta.perfil.nome === 'outro');

    const apelido = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'apelido.simples', senha: 'senha123' }),
    });
    check('apelido sem arroba continua valendo', apelido.status === 200);

    const duplicado = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'teste@teste.com', senha: 'outra123' }),
    });
    check('nao deixa criar duas contas com o mesmo usuario', duplicado.status === 400);

    // -------------------------------------------------------------- sessao ---
    const semToken = await api('/api/auth/me');
    check('sem token, /me responde 401', semToken.status === 401);

    const comToken = await api('/api/auth/me', {}, token1);
    check('com token, /me devolve a conta', comToken.corpo.conta.usuario === 'teste@teste.com');

    const tokenFalso = await api('/api/auth/me', {}, token1.split('.')[0] + '.assinaturaerrada');
    check('token com assinatura adulterada e recusado', tokenFalso.status === 401);

    // ------------------------------------------------- personagem salvo ---
    const salvou = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ perfil: { nome: 'Teste', status: 'focado', look: LOOK_A } }),
    }, token1);
    check('salva o personagem', salvou.status === 200);
    check('o look salvo bate com o enviado', salvou.corpo.conta.perfil.look.hairstyle === 'coque');
    check('acessorio de rosto foi salvo', salvou.corpo.conta.perfil.look.face === 'oculos');

    // troca de visual: o anterior vai para o historico
    const trocou = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ perfil: { nome: 'Teste', status: 'focado', look: LOOK_B } }),
    }, token1);
    check('troca de visual guarda o anterior no historico', trocou.corpo.conta.historico.length === 1);
    check('o historico guarda o visual antigo', trocou.corpo.conta.historico[0].look.hairstyle === 'coque');
    check('o perfil atual e o novo', trocou.corpo.conta.perfil.look.hairstyle === 'raspado');

    // salvar o mesmo visual de novo nao polui o historico
    const igual = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ perfil: { nome: 'Teste', status: 'focado', look: LOOK_B } }),
    }, token1);
    check('salvar o mesmo visual nao cria entrada repetida', igual.corpo.conta.historico.length === 1);

    // ------------------------------------------- sobrevive a um restart ---
    server.kill();
    await new Promise((r) => setTimeout(r, 400));
    server = await subirServidor();

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'teste@teste.com', senha: 'senha123' }),
    });
    check('login funciona depois de reiniciar o servidor', login.status === 200);
    check('o personagem voltou igual ao que foi salvo',
      login.corpo.conta.perfil.look.hairstyle === 'raspado' &&
      login.corpo.conta.perfil.look.outfit === 'moletom' &&
      login.corpo.conta.perfil.look.head === 'fone');
    check('o status tambem voltou', login.corpo.conta.perfil.status === 'focado');
    check('o historico sobreviveu', login.corpo.conta.historico.length === 1);

    const senhaErrada = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario: 'teste@teste.com', senha: 'errada' }),
    });
    check('senha errada e recusada', senhaErrada.status === 401);

    check('o token antigo continua valendo apos o restart',
      (await api('/api/auth/me', {}, token1)).status === 200);

    // ----------------------------------------------------- senha guardada ---
    const bruto = fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8');
    check('a senha nao aparece em texto puro no disco', !bruto.includes('senha123'));
    check('o arquivo guarda hash com sal', bruto.includes('salt') && bruto.includes('hash'));

    // --------------------------------------------------- limpar historico ---
    const limpou = await api('/api/auth/history', { method: 'DELETE' }, login.corpo.token);
    check('da para limpar o historico', limpou.corpo.conta.historico.length === 0);

    // ------------------------------------------ visitante nao edita mapa ---
    const mapa = (await api('/api/map')).corpo.map;
    const semConta = await api('/api/map', {
      method: 'PUT',
      body: JSON.stringify({ map: mapa, author: 'Visitante' }),
    });
    check('visitante nao publica planta', semConta.status === 403);

    const comConta = await api('/api/map', {
      method: 'PUT',
      body: JSON.stringify({ map: mapa, author: 'Teste' }),
    }, login.corpo.token);
    check('quem tem conta publica planta', comConta.status === 200);
  } catch (err) {
    check('execucao sem erros: ' + err.message, false);
  } finally {
    try { server.kill(); } catch (_) { /* ja morreu */ }
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const falhas = results.filter((r) => !r).length;
  console.log('');
  console.log(falhas === 0
    ? results.length + ' verificacoes, todas passaram.'
    : falhas + ' de ' + results.length + ' verificacoes falharam.');
  process.exit(falhas === 0 ? 0 : 1);
}

run();
