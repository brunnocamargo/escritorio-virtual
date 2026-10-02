/**
 * Teste de fumaca do servidor: sobe o server.js em uma porta livre, conecta
 * dois clientes e verifica entrada, movimento, chat e sinalizacao WebRTC.
 *
 *   npm test
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = 'http://localhost:' + PORT;
const results = [];

function check(label, ok) {
  results.push({ label, ok });
  console.log((ok ? '  ok   ' : '  FALHOU ') + label);
}

function waitFor(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando ' + event)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function join(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout no join')), 4000);
    socket.emit('join', { name, look: { shirt: '#4f8ef7' } }, (res) => {
      clearTimeout(timer);
      res && res.error ? reject(new Error(res.error)) : resolve(res);
    });
  });
}

async function run() {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

  await new Promise((resolve) => {
    server.stdout.on('data', (d) => {
      if (String(d).includes('no ar')) resolve();
    });
    setTimeout(resolve, 2500);
  });

  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });

  try {
    const joinedA = await join(a, 'Ana');
    check('primeiro cliente entra e recebe seu jogador', !!joinedA.self.id);
    check('nasce em um ponto valido', joinedA.self.x > 0 && joinedA.self.y > 0);

    const sawJoin = waitFor(a, 'player:joined');
    const joinedB = await join(b, 'Bruno');
    const announced = await sawJoin;
    check('segundo cliente e anunciado para o primeiro', announced.id === joinedB.self.id);
    check('segundo cliente ja enxerga o primeiro', joinedB.players.some((p) => p.id === joinedA.self.id));

    const sawMove = waitFor(a, 'player:moved');
    b.emit('move', { x: 800, y: 500, dir: 'left', moving: true, room: 'open' });
    const moved = await sawMove;
    check('movimento chega ao outro cliente', moved.x === 800 && moved.dir === 'left');

    const sawChat = waitFor(b, 'chat');
    a.emit('chat', { text: 'ola pessoal', scope: 'global' });
    const chat = await sawChat;
    check('chat global chega', chat.text === 'ola pessoal' && chat.name === 'Ana');

    const sawSignal = waitFor(b, 'signal');
    a.emit('signal', { to: joinedB.self.id, data: { description: { type: 'offer', sdp: 'x' } } });
    const sig = await sawSignal;
    check('sinalizacao WebRTC e repassada', sig.from === joinedA.self.id && sig.data.description.type === 'offer');

    const sawState = waitFor(b, 'player:state');
    a.emit('state', { mic: false });
    const st = await sawState;
    check('estado de microfone e propagado', st.id === joinedA.self.id && st.mic === false);

    const sawLeft = waitFor(b, 'player:left');
    a.close();
    const left = await sawLeft;
    check('saida e anunciada', left.id === joinedA.self.id);
  } catch (err) {
    check('execucao sem erros: ' + err.message, false);
  } finally {
    a.close();
    b.close();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  console.log(failed === 0
    ? results.length + ' verificacoes, todas passaram.'
    : failed + ' de ' + results.length + ' verificacoes falharam.');
  process.exit(failed === 0 ? 0 : 1);
}

run();
