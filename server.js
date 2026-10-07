const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = "admin123";

const players = {};

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>iPad Racing & Admin</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    * { box-sizing: border-box; touch-action: manipulation; user-select: none; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a1a; color: #fff; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; }
    .container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; max-width: 1000px; width: 100%; }
    canvas { background: #2e7d32; border: 3px solid #555; border-radius: 12px; max-width: 100%; height: auto; }
    #admin { width: 300px; background: #2a2a2a; padding: 15px; border-radius: 12px; }
    input { background: #444; color: #fff; border: 1px solid #666; padding: 8px; border-radius: 6px; width: 100%; margin-bottom: 10px; font-size: 16px; }
    button { background: #e63946; color: #fff; border: none; padding: 10px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; margin-top: 5px; }
    .p-card { background: #3a3a3a; padding: 10px; margin-bottom: 8px; border-radius: 8px; font-size: 13px; }
    .badge-god { color: #ffd700; font-weight: bold; }
    
    /* タッチ・画面操作用オプショナルUI */
    #touch-controls { display: flex; gap: 20px; margin-top: 10px; justify-content: space-between; width: 100%; max-width: 500px; }
    .btn-group { display: flex; gap: 10px; }
    .t-btn { width: 60px; height: 60px; background: #444; border: 2px solid #666; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; }
    .t-btn:active { background: #666; }
  </style>
</head>
<body>

  <h2>2D オンラインレース（iPad / PC対応）</h2>

  <div class="container">
    <div>
      <canvas id="track" width="500" height="500"></canvas>
      
      <!-- 画面操作ボタン（キーボード未接続時や併用時用） -->
      <div id="touch-controls">
        <div class="btn-group">
          <div class="t-btn" id="btn-left">←</div>
          <div class="t-btn" id="btn-right">→</div>
        </div>
        <div class="btn-group">
          <div class="t-btn" id="btn-down">↓</div>
          <div class="t-btn" id="btn-up">↑</div>
        </div>
      </div>
    </div>

    <!-- 管理者パネル -->
    <div id="admin">
      <h3>管理者パネル</h3>
      <input type="password" id="pass" placeholder="パスワード (admin123)">
      <h4>プレイヤー一覧 (40人対応)</h4>
      <div id="list"></div>
    </div>
  </div>

<script>
  const socket = io();
  const canvas = document.getElementById('track');
  const ctx = canvas.getContext('2d');
  const list = document.getElementById('list');

  // キーボード状態
  const keys = { up: false, down: false, left: false, right: false };

  // iPad外付けキーボード入力イベント
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'w', 'W'].includes(e.key)) keys.up = true;
    if (['ArrowDown', 's', 'S'].includes(e.key)) keys.down = true;
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = true;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = true;
  });

  window.addEventListener('keyup', e => {
    if (['ArrowUp', 'w', 'W'].includes(e.key)) keys.up = false;
    if (['ArrowDown', 's', 'S'].includes(e.key)) keys.down = false;
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.left = false;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = false;
  });

  // 画面タッチボタンのイベント割り当て
  function bindTouch(id, keyName) {
    const el = document.getElementById(id);
    const start = (e) => { e.preventDefault(); keys[keyName] = true; };
    const end = (e) => { e.preventDefault(); keys[keyName] = false; };
    el.addEventListener('touchstart', start);
    el.addEventListener('touchend', end);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
  }
  bindTouch('btn-up', 'up');
  bindTouch('btn-down', 'down');
  bindTouch('btn-left', 'left');
  bindTouch('btn-right', 'right');

  // コース描画
  function drawTrack() {
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(0, 0, 500, 500);

    ctx.beginPath();
    ctx.ellipse(250, 250, 190, 150, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#424242';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(250, 250, 100, 70, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2e7d32';
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(250, 400);
    ctx.lineTo(250, 500);
    ctx.stroke();
  }

  // 状態同期と描画
  socket.on('update', (players) => {
    drawTrack();
    list.innerHTML = '';

    Object.keys(players).forEach(id => {
      const p = players[id];

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      if (p.isGod) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12;
      }

      ctx.fillStyle = p.color;
      ctx.fillRect(-10, -6, 20, 12);

      ctx.fillStyle = '#000';
      ctx.fillRect(2, -4, 5, 8);

      ctx.restore();

      const card = document.createElement('div');
      card.className = 'p-card';
      card.innerHTML = \`
        <b>ID:</b> \${id.slice(0, 5)}... \${p.isGod ? '<span class="badge-god">[最強状態]</span>' : ''}<br>
        最高速度: \${p.maxSpeed}<br>
        <button onclick="makeGod('\${id}')">このマシンを最強にする</button>
      \`;
      list.appendChild(card);
    });
  });

  // 入力送信 (30Hz)
  setInterval(() => {
    if (keys.up || keys.down || keys.left || keys.right) {
      socket.emit('control', keys);
    }
  }, 1000 / 30);

  function makeGod(targetId) {
    const pass = document.getElementById('pass').value;
    socket.emit('admin_god', { pass, targetId });
  }
</script>
</body>
</html>
  `);
});

// サーバー物理演算処理
io.on('connection', (socket) => {
  players[socket.id] = {
    x: 250,
    y: 450,
    angle: 0,
    speed: 0,
    maxSpeed: 5,
    accel: 0.2,
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    isGod: false
  };

  io.emit('update', players);

  socket.on('control', (input) => {
    const p = players[socket.id];
    if (!p) return;

    if (input.up) p.speed = Math.min(p.maxSpeed, p.speed + p.accel);
    else if (input.down) p.speed = Math.max(-p.maxSpeed / 2, p.speed - p.accel);
    else p.speed *= 0.95;

    if (Math.abs(p.speed) > 0.1) {
      const turnSens = p.speed > 0 ? 0.08 : -0.08;
      if (input.left) p.angle -= turnSens;
      if (input.right) p.angle += turnSens;
    }

    p.x += Math.cos(p.angle) * p.speed;
    p.y += Math.sin(p.angle) * p.speed;

    p.x = Math.max(15, Math.min(485, p.x));
    p.y = Math.max(15, Math.min(485, p.y));

    io.emit('update', players);
  });

  socket.on('admin_god', (data) => {
    if (data.pass === ADMIN_PASS && players[data.targetId]) {
      players[data.targetId].maxSpeed = 16;
      players[data.targetId].accel = 0.8;
      players[data.targetId].isGod = true;
      io.emit('update', players);
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('update', players);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
