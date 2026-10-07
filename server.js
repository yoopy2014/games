const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// public フォルダ内の静的ファイル（index.html など）を配信
app.use(express.static(path.join(__dirname, 'public')));

// プレイヤー管理データ
const players = {};

io.on('connection', (socket) => {
  console.log(`接続: ${socket.id}`);

  // 初期ステータス設定
  players[socket.id] = {
    id: socket.id,
    x: 80, y: 0, z: 0,
    rotY: 0,
    speed: 0,
    maxSpeed: 0.8,
    accel: 0.02,
    lap: 1,
    isGod: false,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
  };

  // 全員に現在のプレイヤー情報を送信
  io.emit('updatePlayers', players);

  // プレイヤーからの操作・位置同期
  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      Object.assign(players[socket.id], data);
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // 管理者コマンド：レース一斉スタート
  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS) {
      // 全クライアントにカウントダウン開始命令を通知
      io.emit('startCountdown');
    }
  });

  // 管理者コマンド：最強処理
  socket.on('admin_make_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].maxSpeed = 2.5; // 超絶スピード
      players[data.targetId].accel = 0.1;   // 超加速度
      players[data.targetId].isGod = true;
      io.emit('godGranted', { targetId: data.targetId });
      io.emit('updatePlayers', players);
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`切断: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
    io.emit('updatePlayers', players);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
