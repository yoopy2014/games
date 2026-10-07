const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

app.use(express.static(path.join(__dirname, 'public')));

// プレイヤー管理データ
const players = {};

// コース＆背景のワールド初期設定
const worldConfig = {
  // コース仕様（複雑化用チェックポイント設定）
  totalLaps: 3,
  checkpoints: [
    { id: 0, x: 0, z: 0, radius: 15 },    // スタート/ゴールライン
    { id: 1, x: 100, z: 50, radius: 12 },  // コーナー1
    { id: 2, x: 150, z: -80, radius: 12 }, // S字カーブ
    { id: 3, x: 0, z: -150, radius: 15 },  // ヘアピンカーブ
    { id: 4, x: -120, z: -50, radius: 12 }  // バックストレッチ
  ],
  // 背景環境設定（昼・夕方・夜・星空など）
  environment: {
    skyType: 'sunset', // 'day', 'sunset', 'night'
    fogDensity: 0.005,
    lightColor: '#ffaa44'
  }
};

io.on('connection', (socket) => {
  console.log(`接続: ${socket.id}`);

  // プレイヤー初期ステータス
  players[socket.id] = {
    id: socket.id,
    x: 0, y: 1, z: 0,
    rotY: 0,
    speed: 0,
    maxSpeed: 0.8,
    accel: 0.02,
    lap: 1,
    nextCheckpoint: 1, // チェックポイント通過管理
    isFinished: false,
    isGod: false,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
  };

  // 新規接続時にコース・環境データと全プレイヤー状態を同期
  socket.emit('initWorld', worldConfig);
  io.emit('updatePlayers', players);

  // 位置・姿勢の同期
  socket.on('playerTransform', (data) => {
    if (players[socket.id]) {
      Object.assign(players[socket.id], data);
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  // チェックポイント・ゴール通過イベント
  socket.on('passCheckpoint', (data) => {
    const player = players[socket.id];
    if (!player || player.isFinished) return;

    // チェックポイントが順番通りか確認
    if (data.checkpointId === player.nextCheckpoint) {
      player.nextCheckpoint = (player.nextCheckpoint + 1) % worldConfig.checkpoints.length;

      // ゴール（ラップ1周完了）の処理
      if (data.checkpointId === 0) {
        player.lap += 1;

        // 全周回完了時の処理
        if (player.lap > worldConfig.totalLaps) {
          player.isFinished = true;
          // ゴール用の派手なエフェクト（紙吹雪、花火など）の生成命令を全クライアントへ通知
          io.emit('playerFinished', {
            id: socket.id,
            color: player.color,
            time: data.time || null
          });
        } else {
          // ラップ通過時のエフェクト通知
          io.emit('lapCompleted', {
            id: socket.id,
            lap: player.lap
          });
        }
      }

      io.emit('updatePlayers', players);
    }
  });

  // 管理者コマンド：一斉スタート
  socket.on('admin_start_race', (data) => {
    if (data.pass === ADMIN_PASS) {
      io.emit('startCountdown');
    }
  });

  // 管理者コマンド：背景環境の変更（例: 昼夜切り替え）
  socket.on('admin_change_env', (data) => {
    if (data.pass === ADMIN_PASS && data.skyType) {
      worldConfig.environment.skyType = data.skyType;
      io.emit('updateEnvironment', worldConfig.environment);
    }
  });

  // 管理者コマンド：最強処理
  socket.on('admin_make_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].maxSpeed = 2.5;
      players[data.targetId].accel = 0.1;
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
