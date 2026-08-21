const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const voiceButton = document.querySelector('#voice');
const callStatus = document.querySelector('#call-status');
const callDot = document.querySelector('#call-dot');
const callState = document.querySelector('#call-state');
const callDetail = document.querySelector('#call-detail');
const micState = document.querySelector('#mic-state');
const joinButton = document.querySelector('#join');
const roomInput = document.querySelector('#room-input');
const status = document.querySelector('#status');
const localVideo = document.querySelector('#local-video');
const remoteVideo = document.querySelector('#remote-video');
const fullscreenButton = document.querySelector('#fullscreen');
const soundButton = document.querySelector('#sound');
const qualitySelect = document.querySelector('#quality');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const messages = document.querySelector('#messages');
const roomCode = document.querySelector('#room-code');
const roomId = document.querySelector('#room-id');
const copyButton = document.querySelector('#copy');

const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const signalingUrl = localHost
  ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  : 'wss://pideias-telas-signaling.onrender.com';
const socket = new WebSocket(signalingUrl);
let peer;
let localStream;
let voiceStream;
let viewerId;
const hostPeers = new Map();
const pendingCandidates = new Map();
let role;
let voiceAnalyser;
let voiceAnalysisFrame;
let callConnections = 0;
const remoteAudios = new Set();
const videoQuality = {
  auto: {},
  '360p': { maxBitrate: 900000, scaleResolutionDownBy: 2 },
  '480p': { maxBitrate: 1800000, scaleResolutionDownBy: 1.5 },
  '720p': { maxBitrate: 3500000, scaleResolutionDownBy: 1 },
};

