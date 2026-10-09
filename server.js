const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 静的ファイルの提供 (publicフォルダ内のindex.html, admin.htmlなどを公開)
app.use(express.static(path.join(__dirname, 'public')));

// 全ルームのデータ保持用オブジェクト
// 構造: { [roomCode]: { players: { [socketId]: { name, carType, color, isHost, x, y, z, rotY } }, bananas: [] } }
const rooms = {};

// プレイヤーにランダムで割り当てるカラーリスト
const PLAYER_COLORS = ['#ff2222', '#3388ff', '#00ffcc', '#ffea00', '#ff00ea', '#00ff66'];

// 4桁の英数字ルームコード生成
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log(`[接続] クライアント接続: ${socket.id}`);

  let currentRoomCode = null;

  // --- 1. ルーム作成 ---
  socket.on('create_room', (data) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }

    const color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];

    rooms[roomCode] = {
      players: {
        [socket.id]: {
          name: data.name || 'ホスト',
          carType: data.carType || 'standard',
          color: color,
          isHost: true,
          x: 0, y: 0, z: 0, rotY: 0
        }
      },
      bananas: []
    };

    socket.join(roomCode);
    currentRoomCode = roomCode;

    socket.emit('room_joined', { roomCode: roomCode, isHost: true });
    io.to(roomCode).emit('update_room_players', rooms[roomCode].players);
    socket.emit('initBananas', rooms[roomCode].bananas);

    // 管理者パネル更新通知
    io.emit('admin_rooms_data', rooms);
    console.log(`[部屋作成] Room: ${roomCode} by ${socket.id}`);
  });

  // --- 2. ルーム参加 ---
  socket.on('join_room', (data) => {
    const roomCode = (data.roomCode || '').toUpperCase();
    if (!rooms[roomCode]) {
      return socket.emit('error_msg', '指定されたルームが見つかりません。コードを確認してください。');
    }

    const room = rooms[roomCode];
    if (Object.keys(room.players).length >= 8) {
      return socket.emit('error_msg', '部屋が満員です（最大8人）。');
    }

    const color = PLAYER_COLORS[Object.keys(room.players).length % PLAYER_COLORS.length];

    room.players[socket.id] = {
      name: data.name || 'レーサー',
      carType: data.carType || 'standard',
      color: color,
      isHost: false,
      x: 0, y: 0, z: 0, rotY: 0
    };

    socket.join(roomCode);
    currentRoomCode = roomCode;

    socket.emit('room_joined', { roomCode: roomCode, isHost: false });
    io.to(roomCode).emit('update_room_players', room.players);
    socket.emit('initBananas', room.bananas);

    // 管理者パネル更新通知
    io.emit('admin_rooms_data', rooms);
    console.log(`[部屋参加] Room: ${roomCode} - ${socket.id}`);
  });

  // --- 3. カート変更 ---
  socket.on('selectCar', (carType) => {
    if (currentRoomCode && rooms[currentRoomCode] && rooms[currentRoomCode].players[socket.id]) {
      rooms[currentRoomCode].players[socket.id].carType = carType;
      io.to(currentRoomCode).emit('update_room_players', rooms[currentRoomCode].players);
    }
  });

  // --- 4. レーススタート要求（ホストのみ） ---
  socket.on('request_start_race', () => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const p = rooms[currentRoomCode].players[socket.id];
      if (p && p.isHost) {
        io.to(currentRoomCode).emit('startCountdown');
      }
    }
  });

  // --- 5. プレイヤーの位置・回転同期 ---
  socket.on('playerTransform', (data) => {
    if (currentRoomCode && rooms[currentRoomCode] && rooms[currentRoomCode].players[socket.id]) {
      const p = rooms[currentRoomCode].players[socket.id];
      p.x = data.x;
      p.y = data.y;
      p.z = data.z;
      p.rotY = data.rotY;

      socket.to(currentRoomCode).emit('playerMoved', {
        id: socket.id,
        x: data.x,
        y: data.y,
        z: data.z,
        rotY: data.rotY
      });
    }
  });

  // --- 6. アイテム（バナナ）設置＆削除 ---
  socket.on('spawn_banana', (data) => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const bananaId = 'b_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
      const bananaData = { id: bananaId, x: data.x, z: data.z };
      rooms[currentRoomCode].bananas.push(bananaData);
      io.to(currentRoomCode).emit('banana_spawned', bananaData);
    }
  });

  socket.on('remove_banana', (bananaId) => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      rooms[currentRoomCode].bananas = rooms[currentRoomCode].bananas.filter(b => b.id !== bananaId);
      io.to(currentRoomCode).emit('banana_removed', bananaId);
    }
  });

  // --- 7. ホストによるキック機能 ---
  socket.on('kick_player', (targetSocketId) => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const requester = rooms[currentRoomCode].players[socket.id];
      if (requester && requester.isHost && socket.id !== targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit('kicked');
          targetSocket.leave(currentRoomCode);
        }
        delete rooms[currentRoomCode].players[targetSocketId];
        io.to(currentRoomCode).emit('update_room_players', rooms[currentRoomCode].players);
        io.to(currentRoomCode).emit('playerLeft', targetSocketId);
        io.emit('admin_rooms_data', rooms);
      }
    }
  });

  // ★★★ 8. 管理者パネル（admin.html）用イベント群 ★★★
  
  // 管理者からの部屋一覧データ送信要求
  socket.on('admin_get_rooms', () => {
    socket.emit('admin_rooms_data', rooms);
  });

  // 管理者による強制キック
  socket.on('admin_kick_player', (targetSocketId) => {
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('kicked');
      targetSocket.disconnect(true);
    }

    // 部屋リストから削除
    Object.keys(rooms).forEach(code => {
      if (rooms[code].players[targetSocketId]) {
        delete rooms[code].players[targetSocketId];
        io.to(code).emit('update_room_players', rooms[code].players);
        io.to(code).emit('playerLeft', targetSocketId);
        if (Object.keys(rooms[code].players).length === 0) {
          delete rooms[code];
        }
      }
    });

    io.emit('admin_rooms_data', rooms);
  });

  // 管理者からの全全体アナウンス送信
  socket.on('admin_broadcast_msg', (msg) => {
    io.emit('error_msg', `📢 [管理者メッセージ]: ${msg}`);
  });

  // --- 9. 切断処理 ---
  socket.on('disconnect', () => {
    console.log(`[切断] クライアント切断: ${socket.id}`);
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      const isHost = room.players[socket.id]?.isHost;
      delete room.players[socket.id];

      const remainingIds = Object.keys(room.players);
      if (remainingIds.length === 0) {
        delete rooms[currentRoomCode];
      } else {
        if (isHost) {
          room.players[remainingIds[0]].isHost = true; // ホスト権限の引き継ぎ
        }
        io.to(currentRoomCode).emit('update_room_players', room.players);
        io.to(currentRoomCode).emit('playerLeft', socket.id);
      }
      io.emit('admin_rooms_data', rooms);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 サーバー起動完了: http://localhost:${PORT}`);
  console.log(`⚙️ 管理者画面: http://localhost:${PORT}/admin.html`);
  console.log(`=================================`);
});
