/**
 * ui.js - tudo que e DOM: lobby, quadros de video, chat, lista de pessoas,
 * minimapa, botoes e avisos.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});
  const W = VO.world;

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    panelVisible: true,
    activeTab: 'chat',
  };

  // As telas de login e de criacao do personagem vivem em auth.js e creator.js.
  // Aqui ficam so as mensagens compartilhadas com elas.

  function hideLobby() {
    VO.auth.esconder();
    VO.creator.esconder();
    $('#app').hidden = false;
  }

  function lobbyError(text) {
    const err = $('#lobbyError');
    err.textContent = text;
    err.hidden = false;
    err.classList.remove('info');
  }

  /** Mensagem neutra de progresso (nao e erro). */
  function lobbyInfo(text) {
    const err = $('#lobbyError');
    err.textContent = text;
    err.hidden = false;
    err.classList.add('info');
  }

  /** Trava o botao enquanto a entrada acontece, para nao parecer travado. */
  function setJoining(on) {
    const btn = $('#joinBtn');
    btn.disabled = !!on;
    btn.textContent = on ? 'Entrando...' : 'Entrar no escritorio';
  }

  // ------------------------------------------------------------- video tiles ---

  const tiles = new Map(); // id -> { el, video, placeholder, label, mutedIcon }

  function initials(name) {
    return (name || '?').trim().slice(0, 2).toUpperCase();
  }

  function ensurePeerTile(id) {
    if (tiles.has(id)) return tiles.get(id);
    const entity = id === 'self' ? VO.game.self : VO.game.players.get(id);

    const el = document.createElement('div');
    el.className = 'vtile';
    el.dataset.id = id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (id === 'self') video.muted = true;

    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = initials(entity && entity.name);
    placeholder.style.background = (entity && entity.look && entity.look.shirt) || '#2b3345';

    const label = document.createElement('div');
    label.className = 'vlabel';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = id === 'self' ? 'Voce' : (entity ? entity.name : '...');
    const mutedIcon = document.createElement('span');
    mutedIcon.className = 'muted-icon';
    label.append(who, mutedIcon);

    el.append(video, placeholder, label);
    if (id === 'self') $('#videoGrid').prepend(el);
    else $('#videoGrid').appendChild(el);

    const tile = { el, video, placeholder, label: who, mutedIcon };
    tiles.set(id, tile);
    return tile;
  }

  function setPeerStream(id, stream) {
    const tile = ensurePeerTile(id);
    if (tile.video.srcObject !== stream) {
      tile.video.srcObject = stream;
      tile.video.play().catch(() => { /* autoplay bloqueado ate um clique */ });
    }
  }

  function setLocalStream(stream) {
    const tile = ensurePeerTile('self');
    tile.video.srcObject = stream;
    tile.video.play().catch(() => {});
  }

  function setLocalScreen(stream) {
    const tile = ensurePeerTile('self');
    tile.el.classList.toggle('screen', !!stream);
    tile.video.srcObject = stream || (VO.rtc.state.localStream || null);
    tile.video.play().catch(() => {});
  }

  function setPeerVolume(id, volume) {
    const tile = tiles.get(id);
    if (!tile) return;
    tile.video.volume = Math.max(0, Math.min(1, volume));
    tile.el.style.opacity = String(0.45 + 0.55 * volume);
  }

  function removePeerTile(id) {
    const tile = tiles.get(id);
    if (!tile) return;
    tile.video.srcObject = null;
    tile.el.remove();
    tiles.delete(id);
  }

  function setSpeaking(id, speaking) {
    const tile = tiles.get(id);
    if (tile) tile.el.classList.toggle('speaking', !!speaking);
  }

  /** Sincroniza rotulos, mudo e placeholder com o estado do jogo. */
  function refreshTiles() {
    for (const [id, tile] of tiles) {
      const entity = id === 'self' ? VO.game.self : VO.game.players.get(id);
      if (!entity) continue;
      const micOn = id === 'self' ? VO.rtc.state.micOn : entity.mic;
      const camOn = id === 'self' ? (VO.rtc.state.camOn || !!VO.rtc.state.screenStream) : entity.cam;
      tile.label.textContent = id === 'self' ? 'Voce' : entity.name;
      tile.mutedIcon.textContent = micOn ? '' : 'mudo';
      tile.placeholder.hidden = !!camOn;
      tile.placeholder.textContent = initials(entity.name);
      tile.placeholder.style.background = entity.look.shirt;
    }
  }

  // ------------------------------------------------------------------- chat ---

  function addMessage(msg) {
    const box = $('#messages');
    const div = document.createElement('div');
    div.className = 'msg' + (msg.scope === 'room' ? ' room' : '');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = msg.name + ': ';
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = msg.text;
    div.append(who, text);
    if (msg.scope === 'room') {
      const scope = document.createElement('span');
      scope.className = 'scope';
      scope.textContent = ' (' + W.roomById(msg.room).name + ')';
      div.appendChild(scope);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    trimMessages(box);
  }

  function addSystem(text) {
    const box = $('#messages');
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    trimMessages(box);
  }

  function trimMessages(box) {
    while (box.children.length > 200) box.removeChild(box.firstChild);
  }

  // ---------------------------------------------------------------- pessoas ---

  function refreshPeople() {
    const list = $('#peopleList');
    const all = VO.game.everyone().sort((a, b) => a.name.localeCompare(b.name));
    list.textContent = '';
    for (const e of all) {
      const li = document.createElement('li');

      const dot = document.createElement('span');
      dot.className = 'avatar-dot';
      dot.style.background = e.look.shirt;

      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = e.name + (e.isSelf ? ' (voce)' : '');

      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = W.roomById(e.room).name + (e.mic ? '' : ' - mudo');

      li.append(dot, who, where);
      if (!e.isSelf) {
        li.style.cursor = 'pointer';
        li.title = 'Ir ate ' + e.name;
        li.addEventListener('click', () => goTo(e));
      }
      list.appendChild(li);
    }
    $('#peopleCount').textContent = String(all.length);
  }

  /** Teleporta o jogador para um tile livre ao lado de alguem. */
  function goTo(entity) {
    const tx = Math.floor(entity.x / W.TILE);
    const ty = Math.floor(entity.y / W.TILE);
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [0, 0]];
    for (const [dx, dy] of around) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!W.isSolidTile(nx, ny)) {
        VO.game.teleport(nx, ny);
        toast('Voce foi ate ' + entity.name);
        return;
      }
    }
  }

  // ------------------------------------------------------------- salas / mapa ---

  function buildRoomList() {
    const list = $('#roomList');
    list.textContent = '';
    const rooms = [W.OPEN_SPACE, ...W.ROOMS];
    for (const room of rooms) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = room.color;

      const name = document.createElement('span');
      name.textContent = room.kind === 'privada' ? room.name + ' (privada)' : room.name;

      const count = document.createElement('span');
      count.className = 'count';
      count.dataset.room = room.id;
      count.textContent = '0';

      btn.append(dot, name, count);
      btn.addEventListener('click', () => {
        VO.game.teleport(room.door[0], room.door[1]);
        toast('Voce entrou em ' + room.name);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  function refreshRoomCounts() {
    const counts = new Map();
    for (const e of VO.game.everyone()) {
      counts.set(e.room, (counts.get(e.room) || 0) + 1);
    }
    document.querySelectorAll('#roomList .count').forEach((el) => {
      el.textContent = String(counts.get(el.dataset.room) || 0);
    });
  }

  function updateRoom(room) {
    $('#roomName').textContent = room.name;
    $('#roomDot').style.background = room.color;
    if (room.id === 'open') {
      toast('Open space: voce ouve quem estiver por perto');
    } else if (room.kind === 'privada') {
      toast('Area privada ' + room.name + ': so quem esta dentro escuta a conversa', 3600);
    } else {
      toast('Voce entrou em ' + room.name + ' - todos aqui ficam na mesma chamada');
    }
  }

  function setCallCount(n) {
    $('#callCount').textContent = String(n);
  }

  // ----------------------------------------------------------------- avisos ---

  let toastTimer = null;
  function toast(text, ms) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || 2600);
  }

  // --------------------------------------------------------------- controles ---

  function bindTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        ui.activeTab = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.tab-body').forEach((body) => {
          body.hidden = body.dataset.panel !== ui.activeTab;
        });
      });
    });
  }

  function togglePanel(force) {
    ui.panelVisible = typeof force === 'boolean' ? force : !ui.panelVisible;
    $('#sidepanel').classList.toggle('hidden', !ui.panelVisible);
  }

  function setButtonState(sel, on, labelOn, labelOff) {
    const btn = $(sel);
    btn.classList.toggle('off', !on);
    btn.classList.toggle('on', on);
    btn.textContent = on ? labelOn : labelOff;
  }

  function bindControls(handlers) {
    $('#micBtn').addEventListener('click', handlers.toggleMic);
    $('#camBtn').addEventListener('click', handlers.toggleCam);
    $('#screenBtn').addEventListener('click', handlers.toggleScreen);
    $('#panelBtn').addEventListener('click', () => togglePanel());
    $('#editBtn').addEventListener('click', handlers.openEditor);
    $('#leaveBtn').addEventListener('click', handlers.leave);

    $('#chatForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const input = $('#chatInput');
      const text = input.value.trim();
      if (!text) return;
      handlers.sendChat({ text, scope: $('#chatScope').value });
      input.value = '';
      input.blur();
    });

    window.addEventListener('keydown', (ev) => {
      const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (ev.key === 'Enter' && !typing) {
        ev.preventDefault();
        togglePanel(true);
        $('#chatInput').focus();
        return;
      }
      if (ev.key === 'Escape' && typing) document.activeElement.blur();
      if (typing) return;
      if (ev.code === 'KeyM') handlers.toggleMic();
      if (ev.code === 'KeyC') handlers.toggleCam();
      if (ev.code === 'KeyE') handlers.openEditor();
      if (ev.code === 'Tab') { ev.preventDefault(); togglePanel(); }
    });
  }

  function startPanelLoop() {
    setInterval(() => {
      refreshTiles();
      refreshRoomCounts();
      if (ui.activeTab === 'people') refreshPeople();
      if (ui.activeTab === 'map') VO.game.drawMinimap($('#minimap'));
    }, 500);
  }

  VO.ui = {
    hideLobby,
    lobbyError,
    lobbyInfo,
    setJoining,
    ensurePeerTile,
    setPeerStream,
    setPeerVolume,
    setLocalStream,
    setLocalScreen,
    removePeerTile,
    setSpeaking,
    refreshTiles,
    addMessage,
    addSystem,
    refreshPeople,
    buildRoomList,
    refreshRoomCounts,
    updateRoom,
    setCallCount,
    toast,
    bindTabs,
    bindControls,
    setButtonState,
    togglePanel,
    startPanelLoop,
  };
})();
