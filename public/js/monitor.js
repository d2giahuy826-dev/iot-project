/**
 * monitor.js
 * Logic cho Màn hình Lùi xe trên Laptop:
 * - ĐỒNG BỘ 100% VỚI 3 ĐÈN LED TRÊN ARDUINO THẬT (XANH - VÀNG - ĐỎ)
 * - TỰ ĐỘNG GHI LỊCH SỬ THÔNG MINH TIẾT KIỆM BỘ NHỚ VÀO SQL SERVER (SSMS 19)
 * - KHÓA CHỐNG RUNG (HYSTERESIS): ĐỨNG YÊN MỘT CHỖ TUYỆT ĐỐI KHÔNG GHI THÊM
 */

let currentStream = null;
let currentSource = 'iriun';

let serialPort = null;
let serialReader = null;
let isSerialReading = false;
let packetCount = 0;

// Biến quản lý ghi log thông minh vào SQL Database
let lastSavedDist = -1;
let lastSavedLevel = -1;
let lastSavedTime = 0;

let isDemoMode = false;
let demoInterval = null;
let demoDist = 50;
let demoDirection = -1;

let isMirrored = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;

let buzzer = null;
let guideOverlay = null;

// DOM Elements
const remoteVideo = document.getElementById('remoteVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const dangerBorder = document.getElementById('dangerFlashBorder');
const centerAlert = document.getElementById('hudCenterAlert');

// HUD Display
const distanceValueEl = document.getElementById('distanceValue');
const statusBadgeEl = document.getElementById('statusBadge');
const distanceBarFill = document.getElementById('distanceBarFill');
const camStatusText = document.getElementById('camStatusText');
const arduinoStatusText = document.getElementById('arduinoStatusText');
const fpsText = document.getElementById('fpsText');
const rawSerialText = document.getElementById('rawSerialText');
const rxIndicator = document.getElementById('rxIndicator');
const serialBaudSelect = document.getElementById('serialBaudSelect');
const serialConsoleBox = document.getElementById('serialConsoleBox');

// Radar Sonar Elements
const sonarArc1 = document.getElementById('sonarArc1');
const sonarArc2 = document.getElementById('sonarArc2');
const sonarArc3 = document.getElementById('sonarArc3');
const sonarArc4 = document.getElementById('sonarArc4');

// Nút điều khiển
const btnConnectIriun = document.getElementById('btnConnectIriun');
const btnConnectIriunPlaceholder = document.getElementById('btnConnectIriunPlaceholder');
const btnConnectSerial = document.getElementById('btnConnectSerial');
const btnDisconnectSerial = document.getElementById('btnDisconnectSerial');
const btnToggleAudio = document.getElementById('btnToggleAudio');
const btnToggleMirror = document.getElementById('btnToggleMirror');
const btnFullscreen = document.getElementById('btnFullscreen');
const toastEl = document.getElementById('toastMsg');
const cameraSourceSelect = document.getElementById('cameraSourceSelect');

window.addEventListener('DOMContentLoaded', async () => {
  buzzer = new ParkingAudioBuzzer();
  guideOverlay = new ParkingGuideOverlay(overlayCanvas);

  if (btnConnectIriun) btnConnectIriun.addEventListener('click', () => connectIriunWebcam(true));
  if (btnConnectIriunPlaceholder) btnConnectIriunPlaceholder.addEventListener('click', () => connectIriunWebcam(true));

  btnConnectSerial.addEventListener('click', connectArduinoSerial);
  btnDisconnectSerial.addEventListener('click', disconnectArduinoSerial);
  btnToggleAudio.addEventListener('click', toggleAudio);
  btnToggleMirror.addEventListener('click', toggleMirror);
  btnFullscreen.addEventListener('click', toggleFullscreen);

  if (cameraSourceSelect) {
    cameraSourceSelect.addEventListener('change', handleCameraSelectChange);
  }

  await connectIriunWebcam(false);
  requestAnimationFrame(calculateFPS);
});

function logSerial(msg) {
  if (!serialConsoleBox) return;
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}\n`;
  serialConsoleBox.textContent = (line + serialConsoleBox.textContent).slice(0, 1000);
}

// ==========================================
// 1. KẾT NỐI IRIUN WEBCAM
// ==========================================
async function connectIriunWebcam(userClicked = false) {
  try {
    camStatusText.textContent = 'Đang tìm Iriun Webcam...';
    camStatusText.style.color = '#ff9100';

    let tempStream = null;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (permErr) {
      if (userClicked) showToast('Vui lòng bấm "Cho phép" (Allow) quyền Camera!');
      camStatusText.textContent = 'Chưa cấp quyền Camera';
      camStatusText.style.color = '#ff1744';
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (tempStream) tempStream.getTracks().forEach(t => t.stop());

    cameraSourceSelect.innerHTML = '';
    let targetDeviceId = null;
    let iriunDevice = null;

    videoDevices.forEach((device, index) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      const label = device.label || `Camera ${index + 1}`;
      opt.textContent = `📷 ${label}`;

      if (label.toLowerCase().includes('iriun')) {
        opt.textContent = `🌟 ${label} (Đang dùng)`;
        iriunDevice = device;
      }
      cameraSourceSelect.appendChild(opt);
    });

    if (iriunDevice) {
      targetDeviceId = iriunDevice.deviceId;
      cameraSourceSelect.value = targetDeviceId;
    } else if (videoDevices.length > 0) {
      targetDeviceId = videoDevices[0].deviceId;
      cameraSourceSelect.value = targetDeviceId;
    }

    if (!targetDeviceId) {
      camStatusText.textContent = 'Không có Webcam';
      camStatusText.style.color = '#ff1744';
      return;
    }

    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: targetDeviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });

    remoteVideo.srcObject = currentStream;
    await remoteVideo.play();
    videoPlaceholder.classList.add('hidden');

    const activeName = iriunDevice ? 'Iriun Webcam (Trực tiếp)' : (videoDevices[0].label || 'Camera Laptop');
    camStatusText.textContent = activeName;
    camStatusText.style.color = '#00e676';
    showToast('✅ Đã kết nối Camera: ' + activeName);

  } catch (err) {
    console.error('Lỗi kết nối Iriun Webcam:', err);
    camStatusText.textContent = 'Lỗi kết nối Camera';
    camStatusText.style.color = '#ff1744';
  }
}

async function handleCameraSelectChange() {
  const selectedId = cameraSourceSelect.value;
  if (!selectedId) return;

  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: selectedId },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    remoteVideo.srcObject = currentStream;
    await remoteVideo.play();
    videoPlaceholder.classList.add('hidden');

    const selectedName = cameraSourceSelect.options[cameraSourceSelect.selectedIndex].text;
    camStatusText.textContent = selectedName.replace('📷 ', '').replace('🌟 ', '');
    camStatusText.style.color = '#00e676';
  } catch (err) {
    showToast('Không thể chuyển camera: ' + err.message);
  }
}

// ==========================================
// 2. KẾT NỐI VÀ ĐỌC DỮ LIỆU CẢM BIẾN ARDUINO THẬT
// ==========================================
async function connectArduinoSerial() {
  if (!('serial' in navigator)) {
    alert('Trình duyệt của bạn không hỗ trợ Web Serial API!\nBắt buộc phải mở bằng Google Chrome hoặc Microsoft Edge.');
    return;
  }

  try {
    const baudRate = parseInt(serialBaudSelect ? serialBaudSelect.value : '115200', 10);
    logSerial(`Đang mở cổng COM với tốc độ ${baudRate} baud...`);

    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: baudRate });

    arduinoStatusText.textContent = `🟢 CẢM BIẾN THẬT (${baudRate})`;
    arduinoStatusText.style.color = '#00e676';
    btnConnectSerial.style.display = 'none';
    btnDisconnectSerial.style.display = 'inline-flex';
    packetCount = 0;
    
    logSerial(`✅ Đã mở cổng COM thành công! Đang nhận dữ liệu...`);
    showToast(`✅ Đã kết nối Arduino (${baudRate} baud)!`);

    readSerialDirectLoop();

  } catch (err) {
    console.error('Lỗi kết nối Web Serial:', err);
    logSerial(`❌ LỖI: ${err.message}`);
    if (err.name !== 'NotFoundError') {
      showToast('Lỗi: ' + err.message);
    }
  }
}

async function readSerialDirectLoop() {
  isSerialReading = true;
  let textBuffer = '';
  const textDecoder = new TextDecoder();

  try {
    serialReader = serialPort.readable.getReader();

    while (isSerialReading) {
      const { value, done } = await serialReader.read();
      if (done) break;

      if (value && value.length > 0) {
        const chunk = textDecoder.decode(value, { stream: true });
        textBuffer += chunk;

        let lineEndIndex;
        while ((lineEndIndex = textBuffer.indexOf('\n')) >= 0) {
          const line = textBuffer.slice(0, lineEndIndex).trim();
          textBuffer = textBuffer.slice(lineEndIndex + 1);

          if (line.length > 0) {
            parseArduinoLine(line);
          }
        }
      }
    }
  } catch (err) {
    logSerial(`⚠️ Ngắt kết nối Serial: ${err.message}`);
    showToast('⚠️ Mất kết nối Serial!');
  } finally {
    disconnectArduinoSerial();
  }
}

function parseArduinoLine(line) {
  logSerial(`RX: ${line}`);

  if (rawSerialText) {
    rawSerialText.textContent = `RAW: ${line}`;
  }

  if (line.includes('{') && line.includes('}')) {
    try {
      const jsonStart = line.indexOf('{');
      const jsonEnd = line.lastIndexOf('}');
      const jsonStr = line.slice(jsonStart, jsonEnd + 1);
      const data = JSON.parse(jsonStr);

      if (typeof data.d !== 'undefined') {
        packetCount++;
        triggerRxDot();

        let dist = parseInt(data.d, 10);
        let level = (typeof data.level !== 'undefined') ? parseInt(data.level, 10) : calculateLevelFromDist(dist);
        updateSensorData(dist, level);
        return;
      }
    } catch (e) {}
  }

  const matchNum = line.match(/\d+/);
  if (matchNum) {
    const dist = parseInt(matchNum[0], 10);
    if (!isNaN(dist) && dist >= 0 && dist <= 400) {
      packetCount++;
      triggerRxDot();
      const level = calculateLevelFromDist(dist);
      updateSensorData(dist, level);
    }
  }
}

function calculateLevelFromDist(d) {
  if (d < 15) return 2;  // VÙNG 3: ĐỎ (< 15cm)
  else if (d <= 30) return 1; // VÙNG 2: VÀNG (15 - 30cm)
  return 0; // VÙNG 1: XANH (> 30cm)
}

function triggerRxDot() {
  if (rxIndicator) {
    rxIndicator.classList.add('rx-active');
    setTimeout(() => rxIndicator.classList.remove('rx-active'), 50);
  }
}

async function disconnectArduinoSerial() {
  isSerialReading = false;
  if (serialReader) {
    try {
      await serialReader.cancel();
      serialReader.releaseLock();
    } catch (e) {}
    serialReader = null;
  }
  if (serialPort) {
    try {
      await serialPort.close();
    } catch (e) {}
    serialPort = null;
  }

  arduinoStatusText.textContent = 'Chưa kết nối';
  arduinoStatusText.style.color = '#8b9bb4';
  if (rawSerialText) rawSerialText.textContent = 'RAW: --';
  btnConnectSerial.style.display = 'inline-flex';
  btnDisconnectSerial.style.display = 'none';
  logSerial('🔌 Cổng Serial đã đóng.');
}

// ==========================================
// 3. HIỂN THỊ KHOẢNG CÁCH & GHI LOG TIẾT KIỆM BỘ NHỚ VÀO SQL
// ==========================================
function updateSensorData(distance, level) {
  if (distance > 250 || distance <= 0) {
    distanceValueEl.textContent = '---';
  } else {
    distanceValueEl.textContent = Math.round(distance);
  }

  if (buzzer) {
    buzzer.setLevel(level === 2 ? 3 : level);
  }

  if (guideOverlay) {
    guideOverlay.update(distance, level);
  }

  dangerBorder.classList.remove('active');
  centerAlert.classList.remove('visible');

  [sonarArc1, sonarArc2, sonarArc3, sonarArc4].forEach(arc => {
    if (arc) arc.classList.remove('active', 'flash');
  });

  const clamped = Math.max(5, Math.min(50, distance));
  const percent = Math.min(100, Math.max(5, Math.round(((50 - clamped) / 45) * 100)));
  distanceBarFill.style.width = `${percent}%`;

  switch (level) {
    case 0:
      statusBadgeEl.textContent = 'AN TOÀN';
      statusBadgeEl.className = 'status-badge-lg badge-safe';
      distanceValueEl.style.color = '#00e676';
      distanceBarFill.style.backgroundColor = '#00e676';
      if (sonarArc1) sonarArc1.classList.add('active');
      break;

    case 1:
      statusBadgeEl.textContent = 'CẢNH BÁO';
      statusBadgeEl.className = 'status-badge-lg badge-warning';
      distanceValueEl.style.color = '#ffeb3b';
      distanceBarFill.style.backgroundColor = '#ffeb3b';
      if (sonarArc2) sonarArc2.classList.add('active');
      break;

    case 2:
    case 3:
      statusBadgeEl.textContent = 'NGUY HIỂM!';
      statusBadgeEl.className = 'status-badge-lg badge-stop';
      distanceValueEl.style.color = '#ff1744';
      distanceBarFill.style.backgroundColor = '#ff1744';
      
      if (sonarArc3) sonarArc3.classList.add('active', 'flash');
      if (sonarArc4) sonarArc4.classList.add('active', 'flash');

      dangerBorder.classList.add('active');
      centerAlert.classList.add('visible');
      break;
  }

  // GHI LOG THÔNG MINH - ĐỨNG YÊN HOÀN TOÀN KHÔNG GHI
  saveSmartLogToSql(distance, level);
}

// KHÓA CHỐNG RUNG (HYSTERESIS & ANTI-SPAM):
// - Đứng yên một chỗ: KHÔNG BAO GIỜ GHI THÊM
// - Chỉ ghi khi:
//   1. Thật sự chuyển vùng màu (cách lần ghi trước ít nhất 2.5 giây)
//   2. Hoặc khoảng cách THỰC SỰ THAY ĐỔI từ 6 cm trở lên (xe đang di chuyển)
function saveSmartLogToSql(distance, level) {
  const now = Date.now();

  // Khởi tạo lần đầu
  if (lastSavedDist === -1) {
    lastSavedDist = distance;
    lastSavedLevel = level;
    lastSavedTime = now;
    postLog(distance, level);
    return;
  }

  const isLevelChanged = (level !== lastSavedLevel);
  const distDiff = Math.abs(distance - lastSavedDist);
  const timeElapsed = (now - lastSavedTime);

  // ĐỨNG YÊN MỘT CHỖ (khoảng cách lệch dưới 6cm và cùng level): KHÔNG GHI!
  if (!isLevelChanged && distDiff < 6) {
    return;
  }

  // Nếu chuyển vùng màu: Phải cách lần ghi trước ít nhất 2.5 giây để chống rung lắc ranh giới
  if (isLevelChanged && timeElapsed >= 2500) {
    lastSavedDist = distance;
    lastSavedLevel = level;
    lastSavedTime = now;
    postLog(distance, level);
    return;
  }

  // Nếu đang ở vùng Cảnh báo hoặc Nguy hiểm và cự ly di chuyển nhiều (>= 6cm): Cách ít nhất 3 giây mới ghi tiếp
  if (level > 0 && distDiff >= 6 && timeElapsed >= 3000) {
    lastSavedDist = distance;
    lastSavedLevel = level;
    lastSavedTime = now;
    postLog(distance, level);
  }
}

function postLog(distance, level) {
  fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distance, level })
  }).catch(() => {});
}

// ==========================================
// 4. CÁC TÍNH NĂNG ĐIỀU KHIỂN KHÁC
// ==========================================
function toggleAudio() {
  if (buzzer) {
    const isMuted = buzzer.toggleMute();
    btnToggleAudio.textContent = isMuted ? '🔇 Đã tắt tiếng' : '🔊 Âm thanh';
    btnToggleAudio.classList.toggle('btn-secondary', isMuted);
    btnToggleAudio.classList.toggle('btn-primary', !isMuted);
    showToast(isMuted ? 'Đã tắt âm thanh cảnh báo.' : 'Đã bật âm thanh cảnh báo.');
  }
}

function toggleMirror() {
  isMirrored = !isMirrored;
  remoteVideo.classList.toggle('mirrored', isMirrored);
  btnToggleMirror.classList.toggle('btn-primary', isMirrored);
  btnToggleMirror.classList.toggle('btn-secondary', !isMirrored);
  showToast(isMirrored ? 'Đã bật chế độ lật gương (Mirror).' : 'Đã tắt chế độ lật gương.');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Lỗi toàn màn hình:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

function calculateFPS(now) {
  frameCount++;
  if (now - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = now;
    if (currentStream) {
      fpsText.textContent = `${fps} FPS`;
    } else {
      fpsText.textContent = `-- FPS`;
    }
  }
  requestAnimationFrame(calculateFPS);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

window.updateSensorData = updateSensorData;
