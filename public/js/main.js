/**
 * main.js - amarra tudo: lobby -> midia -> conexao -> jogo -> chamadas.
 */
(function () {
  'use strict';
  const VO = window.VO;

  const SYNC_INTERVAL = 400; // ms entre reavaliacoes de quem esta na chamada

  function mediaSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** Traduz a falha de camera/microfone em algo acionavel para a pessoa. */
  function describeMediaProblem(rtcState, profile) {
    if (rtcState.localStream && (rtcState.hasCam || !profile.cam)) return '';
    switch (rtcState.mediaError) {
      case 'NotAllowedError':
        return 'Camera e microfone bloqueados neste site. Libere no cadeado da barra de enderecos e clique em Mic.';
      case 'TimeoutError':
        return 'O pedido de permissao ficou sem resposta. Voce entrou sem microfone: clique em Mic para tentar de novo.';
      case 'NotFoundError':
        return 'Nenhum microfone ou camera encontrado neste computador.';
      case 'NotReadableError':
        return 'Camera ou microfone ocupados por outro programa (Teams, Meet, OBS). Feche e clique em Mic.';
      case 'NoCamera':
        return 'Sem camera disponivel: voce entrou so com audio.';
      default:
        return rtcState.localStream ? '' : 'Voce entrou sem microfone e sem camera, mas ainda ouve e ve os outros.';
    }
  }

  /** Busca a planta atual do escritorio antes de montar o mundo. */
  async function carregarMapa() {
    const res = await fetch('/api/map');
    if (!res.ok) throw new Error('nao consegui carregar a planta do escritorio');
    const corpo = await res.json();
    VO.world.load(corpo.map);
    return corpo;
  }

  async function boot() {
    await carregarMapa();

    // 0) quem e voce: conta salva, login, ou visitante
    const conta = await VO.auth.telaDeLogin();
    const profile = await VO.creator.mostrar(conta);

    VO.ui.setJoining(true);

    // avisos de midia so fazem sentido depois que o mapa aparece
    let mediaWarning = mediaSupported()
      ? ''
      : 'Sem acesso a camera/microfone neste endereco. Use http://localhost ou HTTPS.';

    // 1) midia local. Nunca bloqueia a entrada: se a permissao for negada ou
    //    ninguem responder o pedido, entra assim mesmo (da para ligar depois).
    let stream = null;
    if (mediaSupported()) {
      VO.ui.lobbyInfo('Pedindo acesso ao microfone e a camera. Se o navegador perguntar, clique em Permitir.');
      stream = await VO.rtc.startLocalMedia({ mic: profile.mic, cam: profile.cam });
      mediaWarning = describeMediaProblem(VO.rtc.state, profile);
    }

    // 2) conexao com o servidor
    VO.ui.lobbyInfo('Conectando ao servidor...');
    let init;
    try {
      init = await VO.net.connect(profile);
    } catch (err) {
      VO.ui.setJoining(false);
      VO.ui.lobbyError('Nao foi possivel conectar: ' + (err.message || err));
      return;
    }

    // 3) mundo
    VO.ui.hideLobby();
    VO.game.init(document.getElementById('stage'), init.self, init.players);
    VO.net.bind();
    VO.rtc.init(VO.net.socket, init.self.id);

    // 4) interface
    VO.ui.bindTabs();
    VO.ui.buildRoomList();
    VO.ui.ensurePeerTile('self');
    if (stream) VO.ui.setLocalStream(stream);
    VO.ui.refreshPeople();
    VO.ui.startPanelLoop();
    VO.ui.updateRoom(VO.world.roomById(init.self.room));
    if (mediaWarning) setTimeout(() => VO.ui.toast(mediaWarning, 5000), 2800);

    VO.game.onRoomChange = (room) => {
      VO.ui.updateRoom(room);
      VO.ui.refreshRoomCounts();
    };
    VO.game.onPlayersChange = () => VO.ui.refreshPeople();

    // estado inicial dos botoes
    VO.ui.setButtonState('#micBtn', VO.rtc.state.micOn, 'Mic on', 'Mic off');
    VO.ui.setButtonState('#camBtn', VO.rtc.state.camOn, 'Cam on', 'Cam off');
    VO.ui.setButtonState('#screenBtn', false, 'Tela on', 'Tela');
    VO.net.sendState({ mic: VO.rtc.state.micOn, cam: VO.rtc.state.camOn, status: profile.status });

    VO.ui.bindControls({
      async toggleMic() {
        // sem microfone ainda: o clique vira uma nova tentativa de permissao
        if (!VO.rtc.state.hasMic) {
          VO.ui.toast('Pedindo acesso ao microfone...');
          const got = await VO.rtc.retryLocalMedia({ mic: true, cam: VO.rtc.state.camOn });
          if (!got) return VO.ui.toast('Ainda sem microfone: libere no cadeado da barra de enderecos.', 5000);
          VO.ui.setLocalStream(got);
          VO.ui.toast('Microfone ligado.');
        } else {
          VO.rtc.setMic(!VO.rtc.state.micOn);
        }
        VO.ui.setButtonState('#micBtn', VO.rtc.state.micOn, 'Mic on', 'Mic off');
        VO.ui.setButtonState('#camBtn', VO.rtc.state.camOn, 'Cam on', 'Cam off');
        VO.net.sendState({ mic: VO.rtc.state.micOn, cam: VO.rtc.state.camOn });
      },
      async toggleCam() {
        if (!VO.rtc.state.hasCam) {
          VO.ui.toast('Pedindo acesso a camera...');
          const got = await VO.rtc.retryLocalMedia({ mic: true, cam: true });
          if (!got || !VO.rtc.state.hasCam) return VO.ui.toast('Nenhuma camera disponivel.', 4000);
          VO.ui.setLocalStream(got);
          VO.ui.setButtonState('#micBtn', VO.rtc.state.micOn, 'Mic on', 'Mic off');
          VO.ui.setButtonState('#camBtn', VO.rtc.state.camOn, 'Cam on', 'Cam off');
          return VO.net.sendState({ mic: VO.rtc.state.micOn, cam: VO.rtc.state.camOn });
        }
        const on = VO.rtc.setCam(!VO.rtc.state.camOn);
        VO.ui.setButtonState('#camBtn', on, 'Cam on', 'Cam off');
        VO.net.sendState({ cam: on });
      },
      async toggleScreen() {
        const sharing = await VO.rtc.startScreenShare();
        VO.ui.setButtonState('#screenBtn', sharing, 'Tela on', 'Tela');
        VO.net.sendState({ screen: sharing });
        VO.ui.toast(sharing ? 'Compartilhando sua tela' : 'Compartilhamento encerrado');
      },
      sendChat(msg) {
        VO.net.sendChat(msg);
      },
      openEditor() {
        VO.editor.abrir();
      },
      leave() {
        VO.rtc.closeAll();
        VO.rtc.stopScreenShare();
        if (VO.rtc.state.localStream) VO.rtc.state.localStream.getTracks().forEach((t) => t.stop());
        VO.net.socket.disconnect();
        window.location.reload();
      },
    });

    VO.editor.bindUI();

    // 5) quem entra e quem sai da chamada, conforme voce anda pelo mapa
    setInterval(() => {
      const targets = VO.game.audioTargets();
      const count = VO.rtc.sync(targets);
      VO.ui.setCallCount(count);
    }, SYNC_INTERVAL);

    window.addEventListener('beforeunload', () => {
      VO.rtc.closeAll();
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    boot().catch((err) => {
      console.error(err);
      VO.ui.setJoining(false);
      VO.ui.lobbyError('Erro inesperado: ' + (err.message || err));
    });
  });
})();
