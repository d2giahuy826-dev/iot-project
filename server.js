/**
 * ============================================================================
 * DỰ ÁN: HỆ THỐNG HỖ TRỢ LÙI XE AN TOÀN (REVERSE PARKING SYSTEM)
 * FILE: server.js
 * MÔ TẢ: HTTPS Server + WebRTC Signaling + Cơ sở dữ liệu SQL (SQLite Native)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');
const db = require('./database');

const PORT = process.env.PORT || 3443;
const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');

// 1. Tự động kiểm tra và tạo chứng chỉ SSL Self-signed
function ensureCertificates() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
  }

  if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
    console.log('[SSL] Đang tự động sinh chứng chỉ SSL Self-Signed cho HTTPS...');
    
    const ips = getLocalIPs();
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...ips.map(ip => ({ type: 7, ip }))
    ];

    const attrs = [{ name: 'commonName', value: 'Smart Reverse Parking System' }];
    const pems = selfsigned.generate(attrs, {
      algorithm: 'sha256',
      days: 365,
      keySize: 2048,
      extensions: [{ name: 'subjectAltName', altNames }]
    });

    fs.writeFileSync(CERT_PATH, pems.cert, 'utf8');
    fs.writeFileSync(KEY_PATH, pems.private, 'utf8');
  }

  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  };
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// 2. Khởi tạo Express App
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// API Server Info & QR Code
app.get('/api/server-info', async (req, res) => {
  const ips = getLocalIPs();
  const primaryIP = ips[0] || 'localhost';
  const cameraUrl = `https://${primaryIP}:${PORT}/camera.html`;
  
  try {
    const qrDataUrl = await QRCode.toDataURL(cameraUrl, {
      width: 280,
      margin: 2
    });

    res.json({
      port: PORT,
      ips: ips,
      primaryIP: primaryIP,
      cameraUrl: cameraUrl,
      qrCode: qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CÁC ENDPOINT DATABASE SQL LƯU LỊCH SỬ
// ==========================================

// Ghi dữ liệu cảm biến vào Database SQL
app.post('/api/logs', (req, res) => {
  const { distance, level } = req.body;
  if (typeof distance === 'undefined' || typeof level === 'undefined') {
    return res.status(400).json({ error: 'Thiếu tham số distance hoặc level' });
  }

  try {
    db.insertLog(distance, level);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lấy 50 bản ghi gần nhất từ Database SQL
app.get('/api/logs', (req, res) => {
  try {
    const logs = db.getRecentLogs(50);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa lịch sử trong Database SQL
app.delete('/api/logs', (req, res) => {
  try {
    db.clearLogs();
    res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử SQL' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 3. Khởi tạo HTTPS Server
const sslOptions = ensureCertificates();
const server = https.createServer(sslOptions, app);

// 4. Khởi tạo WebSocket Signaling
const wss = new WebSocketServer({ server });

let cameraSocket = null;
let monitorSocket = null;

wss.on('connection', (ws) => {
  let clientRole = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'register':
          clientRole = data.role;
          if (clientRole === 'camera') {
            cameraSocket = ws;
            if (monitorSocket && monitorSocket.readyState === WebSocket.OPEN) {
              monitorSocket.send(JSON.stringify({ type: 'camera_status', online: true }));
              ws.send(JSON.stringify({ type: 'ready_to_call' }));
            }
          } else if (clientRole === 'monitor') {
            monitorSocket = ws;
            const isCamOnline = (cameraSocket && cameraSocket.readyState === WebSocket.OPEN);
            ws.send(JSON.stringify({ type: 'camera_status', online: isCamOnline }));
            if (isCamOnline) {
              cameraSocket.send(JSON.stringify({ type: 'ready_to_call' }));
            }
          }
          break;

        case 'offer':
          if (monitorSocket && monitorSocket.readyState === WebSocket.OPEN) {
            monitorSocket.send(JSON.stringify({ type: 'offer', sdp: data.sdp }));
          }
          break;

        case 'answer':
          if (cameraSocket && cameraSocket.readyState === WebSocket.OPEN) {
            cameraSocket.send(JSON.stringify({ type: 'answer', sdp: data.sdp }));
          }
          break;

        case 'candidate':
          if (clientRole === 'camera' && monitorSocket && monitorSocket.readyState === WebSocket.OPEN) {
            monitorSocket.send(JSON.stringify({ type: 'candidate', candidate: data.candidate }));
          } else if (clientRole === 'monitor' && cameraSocket && cameraSocket.readyState === WebSocket.OPEN) {
            cameraSocket.send(JSON.stringify({ type: 'candidate', candidate: data.candidate }));
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (err) {}
  });

  ws.on('close', () => {
    if (ws === cameraSocket) {
      cameraSocket = null;
      if (monitorSocket && monitorSocket.readyState === WebSocket.OPEN) {
        monitorSocket.send(JSON.stringify({ type: 'camera_status', online: false }));
      }
    } else if (ws === monitorSocket) {
      monitorSocket = null;
    }
  });
});

server.listen(PORT, async () => {
  const localIPs = getLocalIPs();
  console.log('\n===============================================================');
  console.log('🚗  HỆ THỐNG HỖ TRỢ LÙI XE AN TOÀN - SERVER + SQL DATABASE ĐÃ SẴN SÀNG!');
  console.log('===============================================================');
  console.log(`🔒 HTTPS & WebSocket đang lắng nghe cổng: ${PORT}`);
  console.log(`💾 Cơ sở dữ liệu SQL: d:\\IOT\\parking_history.db (SQLite Native)`);
  console.log(`📌 Mở màn hình lùi xe: https://localhost:${PORT}/monitor.html\n`);
});
