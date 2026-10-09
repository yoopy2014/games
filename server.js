const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ADMIN_PASS = 'admin123';
const players = {};
const bananas = [];
let hostSocketId = null; // パーティーリーダーのID

io.on('connection', (socket) => {
  // 最初に接続した人をパーティーリーダー（ホスト）にする
  if (!hostSocketId) {
    hostSocketId = socket.id;
  }

  players[socket.id] = {
    x: 0, y: 0, z: 0, rotY: 0,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    carType: 'standard',
    isGod: false,
    isHost: socket.id === hostSocketId
  };

  // 全員にプレイヤー情報を通知（誰がリーダーかも含む）
  io.emit('updatePlayers', players);
  socket.emit('initBananas', bananas);

  // カート選択の同期
  socket.on('selectCar', (carType) => {
    if (players[socket.id]) {
      players[socket.id].carType = carType;
      io.emit('updatePlayers', players);
    }
  });

  // 座標・回転同期
  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // バナナの設置
  socket.on('spawn_banana', (data) => {
    const bananaData = { id: Date.now() + Math.random(), x: data.x, z: data.z };
    bananas.push(bananaData);
    io.emit('banana_spawned', bananaData);
  });

  // バナナの消去
  socket.on('remove_banana', (bananaId) => {
    const index = bananas.findIndex(b => b.id === bananaId);
    if (index !== -1) {
      bananas.splice(index, 1);
      io.emit('banana_removed', bananaId);
    }
  });

  // ★ レーススタート要求（ホストまたは管理者パスワード保持者のみ発動）
  socket.on('request_start_race', (data) => {
    const isPassValid = data && data.pass === ADMIN_PASS;
    const isHost = socket.id === hostSocketId;

    if (isPassValid || isHost) {
      io.emit('startCountdown'); // 全プレイヤーに一斉スタートを指示
    }
  });

  // 管理者コマンド
  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS) io.emit('updateEnvironment', { skyType: data.skyType });
  });

  socket.on('admin_toggle_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].isGod = !players[data.targetId].isGod;
      io.emit('updatePlayers', players);
    }
  });

  // 切断処理（リーダーの移譲）
  socket.on('disconnect', () => {
    delete players[socket.id];
    if (hostSocketId === socket.id) {
      const remainingIds = Object.keys(players);
      hostSocketId = remainingIds.length > 0 ? remainingIds[0] : null;
      if (hostSocketId) players[hostSocketId].isHost = true;
    }
    io.emit('playerLeft', socket.id);
    io.emit('updatePlayers', players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
