/**
 * net.js - conexao com o servidor (socket.io): entrada, posicoes, estado e chat.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});

  const net = { socket: null, id: null };

  function connect(profile) {
    return new Promise((resolve, reject) => {
      const socket = io({ transports: ['websocket', 'polling'] });
      net.socket = socket;

      const timeout = setTimeout(() => reject(new Error('Servidor nao respondeu.')), 12000);

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('connect', () => {
        socket.emit('join', {
          name: profile.name,
          status: profile.status,
          look: profile.look,
          token: VO.auth.token,
        }, (res) => {
          clearTimeout(timeout);
          if (!res || res.error) return reject(new Error((res && res.error) || 'Falha ao entrar.'));
          net.id = res.self.id;
          resolve(res);
        });
      });
    });
  }

  /** Liga os eventos do servidor ao jogo e a interface. */
  function bind() {
    const socket = net.socket;

    socket.on('player:joined', (p) => {
      VO.game.addPlayer(p);
      VO.ui.refreshPeople();
    });

    socket.on('player:left', ({ id }) => {
      VO.game.removePlayer(id);
      VO.rtc.closePeer(id);
      VO.ui.refreshPeople();
    });

    socket.on('player:moved', (m) => VO.game.applyMove(m));

    socket.on('player:state', (s) => {
      VO.game.applyState(s);
      VO.ui.refreshTiles();
    });

    socket.on('map:updated', ({ map, by }) => {
      VO.game.applyMap(map);
      VO.ui.buildRoomList();
      VO.ui.refreshRoomCounts();
      VO.ui.toast('Planta atualizada por ' + by + '.', 4000);
    });

    socket.on('chat', (msg) => VO.ui.addMessage(msg));

    socket.on('system', (msg) => VO.ui.addSystem(msg.text));

    socket.on('disconnect', () => {
      VO.ui.addSystem('Conexao perdida. Tentando reconectar...');
      VO.rtc.closeAll();
    });
  }

  const sendMove = (m) => net.socket && net.socket.volatile.emit('move', m);
  const sendState = (s) => net.socket && net.socket.emit('state', s);
  const sendChat = (c) => net.socket && net.socket.emit('chat', c);

  VO.net = { connect, bind, sendMove, sendState, sendChat, get socket() { return net.socket; }, get id() { return net.id; } };
})();