const setStatus = (text) => { status.textContent = text; };
const showCallStatus = (state, detail) => {
  callStatus.classList.add('visible');
  callState.textContent = state === 'connected' ? 'Conectada' : state === 'connecting' ? 'Conectando...' : 'Indisponível';
  callDetail.textContent = detail;
  callDot.className = `call-dot ${state}`;
};
const showMicState = (state, text) => { micState.className = `mic-state ${state}`; micState.textContent = text; };
const startVoiceMeter = () => {
  if (!voiceStream || voiceAnalysisFrame) return;
  try {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(voiceStream);
    voiceAnalyser = audioContext.createAnalyser();
    voiceAnalyser.fftSize = 512;
    source.connect(voiceAnalyser);
    const data = new Uint8Array(voiceAnalyser.fftSize);
    const measure = () => {
      if (!voiceStream) return;
      voiceAnalyser.getByteTimeDomainData(data);
      const volume = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length);
      if (voiceStream.getAudioTracks()[0]?.enabled) showMicState(volume > 0.045 ? 'active speaking' : 'active', volume > 0.045 ? 'Captando voz · falando agora' : 'Microfone conectado · captando voz');
      voiceAnalysisFrame = requestAnimationFrame(measure);
    };
    measure();
  } catch { showMicState('active', 'Microfone conectado · captando voz'); }
};
const liberarAudioRecebido = () => { remoteAudios.forEach((audio) => audio.play().catch(() => {})); };
document.addEventListener('click', liberarAudioRecebido);
const criarAudioRemoto = (track, stream, connectionId) => {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.controls = true;
  audio.playsInline = true;
  audio.srcObject = stream || new MediaStream([track]);
  audio.dataset.viewerId = connectionId || '';
  audio.dataset.remoteVoice = 'true';
  document.body.append(audio);
  remoteAudios.add(audio);
  audio.addEventListener('playing', () => setStatus('Voz recebida. Chamada de voz conectada.'));
  audio.play().catch(() => setStatus('Voz recebida. Clique em qualquer botão para ouvir.'));
};
const removerAudioRemoto = (connectionId = null) => {
  remoteAudios.forEach((audio) => {
    if (connectionId !== null && audio.dataset.viewerId !== connectionId) return;
    audio.remove();
    remoteAudios.delete(audio);
  });
};
const send = (message) => {
  if (socket.readyState !== WebSocket.OPEN) {
    setStatus('Servidor de sinalização indisponível. Aguarde o backend iniciar.');
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
};
const applyVideoQuality = async (connection, quality = '720p') => {
  const sender = connection?.getSenders().find((item) => item.track?.kind === 'video');
  if (!sender) return;
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) parameters.encodings = [{}];
  const encoding = parameters.encodings[0];
  delete encoding.maxBitrate;
  delete encoding.scaleResolutionDownBy;
  Object.assign(encoding, videoQuality[quality] || videoQuality['720p']);
  parameters.degradationPreference = quality === '720p' ? 'maintain-resolution' : 'balanced';
  try { await sender.setParameters(parameters); }
  catch { setStatus('Não foi possível alterar a qualidade desta transmissão.'); }
};
const makePeer = (connectionId = null) => {
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  connection.onicecandidate = ({ candidate }) => candidate && send({ type: 'ice-candidate', candidate, ...(connectionId ? { target: connectionId } : {}) });
  connection.ontrack = ({ track, streams = [] }) => {
    const stream = streams[0] || new MediaStream([track]);
    if (track.kind === 'audio' && !stream.getVideoTracks().length) return criarAudioRemoto(track, stream, connectionId);
    if (track.kind === 'audio') return;
    const remoteStream = remoteVideo.srcObject || new MediaStream();
    if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
    remoteVideo.srcObject = streams[0] || remoteStream;
    remoteVideo.muted = false;
    remoteVideo.play().catch(() => setStatus('Clique em “Ativar som” para ouvir a transmissão.'));
    setStatus('Transmissão conectada.');
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'connected') {
      callConnections += 1;
      showCallStatus('connected', 'Áudio conectado com os participantes da sala.');
    }
    if (['failed', 'disconnected'].includes(connection.connectionState)) {
      callConnections = Math.max(0, callConnections - 1);
      showCallStatus('error', 'A conexão de voz foi interrompida.');
      setStatus('Conexão interrompida.');
    }
  };
  if (connectionId) hostPeers.set(connectionId, connection); else peer = connection;
  return connection;
};
const attachVoice = async (connection) => {
  const track = voiceStream?.getAudioTracks()[0];
  if (!track || !connection) return;
  const transceiver = connection.voiceSender
    ? connection.getTransceivers().find((t) => t.sender === connection.voiceSender)
    : connection.getTransceivers().find((t) => t.receiver.track.kind === 'audio' && t.mid !== null);
  if (!transceiver) return;
  await transceiver.sender.replaceTrack(track);
  if (transceiver.direction !== 'sendrecv') transceiver.direction = 'sendrecv';
};
const addVoiceLine = (connection) => {
  if (connection.getTransceivers().some((t) => t.receiver.track.kind === 'audio')) return;
  const transceiver = connection.addTransceiver(voiceStream?.getAudioTracks()[0] || 'audio', { direction: 'sendrecv', ...(voiceStream ? { streams: [voiceStream] } : {}) });
  connection.voiceSender = transceiver.sender;
};
const flushCandidates = async (connection, key) => {
  const candidates = pendingCandidates.get(key) || [];
  while (candidates.length) {
    try { await connection.addIceCandidate(candidates.shift()); }
    catch { setStatus('Não foi possível concluir a conexão de voz.'); }
  }
  pendingCandidates.delete(key);
};

