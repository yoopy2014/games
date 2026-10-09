<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ゲーム管理者ダッシュボード</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #111;
      color: #fff;
      margin: 20px;
    }
    h1 { color: #ff0055; text-align: center; }
    .card {
      background: #222;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .card h2 { margin-top: 0; color: #00ffcc; border-bottom: 1px solid #444; padding-bottom: 8px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      border: 1px solid #444;
      padding: 8px;
      text-align: left;
    }
    th { background: #333; color: #ffea00; }
    .btn {
      background: #ff0055;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    .btn:hover { background: #ff3377; }
    .btn-small { padding: 3px 8px; font-size: 12px; }
    input[type="text"] {
      padding: 8px;
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      width: 70%;
    }
  </style>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>

  <h1>⚙️ レースゲーム 管理者パネル</h1>

  <div class="card">
    <h2>サーバー接続状態</h2>
    <p>ステータス: <span id="status" style="color:#00ffcc; font-weight:bold;">接続中...</span></p>
    <button class="btn" onclick="refreshData()">🔄 手動更新</button>
  </div>

  <div class="card">
    <h2>アクティブパーティー部屋一覧</h2>
    <div id="rooms-container">部屋データを取得中...</div>
  </div>

  <div class="card">
    <h2>全体アナウンス送信</h2>
    <input type="text" id="announce-msg" placeholder="全プレイヤーの画面に通知するメッセージを入力">
    <button class="btn" onclick="sendBroadcast()">📢 アナウンス送信</button>
  </div>

  <script>
    const socket = io();

    socket.on('connect', () => {
      document.getElementById('status').innerText = '接続済み (ID: ' + socket.id + ')';
      socket.emit('admin_get_rooms');
    });

    socket.on('disconnect', () => {
      document.getElementById('status').innerText = '切断されました';
    });

    socket.on('admin_rooms_data', (rooms) => {
      const container = document.getElementById('rooms-container');
      if (!rooms || Object.keys(rooms).length === 0) {
        container.innerHTML = '<p style="color:#888;">現在アクティブなマルチプレイヤー部屋はありません。</p>';
        return;
      }

      let html = '';
      Object.keys(rooms).forEach(code => {
        const room = rooms[code];
        html += `<div style="background:#2a2a2a; padding:10px; margin-bottom:12px; border-radius:6px; border-left:4px solid #ff0055;">`;
        html += `<h3 style="margin:0 0 8px 0; color:#00ffcc;">ROOM: ${code} <span style="font-size:12px; color:#aaa;">(参加人数: ${Object.keys(room.players).length}名)</span></h3>`;
        html += `<table><tr><th>Socket ID</th><th>名前</th><th>タイプ</th><th>ホスト</th><th>操作</th></tr>`;

        Object.keys(room.players).forEach(pId => {
          const p = room.players[pId];
          html += `<tr>
            <td>${pId}</td>
            <td style="color:${p.color}; font-weight:bold;">${p.name}</td>
            <td>${p.carType}</td>
            <td>${p.isHost ? '👑 Lead' : '-'}</td>
            <td><button class="btn btn-small" onclick="kickPlayer('${pId}')">キック</button></td>
          </tr>`;
        });

        html += `</table></div>`;
      });

      container.innerHTML = html;
    });

    function refreshData() {
      socket.emit('admin_get_rooms');
    }

    function kickPlayer(targetId) {
      if (confirm(`プレイヤー [ ${targetId} ] をキックしますか？`)) {
        socket.emit('admin_kick_player', targetId);
        setTimeout(refreshData, 500);
      }
    }

    function sendBroadcast() {
      const msg = document.getElementById('announce-msg').value.trim();
      if (!msg) return alert('メッセージを入力してください');
      socket.emit('admin_broadcast_msg', msg);
      document.getElementById('announce-msg').value = '';
      alert('アナウンスを送信しました！');
    }

    setInterval(refreshData, 5000);
  </script>
</body>
</html>
