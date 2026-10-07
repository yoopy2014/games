const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ADMIN_PASS = 'admin123';
const players = {};

io.on('connection', (socket) => {
  players[socket.id] = {
    x: 0, y: 0, z: 0, rotY: 0,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    isGod: false
  };

  io.emit('updatePlayers', players);

  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS) io.emit('startCountdown');
  });

  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS) io.emit('updateEnvironment', { skyType: data.skyType });
  });

  // ★ GOD MODEの切り替え（ON ⇔ OFF）
  socket.on('admin_toggle_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      // isGod の true/false を反転
      players[data.targetId].isGod = !players[data.targetId].isGod;
      // 変更結果を全員（クライアント側）へ即時通知
      io.emit('updatePlayers', players);
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
