const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const ADMIN_PASS = 'admin123';
// ルーム管理: { roomCode: { hostId: string, players: { socketId: playerObj }, bananas: [] } }
const rooms = {};

// 4桁のルームコード生成
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;

  // 1. パーティー作成
  socket.on('create_room', (data) => {
    const roomCode = generateRoomCode();
    socket.join(roomCode);
    currentRoom = roomCode;

    rooms[roomCode] = {
      hostId: socket.id,
      players: {},
      bananas: []
    };

    rooms[roomCode].players[socket.id] = {
      id: socket.id,
      name: data.name || 'ゲスト',
      carType: data.carType || 'standard',
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      x: 0, y: 0, z: 0, rotY: 0,
      isHost: true,
      isGod: false
    };

    socket.emit('room_joined', { roomCode, isHost: true, players: rooms[roomCode].players });
  });

  // 2. パーティー参加
  socket.on('join_room', (data) => {
    const roomCode = data.roomCode ? data.roomCode.toUpperCase() : '';
    if (!rooms[roomCode]) {
      socket.emit('error_msg', '指定されたルームコードが存在しません。');
      return;
    }

    socket.join(roomCode);
    currentRoom = roomCode;

    rooms[roomCode].players[socket.id] = {
      id: socket.id,
      name: data.name || 'ゲスト',
      carType: data.carType || 'standard',
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      x: 0, y: 0, z: 0, rotY: 0,
      isHost: false,
      isGod: false
    };

    socket.emit('room_joined', { roomCode, isHost: false, players: rooms[roomCode].players });
    io.to(roomCode).emit('update_room_players', rooms[roomCode].players);
    socket.emit('initBananas', rooms[roomCode].bananas);
  });

  // カート選択変更
  socket.on('selectCar', (carType) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
      rooms[currentRoom].players[socket.id].carType = carType;
      io.to(currentRoom).emit('update_room_players', rooms[currentRoom].players);
    }
  });

  // プレイヤーの座標同期
  socket.on('playerTransform', (data) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
      const p = rooms[currentRoom].players[socket.id];
      p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
      socket.to(currentRoom).emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // バナナの同期
  socket.on('spawn_banana', (data) => {
    if (currentRoom && rooms[currentRoom]) {
      const bananaData = { id: Date.now() + Math.random(), x: data.x, z: data.z };
      rooms[currentRoom].bananas.push(bananaData);
      io.to(currentRoom).emit('banana_spawned', bananaData);
    }
  });

  socket.on('remove_banana', (bananaId) => {
    if (currentRoom && rooms[currentRoom]) {
      const bList = rooms[currentRoom].bananas;
      const index = bList.findIndex(b => b.id === bananaId);
      if (index !== -1) {
        bList.splice(index, 1);
        io.to(currentRoom).emit('banana_removed', bananaId);
      }
    }
  });

  // 3. レーススタート要求
  socket.on('request_start_race', () => {
    if (currentRoom && rooms[currentRoom]) {
      if (rooms[currentRoom].hostId === socket.id) {
        io.to(currentRoom).emit('startCountdown');
      }
    }
  });

  // 4. キック機能（ホストのみ実行可能）
  socket.on('kick_player', (targetId) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].hostId === socket.id) {
      if (targetId !== socket.id && rooms[currentRoom].players[targetId]) {
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) {
          targetSocket.emit('kicked');
          targetSocket.leave(currentRoom);
        }
        delete rooms[currentRoom].players[targetId];
        io.to(currentRoom).emit('update_room_players', rooms[currentRoom].players);
        io.to(currentRoom).emit('playerLeft', targetId);
      }
    }
  });

  // 管理者コマンド
  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS && currentRoom) io.to(currentRoom).emit('startCountdown');
  });

  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS && currentRoom) io.to(currentRoom).emit('updateEnvironment', { skyType: data.skyType });
  });

  socket.on('admin_toggle_god', (data) => {
    if (data.pass === ADMIN_PASS && currentRoom && rooms[currentRoom].players[data.targetId]) {
      rooms[currentRoom].players[data.targetId].isGod = !rooms[currentRoom].players[data.targetId].isGod;
      io.to(currentRoom).emit('update_room_players', rooms[currentRoom].players);
    }
  });

  // 切断処理
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[socket.id];

      // ホストが抜けたら新しいホストを割り当て
      if (rooms[currentRoom].hostId === socket.id) {
        const remainingIds = Object.keys(rooms[currentRoom].players);
        if (remainingIds.length > 0) {
          rooms[currentRoom].hostId = remainingIds[0];
          rooms[currentRoom].players[remainingIds[0]].isHost = true;
        } else {
          delete rooms[currentRoom]; // 部屋が空になったら削除
        }
      }

      if (rooms[currentRoom]) {
        io.to(currentRoom).emit('playerLeft', socket.id);
        io.to(currentRoom).emit('update_room_players', rooms[currentRoom].players);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
