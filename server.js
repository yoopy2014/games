const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ADMIN_PASS = 'admin123'; // 管理者パスワード
const players = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 新規プレイヤーの初期化
  players[socket.id] = {
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    isGod: false
  };

  // 全員に現在のプレイヤー一覧を送信
  io.emit('updatePlayers', players);

  // プレイヤー移動の同期
  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // 管理者：一斉スタート
  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS) {
      io.emit('startCountdown');
    }
  });

  // 管理者：環境変更
  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS) {
      io.emit('updateEnvironment', { skyType: data.skyType });
    }
  });

  // 管理者：特定のプレイヤーを最強（GOD MODE）にする
  socket.on('admin_toggle_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].isGod = !players[data.targetId].isGod;
      // 全員に最新のステータスを再送して即時適用
      io.emit('updatePlayers', players);
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
