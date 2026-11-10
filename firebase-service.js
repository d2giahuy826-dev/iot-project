/**
 * firebase-service.js
 * Đồng bộ dữ liệu lên Google Firebase Realtime Database (100% MIỄN PHÍ - SPARK PLAN)
 * - Tự động cập nhật trạng thái lùi xe trực tiếp (Live Telemetry 24/7)
 * - Lưu lịch sử sự kiện lùi xe lên Cloud Realtime
 * - Dùng fetch native của Node.js (không cần cài thêm thư viện nặng)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'firebase-config.json');

let config = {
  enabled: true,
  databaseURL: ''
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.warn('[Firebase] Lỗi đọc file firebase-config.json:', e.message);
    }
  }
}

loadConfig();

function getNormalizedUrl() {
  if (!config.enabled || !config.databaseURL) return null;
  let url = config.databaseURL.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Cập nhật trạng thái trực tiếp thời gian thực (/live.json)
 * Bất kỳ ai mở Web Cloud Dashboard từ xa đều thấy cự ly xe nhảy từng cm
 */
async function updateLiveStatus(distance, level, statusText) {
  const baseUrl = getNormalizedUrl();
  if (!baseUrl) return;

  const payload = {
    distance: parseInt(distance, 10),
    level: parseInt(level, 10),
    statusText: statusText,
    updatedAt: new Date().toISOString(),
    timestamp: Date.now()
  };

  try {
    const res = await fetch(`${baseUrl}/live.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn('[Firebase] Lỗi cập nhật Live Status:', res.statusText);
    }
  } catch (err) {
    // Không làm gián đoạn hệ thống khi mất kết nối mạng ngoài trời
  }
}

/**
 * Ghi bản ghi sự kiện lùi xe vào lịch sử Cloud (/logs.json)
 */
async function pushEventLog(distance, level, statusText) {
  const baseUrl = getNormalizedUrl();
  if (!baseUrl) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN') + ' ' + now.toLocaleDateString('vi-VN');

  const payload = {
    distance: parseInt(distance, 10),
    level: parseInt(level, 10),
    statusText: statusText,
    createdAt: timeStr,
    timestamp: Date.now()
  };

  try {
    await fetch(`${baseUrl}/logs.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[Firebase] ☁️ Đã đồng bộ lên Cloud: ${distance}cm (${statusText})`);
  } catch (err) {
    console.warn('[Firebase] Không thể kết nối Cloud:', err.message);
  }
}

module.exports = {
  loadConfig,
  updateLiveStatus,
  pushEventLog,
  getNormalizedUrl
};

