/**
 * Testa o Centro de configuracao pelo lado do servidor: publicar uma planta,
 * recusar plantas invalidas, avisar quem esta conectado e restaurar o padrao.
 * Usa um diretorio de dados temporario para nao mexer no data/office.json real.
 *
 *   node scripts/check-editor.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3998;
const URL = 'http://localhost:' + PORT;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'escritorio-teste-'));

const results = [];
const check = (label, ok) => {
  results.push(ok);
  console.log((ok ? '  ok   ' : '  FALHOU ') + label);
};

const wait = (socket, event, timeout = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout esperando ' + event)), timeout);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});

const join = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout no join')), 5000);
  socket.emit('join', { name, look: { shirt: '#4f8ef7' } }, (res) => {
    clearTimeout(timer);
    if (res && res.error) reject(new Error(res.error));
    else resolve(res);
  });
});

let TOKEN = null;

async function api(caminho, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch(URL + caminho, Object.assign({}, options, { headers }));
  const corpo = await res.json().catch(() => ({}));
  return { status: res.status, corpo };
}

async function run() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((resolve) => {
    server.stdout.on('data', (d) => { if (String(d).includes('no ar')) resolve(); });
    setTimeout(resolve, 2500);
  });

  const cliente = io(URL, { transports: ['websocket'] });

  try {
    // publicar planta exige conta
    const conta = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'editora', senha: 'senha123' }),
    });
    check('conta de teste criada', conta.status === 200);
    TOKEN = conta.corpo.token;

    const inicial = await api('/api/map');
    check('GET /api/map devolve a planta padrao', inicial.status === 200 && inicial.corpo.map.rows.length > 0);
    check('planta comeca como nao customizada', inicial.corpo.customized === false);

    await join(cliente, 'Editora');

    // ---------------------------------------------------- planta invalida ---
    const furada = JSON.parse(JSON.stringify(inicial.corpo.map));
    furada.rows[0] = '.'.repeat(furada.rows[0].length); // abre a borda de cima
    const recusa = await api('/api/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map: furada, author: 'Editora' }),
    });
    check('servidor recusa planta com buraco na borda', recusa.status === 400);
    check('a recusa explica o motivo', Array.isArray(recusa.corpo.errors) && recusa.corpo.errors.length > 0);

    const naoMudou = await api('/api/map');
    check('planta recusada nao substitui a atual', naoMudou.corpo.map.rows[0] === inicial.corpo.map.rows[0]);

    // ------------------------------------------------------ planta valida ---
    const nova = JSON.parse(JSON.stringify(inicial.corpo.map));
    nova.name = 'Planta de teste';
    // coloca uma mesa num tile livre do primeiro ponto de entrada + 1
    const [sx, sy] = nova.spawns[0];
    const linha = nova.rows[sy].split('');
    linha[sx + 3] = 'T';
    nova.rows[sy] = linha.join('');
    nova.rooms.push({
      id: 'sala-nova', name: 'Sala Nova', x1: nova.rooms[0].x1, y1: nova.rooms[0].y1,
      x2: nova.rooms[0].x1 + 2, y2: nova.rooms[0].y1 + 2, floor: 'g', color: '#63e0b0',
      door: nova.rooms[0].door.slice(),
    });
    // o ponto de chegada precisa cair dentro do novo retangulo
    nova.rooms[nova.rooms.length - 1].door = [nova.rooms[0].x1, nova.rooms[0].y1 + 1];

    const aviso = wait(cliente, 'map:updated');
    const publicou = await api('/api/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map: nova, author: 'Editora' }),
    });
    check('servidor aceita planta valida', publicou.status === 200);

    const evento = await aviso;
    check('quem esta conectado recebe map:updated', evento.map.name === 'Planta de teste');
    check('o aviso diz quem publicou', evento.by === 'Editora');
    check('a mesa nova chegou no evento', evento.map.rows[sy][sx + 3] === 'T');
    check('a sala nova veio junto', evento.map.rooms.some((r) => r.id === 'sala-nova'));

    // ------------------------------------------------------- persistencia ---
    const gravado = path.join(DATA_DIR, 'office.json');
    check('planta gravada em disco', fs.existsSync(gravado));
    const doDisco = JSON.parse(fs.readFileSync(gravado, 'utf8'));
    check('o arquivo gravado bate com o publicado', doDisco.name === 'Planta de teste');

    const depois = await api('/api/map');
    check('GET passa a devolver a planta nova', depois.corpo.map.name === 'Planta de teste');
    check('agora consta como customizada', depois.corpo.customized === true);

    // quem entra depois nasce em um ponto valido da planta nova
    const recemChegado = io(URL, { transports: ['websocket'] });
    const entrou = await join(recemChegado, 'Novato');
    const tx = Math.floor(entrou.self.x / 32);
    const ty = Math.floor(entrou.self.y / 32);
    check('quem entra depois nasce num ponto da planta nova',
      depois.corpo.map.spawns.some((s) => s[0] === tx && s[1] === ty));
    recemChegado.close();

    // ---------------------------------------------------------- restaurar ---
    const volta = wait(cliente, 'map:updated');
    const reset = await api('/api/map/reset', { method: 'POST' });
    check('restaurar padrao responde ok', reset.status === 200);
    const eventoVolta = await volta;
    check('restaurar avisa todo mundo', eventoVolta.map.name === inicial.corpo.map.name);
    check('arquivo customizado foi removido', !fs.existsSync(gravado));

    // ------------------------------------------------- protecao por chave ---
    server.kill();
    await new Promise((r) => setTimeout(r, 300));

    const protegido = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT + 1), DATA_DIR, EDITOR_KEY: 'segredo' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve) => {
      protegido.stdout.on('data', (d) => { if (String(d).includes('no ar')) resolve(); });
      setTimeout(resolve, 2500);
    });
    const semChave = await fetch('http://localhost:' + (PORT + 1) + '/api/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ map: nova, author: 'Intruso' }),
    });
    check('com EDITOR_KEY, publicar sem a chave e bloqueado', semChave.status === 403);
    const comChave = await fetch('http://localhost:' + (PORT + 1) + '/api/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-editor-key': 'segredo' },
      body: JSON.stringify({ map: nova, author: 'Editora' }),
    });
    check('com a chave certa, publicar funciona', comChave.status === 200);
    protegido.kill();
  } catch (err) {
    check('execucao sem erros: ' + err.message, false);
  } finally {
    cliente.close();
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