socket.onopen = () => setStatus('Sinalização conectada. Escolha uma ação.');
socket.onerror = () => setStatus('Servidor de sinalização indisponível.');
socket.onclose = () => setStatus('Servidor de sinalização desconectado.');
socket.onmessage = async ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === 'room-created') { roomId.textContent = message.roomId; roomCode.classList.add('visible'); stopButton.classList.add('visible'); setStatus('Sala criada. Aguardando seu amigo.'); }
  if (message.type === 'joined-room') { viewerId = message.viewerId; showCallStatus('connecting', 'Abrindo chamada de voz...'); setStatus('Sala encontrada. Conectando...'); await ensureVoice(); }
  if (message.type === 'viewer-joined') {
    showCallStatus('connecting', 'Conectando o áudio do espectador...');
    setStatus(`Espectador ${message.count} conectado. Negociando conexão...`);
    const connection = makePeer(message.viewerId);
    addVoiceLine(connection);
    localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
    await applyVideoQuality(connection, '720p');
    await attachVoice(connection);
    const offer = await connection.createOffer(); await connection.setLocalDescription(offer); send({ type: 'offer', offer, target: message.viewerId });
  }
  if (message.type === 'offer') {
    await ensureVoice();
    const connection = role === 'host' ? hostPeers.get(message.viewerId) : (peer || makePeer());
    if (!connection) return;
    await connection.setRemoteDescription(message.offer);
    await attachVoice(connection);
    await flushCandidates(connection, role === 'host' ? message.viewerId : 'viewer');
    const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); send({ type: 'answer', answer, ...(message.viewerId ? { target: message.viewerId } : {}) });
  }
  if (message.type === 'answer') {
    const connection = role === 'host' ? hostPeers.get(message.viewerId) : peer;
    if (connection) { await connection.setRemoteDescription(message.answer); await flushCandidates(connection, role === 'host' ? message.viewerId : 'viewer'); }
  }
  if (message.type === 'ice-candidate') {
    const key = role === 'host' ? message.viewerId : 'viewer';
    const connection = role === 'host' ? hostPeers.get(message.viewerId) : peer;
    if (!connection || !connection.remoteDescription) pendingCandidates.set(key, [...(pendingCandidates.get(key) || []), message.candidate]);
    else { try { await connection.addIceCandidate(message.candidate); } catch { setStatus('Não foi possível concluir a conexão de voz.'); } }
  }
  if (message.type === 'peer-left') {
    if (role === 'host') { hostPeers.get(message.viewerId)?.close(); hostPeers.delete(message.viewerId); removerAudioRemoto(message.viewerId); setStatus('Um espectador saiu da sala.'); }
    else { remoteVideo.srcObject = null; removerAudioRemoto(); setStatus('O transmissor saiu da sala.'); }
  }
  if (message.type === 'room-ended') {
    remoteVideo.srcObject = null; peer?.close(); peer = null; role = null; viewerId = null; joinButton.disabled = false; removerAudioRemoto(); showCallStatus('error', 'A transmissão foi encerrada.'); setStatus('A transmissão foi encerrada. Você pode entrar em outra sala.');
  }
  if (message.type === 'quality-request' && role === 'host') { await applyVideoQuality(hostPeers.get(message.viewerId), message.quality); return; }
  if (message.type === 'chat') {
    const item = document.createElement('div'); item.className = 'message';
    const author = document.createElement('strong'); author.textContent = message.sender;
    const text = document.createElement('p'); text.textContent = message.text;
    item.append(author, text); messages.append(item); messages.scrollTop = messages.scrollHeight;
  }
  if (message.type === 'error') setStatus(message.message);
};

startButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: true });
    localVideo.srcObject = localStream; role = 'host'; showCallStatus('connecting', 'Preparando sua chamada de voz...'); await ensureVoice();
    if (!send({ type: 'create-room' })) return;
    startButton.disabled = true; setStatus('Tela capturada. Criando sala...');
    localStream.getVideoTracks()[0].onended = () => setStatus('Captura encerrada.');
  } catch (error) { setStatus(error.name === 'NotAllowedError' ? 'A captura foi cancelada.' : 'Não foi possível capturar a tela.'); }
};
let voicePending = null;
const ensureVoice = () => { if (voiceStream) return Promise.resolve(true); if (!voicePending) voicePending = abrirMicrofone().finally(() => { voicePending = null; }); return voicePending; };
const abrirMicrofone = async () => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { voiceButton.textContent = 'Microfone indisponível'; setStatus('O microfone exige HTTPS ou http://localhost.'); return false; }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceButton.textContent = 'Microfone ativo'; showCallStatus('connecting', 'Microfone conectado. Conectando chamada...'); showMicState('active', 'Microfone conectado · captando voz'); startVoiceMeter(); await renegotiateVoice(); return true;
  } catch (error) {
    voiceButton.textContent = 'Microfone indisponível'; showCallStatus('error', 'Não foi possível iniciar a chamada de voz.'); showMicState('', 'Microfone indisponível'); setStatus(error.name === 'NotAllowedError' ? 'Permita o microfone nas configurações do navegador.' : 'Não foi possível acessar o microfone.'); return false;
  }
};
const renegotiateVoice = async () => {
  const connections = role === 'host' ? [...hostPeers.entries()] : peer ? [['viewer', peer]] : [];
  for (const [target, connection] of connections) {
    if (connection.signalingState !== 'stable') continue;
    await attachVoice(connection); const offer = await connection.createOffer(); await connection.setLocalDescription(offer); send({ type: 'offer', offer, ...(role === 'host' ? { target } : {}) });
  }
};
stopButton.onclick = () => {
  send({ type: 'end-room' }); localStream?.getTracks().forEach((track) => track.stop()); voiceStream?.getTracks().forEach((track) => track.stop()); hostPeers.forEach((connection) => connection.close()); hostPeers.clear(); peer?.close(); peer = null; localStream = null; voiceStream = null; role = null; viewerId = null; localVideo.srcObject = null; remoteVideo.srcObject = null; removerAudioRemoto(); stopButton.classList.remove('visible'); roomCode.classList.remove('visible'); startButton.disabled = false; joinButton.disabled = false; showCallStatus('error', 'Transmissão encerrada.'); setStatus('Transmissão encerrada. Você pode iniciar outra sem atualizar a página.');
};
voiceButton.onclick = async () => {
  if (!voiceStream) return ensureVoice();
  const track = voiceStream.getAudioTracks()[0]; track.enabled = !track.enabled; voiceButton.textContent = track.enabled ? 'Microfone ativo' : 'Microfone silenciado'; showMicState(track.enabled ? 'active' : 'muted', track.enabled ? 'Microfone conectado · captando voz' : 'Microfone silenciado');
};
chatForm.onsubmit = (event) => { event.preventDefault(); const text = chatInput.value.trim(); if (!text || !send({ type: 'chat', text })) return; chatInput.value = ''; };
joinButton.onclick = () => { const id = roomInput.value.trim().toUpperCase(); if (id.length !== 6) return setStatus('Digite um ID de sala com 6 caracteres.'); role = 'viewer'; if (send({ type: 'join-room', roomId: id })) joinButton.disabled = true; };
qualitySelect.onchange = () => { if (role !== 'viewer') return; send({ type: 'quality-request', quality: qualitySelect.value }); setStatus(qualitySelect.value === 'auto' ? 'Qualidade automática ativada.' : `Qualidade solicitada: ${qualitySelect.value}.`); };
const toggleFullscreen = async () => { if (document.fullscreenElement) return document.exitFullscreen(); if (remoteVideo.requestFullscreen) return remoteVideo.requestFullscreen(); if (remoteVideo.webkitEnterFullscreen) remoteVideo.webkitEnterFullscreen(); };
fullscreenButton.onclick = toggleFullscreen;
remoteVideo.ondblclick = toggleFullscreen;
soundButton.onclick = async () => { remoteVideo.muted = false; remoteVideo.volume = 1; try { await remoteVideo.play(); soundButton.textContent = 'Som ativado'; } catch { setStatus('O navegador bloqueou o áudio. Clique novamente no vídeo.'); } };
copyButton.onclick = async () => { await navigator.clipboard.writeText(roomId.textContent); copyButton.textContent = 'Copiado'; setTimeout(() => copyButton.textContent = 'Copiar', 1500); };
