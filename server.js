const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT) || 3000;
const rooms = new Map();

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function relay(room, sender, message) {
  for (const peer of [room.host, room.viewer]) {
    if (peer && peer !== sender) send(peer, message);
  }
}

const server = http.createServer((request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      return response.end('Not found');
    }
    const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'create-room') {
      const roomId = crypto.randomBytes(3).toString('hex').toUpperCase();
      rooms.set(roomId, { host: socket, viewer: null });
      socket.roomId = roomId;
      socket.role = 'host';
      return send(socket, { type: 'room-created', roomId });
    }

    if (message.type === 'join-room') {
      const room = rooms.get(String(message.roomId || '').toUpperCase());
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' });
      if (room.viewer) return send(socket, { type: 'error', message: 'Essa sala já está cheia.' });
      room.viewer = socket;
      socket.roomId = String(message.roomId).toUpperCase();
      socket.role = 'viewer';
      send(socket, { type: 'joined-room', roomId: socket.roomId });
      return send(room.host, { type: 'viewer-joined' });
    }

    if (socket.roomId && ['offer', 'answer', 'ice-candidate'].includes(message.type)) {
      const room = rooms.get(socket.roomId);
      if (room) relay(room, socket, message);
    }
  });

  socket.on('close', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    relay(room, socket, { type: 'peer-left' });
    if (room.host === socket) rooms.delete(socket.roomId);
    else room.viewer = null;
  });
});

server.listen(port, () => console.log(`Pideias Telas disponível em http://localhost:${port}`));
