const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ADMIN_PASS = 'admin123';
const players = {};
const bananas = []; // サーバー側でバナナ（障害物）の位置を管理

io.on('connection', (socket) => {
  // 新規プレイヤー追加
  players[socket.id] = {
    x: 0, y: 0, z: 0, rotY: 0,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    isGod: false
  };

  // 現在のプレイヤー一覧とバナナ情報を送信
  io.emit('updatePlayers', players);
  socket.emit('initBananas', bananas);

  // プレイヤーの移動同期
  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // バナナの設置イベント（誰かがバナナを使った時）
  socket.on('spawn_banana', (data) => {
    const bananaData = { id: Date.now() + Math.random(), x: data.x, z: data.z };
    bananas.push(bananaData);
    io.emit('banana_spawned', bananaData); // 全員にバナナ設置を通知
  });

  // バナナの踏みつけ・消去イベント
  socket.on('remove_banana', (bananaId) => {
    const index = bananas.findIndex(b => b.id === bananaId);
    if (index !== -1) {
      bananas.splice(index, 1);
      io.emit('banana_removed', bananaId); // 全員からバナナを消去
    }
  });

  // --- 管理者コマンド ---
  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS) io.emit('startCountdown');
  });

  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS) io.emit('updateEnvironment', { skyType: data.skyType });
  });

  socket.on('admin_toggle_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].isGod = !players[data.targetId].isGod;
      io.emit('updatePlayers', players);
    }
  });

  // 接続切断時
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
