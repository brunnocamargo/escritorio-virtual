/**
 * rtc.js - chamadas de audio/video ponto a ponto (mesh WebRTC).
 *
 * O servidor so troca offers/answers/candidates. Cada par de pessoas que
 * esta "perto" (mesma sala ou raio de proximidade) abre uma RTCPeerConnection
 * direta; quando se afastam, a conexao e fechada.
 *
 * Negociacao: perfect negotiation (um lado "polido", outro nao), o que evita
 * colisao de offers quando os dois lados renegociam ao mesmo tempo.
 */
(function () {
  'use strict';
  const VO = (window.VO = window.VO || {});

  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const state = {
    socket: null,
    myId: null,
    localStream: null,
    screenStream: null,
    mediaError: null,
    micOn: true,
    camOn: true,
    hasMic: false,
    hasCam: false,
  };

  /** id -> { pc, polite, makingOffer, ignoreOffer, stream, volume } */
  const peers = new Map();

  let audioCtx = null;
  const analysers = new Map(); // id -> { analyser, data, source }

  // ------------------------------------------------------------- midia local ---

  // Se a pessoa nao responder o pedido de permissao, o navegador deixa a
  // promise pendente para sempre. Sem este limite a entrada trava calada.
  const MEDIA_TIMEOUT = 12000;

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' }));
      }, ms);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }

  function ask(constraints) {
    return withTimeout(navigator.mediaDevices.getUserMedia(constraints), MEDIA_TIMEOUT);
  }

  async function startLocalMedia(want) {
    const wantMic = want.mic !== false;
    const wantCam = want.cam !== false;
    state.mediaError = null;

    try {
      state.localStream = await ask({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: wantCam ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 20 } } : false,
      });
    } catch (err) {
      state.mediaError = (err && err.name) || 'Error';
      console.warn('[rtc] camera/microfone indisponiveis:', state.mediaError);
      // segunda tentativa so com audio (camera ocupada por outro app, por ex.)
      try {
        state.localStream = await ask({ audio: true });
        state.mediaError = 'NoCamera';
      } catch (err2) {
        state.mediaError = (err2 && err2.name) || 'Error';
        console.warn('[rtc] sem microfone tambem:', state.mediaError);
        state.localStream = null;
      }
    }

    if (state.localStream) {
      state.hasMic = state.localStream.getAudioTracks().length > 0;
      state.hasCam = state.localStream.getVideoTracks().length > 0;
      setMic(wantMic);
      setCam(wantCam && state.hasCam);
      attachAnalyser('self', state.localStream);
    } else {
      state.hasMic = false;
      state.hasCam = false;
      state.micOn = false;
      state.camOn = false;
    }
    return state.localStream;
  }

  /** Nova tentativa de pegar camera/microfone depois de ja estar no mapa. */
  async function retryLocalMedia(want) {
    const stream = await startLocalMedia(want);
    if (!stream) return null;
    // manda as faixas novas para quem ja esta na chamada
    for (const [, entry] of peers) {
      for (const track of stream.getTracks()) {
        const sender = entry.pc.getSenders().find((s) => s.track && s.track.kind === track.kind);
        if (sender) sender.replaceTrack(track).catch(() => {});
        else entry.pc.addTrack(track, stream);
      }
    }
    return stream;
  }

  function setMic(on) {
    state.micOn = !!on && state.hasMic;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach((t) => { t.enabled = state.micOn; });
    }
    return state.micOn;
  }

  function setCam(on) {
    state.camOn = !!on && state.hasCam;
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach((t) => { t.enabled = state.camOn; });
    }
    return state.camOn;
  }

  // ------------------------------------------------------------------ peers ---

  function signal(to, data) {
    state.socket.emit('signal', { to, data });
  }

  function createPeer(id) {
    if (peers.has(id)) return peers.get(id);

    const pc = new RTCPeerConnection(ICE);
    const entry = {
      pc,
      polite: state.myId < id, // um lado cede em caso de colisao
      makingOffer: false,
      ignoreOffer: false,
      stream: null,
      volume: 1,
    };
    peers.set(id, entry);

    // audio sempre vem do microfone; o video pode ser a camera ou a tela
    const base = state.localStream;
    if (base) {
      for (const track of base.getAudioTracks()) pc.addTrack(track, base);
    }
    const videoTrack = state.screenStream
      ? state.screenStream.getVideoTracks()[0]
      : (base ? base.getVideoTracks()[0] : null);
    if (videoTrack) pc.addTrack(videoTrack, state.screenStream || base);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) signal(id, { candidate: ev.candidate });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      entry.stream = stream;
      VO.ui.setPeerStream(id, stream);
      VO.ui.setPeerVolume(id, entry.volume);
      attachAnalyser(id, stream);
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        signal(id, { description: pc.localDescription });
      } catch (err) {
        console.warn('[rtc] falha ao negociar com', id, err);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (_) { /* navegador antigo */ }
      }
    };

    VO.ui.ensurePeerTile(id);
    return entry;
  }

  async function handleSignal({ from, data }) {
    if (!data) return;
    const entry = peers.get(from) || createPeer(from);
    const pc = entry.pc;

    try {
      if (data.description) {
        const description = data.description;
        const offerCollision =
          description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          signal(from, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!entry.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn('[rtc] erro de sinalizacao com', from, err);
    }
  }

  function closePeer(id) {
    const entry = peers.get(id);
    if (!entry) return;
    try { entry.pc.close(); } catch (_) { /* ja fechado */ }
    peers.delete(id);
    detachAnalyser(id);
    VO.ui.removePeerTile(id);
  }

  function closeAll() {
    for (const id of [...peers.keys()]) closePeer(id);
  }

  /**
   * Recebe a lista de quem deve estar na chamada agora (com volume) e
   * abre/fecha conexoes conforme necessario.
   */
  function sync(targets) {
    const wanted = new Map(targets.map((t) => [t.id, t]));

    for (const [id] of peers) {
      if (!wanted.has(id)) closePeer(id);
    }
    for (const [id, target] of wanted) {
      const entry = peers.get(id) || createPeer(id);
      if (Math.abs(entry.volume - target.volume) > 0.03) {
        entry.volume = target.volume;
        VO.ui.setPeerVolume(id, target.volume);
      }
    }
    return wanted.size;
  }

  // -------------------------------------------------- compartilhamento de tela ---

  async function startScreenShare() {
    if (state.screenStream) return stopScreenShare();
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (err) {
      return false;
    }
    state.screenStream = stream;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => stopScreenShare());
    replaceOutgoingVideo(track);
    VO.ui.setLocalScreen(stream);
    return true;
  }

  function stopScreenShare() {
    if (!state.screenStream) return false;
    state.screenStream.getTracks().forEach((t) => t.stop());
    state.screenStream = null;
    const camTrack = state.localStream ? state.localStream.getVideoTracks()[0] : null;
    replaceOutgoingVideo(camTrack || null);
    VO.ui.setLocalScreen(null);
    return false;
  }

  function replaceOutgoingVideo(track) {
    for (const { pc } of peers.values()) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(track).catch((err) => console.warn('[rtc] replaceTrack', err));
      } else if (track) {
        pc.addTrack(track, state.screenStream || state.localStream);
      }
    }
  }

  // ------------------------------------------------- deteccao de quem fala ---

  function attachAnalyser(id, stream) {
    if (!stream.getAudioTracks().length) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      detachAnalyser(id);
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analysers.set(id, { analyser, source, data: new Uint8Array(analyser.frequencyBinCount) });
    } catch (err) {
      console.warn('[rtc] analyser indisponivel', err);
    }
  }

  function detachAnalyser(id) {
    const a = analysers.get(id);
    if (!a) return;
    try { a.source.disconnect(); } catch (_) { /* ignora */ }
    analysers.delete(id);
  }

  function pollSpeaking() {
    for (const [id, a] of analysers) {
      a.analyser.getByteFrequencyData(a.data);
      let sum = 0;
      for (let i = 0; i < a.data.length; i++) sum += a.data[i];
      const level = sum / a.data.length;
      const speaking = level > 12 && (id !== 'self' || state.micOn);
      const entity = id === 'self'
        ? VO.game.self
        : VO.game.players.get(id);
      if (entity) entity.speaking = speaking;
      VO.ui.setSpeaking(id, speaking);
    }
  }

  function init(socket, myId) {
    state.socket = socket;
    state.myId = myId;
    socket.on('signal', handleSignal);
    setInterval(pollSpeaking, 180);
  }

  VO.rtc = {
    state,
    peers,
    init,
    startLocalMedia,
    retryLocalMedia,
    setMic,
    setCam,
    sync,
    closePeer,
    closeAll,
    startScreenShare,
    stopScreenShare,
  };
})();
