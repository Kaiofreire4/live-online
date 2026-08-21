const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT) || 3000;
const maxViewers = 12;
const rooms = new Map();
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
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
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'text/plain';
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
      rooms.set(roomId, { host: socket, viewers: new Map() });
      socket.roomId = roomId;
      socket.role = 'host';
      return send(socket, { type: 'room-created', roomId });
    }

    if (message.type === 'join-room') {
      const room = rooms.get(String(message.roomId || '').toUpperCase());
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' });
      if (room.viewers.size >= maxViewers) return send(socket, { type: 'error', message: 'Essa sala já atingiu o limite de espectadores.' });
      const viewerId = crypto.randomBytes(4).toString('hex');
      room.viewers.set(viewerId, socket);
      socket.roomId = String(message.roomId).toUpperCase();
      socket.role = 'viewer';
      socket.viewerId = viewerId;
      send(socket, { type: 'joined-room', roomId: socket.roomId, viewerId });
      return send(room.host, { type: 'viewer-joined', viewerId, count: room.viewers.size });
    }

    if (message.type === 'end-room' && socket.role === 'host' && socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (!room) return;
      for (const viewer of room.viewers.values()) {
        send(viewer, { type: 'room-ended' });
        viewer.roomId = null;
        viewer.role = null;
        viewer.viewerId = null;
      }
      rooms.delete(socket.roomId);
      socket.roomId = null;
      socket.role = null;
      return;
    }

    if (message.type === 'chat' && socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (!room) return;
      const chatMessage = {
        type: 'chat',
        sender: socket.role === 'host' ? 'Transmissor' : `Espectador ${socket.viewerId.slice(0, 4)}`,
        text: String(message.text || '').trim().slice(0, 500),
      };
      if (!chatMessage.text) return;
      send(room.host, chatMessage);
      for (const viewer of room.viewers.values()) send(viewer, chatMessage);
      return;
    }

    if (socket.roomId && message.type === 'quality-request' && socket.role === 'viewer') {
      const room = rooms.get(socket.roomId);
      if (!room) return;
      return send(room.host, { type: 'quality-request', quality: ['auto', '360p', '480p', '720p'].includes(message.quality) ? message.quality : '720p', viewerId: socket.viewerId });
    }

    if (socket.roomId && ['offer', 'answer', 'ice-candidate'].includes(message.type)) {
      const room = rooms.get(socket.roomId);
      if (!room) return;
      if (socket.role === 'host') {
        const viewer = room.viewers.get(message.target);
        if (viewer) send(viewer, message);
      } else {
        send(room.host, { ...message, viewerId: socket.viewerId });
      }
    }
  });

  socket.on('close', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (room.host === socket) {
      for (const viewer of room.viewers.values()) send(viewer, { type: 'peer-left' });
      rooms.delete(socket.roomId);
    } else {
      room.viewers.delete(socket.viewerId);
      send(room.host, { type: 'peer-left', viewerId: socket.viewerId });
    }
  });
});

server.listen(port, () => console.log(`Pideias Telas disponível em http://localhost:${port}`));
