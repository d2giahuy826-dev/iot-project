/**
 * camera.js
 * Logic cho Camera phía sau trên Điện thoại (WebRTC Sender + Wake Lock)
 */

let localStream = null;
let peerConnection = null;
let ws = null;
let wakeLock = null;
let isStreaming = false;

// Cấu hình STUN Server miễn phí của Google để trao đổi NAT nếu cần
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// DOM Elements
const videoEl = document.getElementById('cameraVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resolutionSelect = document.getElementById('resolutionSelect');
const wsStatusBadge = document.getElementById('wsStatusBadge');
const rtcStatusBadge = document.getElementById('rtcStatusBadge');
const overlayMsg = document.getElementById('videoOverlayMsg');
const videoTag = document.getElementById('videoTag');

// Khởi chạy khi tải trang
window.addEventListener('DOMContentLoaded', () => {
  initWebSocket();

  startBtn.addEventListener('click', startCamera);
  stopBtn.addEventListener('click', stopCamera);
  resolutionSelect.addEventListener('change', () => {
    if (isStreaming) {
      // Khởi động lại camera với độ phân giải mới
      startCamera();
    }
  });

  // Giữ màn hình luôn sáng khi người dùng tương tác
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isStreaming) {
      requestWakeLock();
    }
  });
});

// 1. Kết nối WebSocket Signaling
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  updateBadge(wsStatusBadge, 'Đang kết nối server...', 'badge-warning');

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateBadge(wsStatusBadge, 'Đã kết nối Server', 'badge-safe');
    // Đăng ký role camera
    ws.send(JSON.stringify({ type: 'register', role: 'camera' }));
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        // Monitor đã sẵn sàng hoặc vừa vào -> Camera khởi tạo Offer
        case 'ready_to_call':
          if (localStream) {
            initiateCall();
          }
          break;

        // Nhận Answer từ Laptop Monitor
        case 'answer':
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            updateBadge(rtcStatusBadge, 'Đang truyền hình', 'badge-safe');
          }
          break;

        // Nhận ICE candidate từ Monitor
        case 'candidate':
          if (peerConnection && data.candidate) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.warn('Lỗi thêm ICE Candidate:', e);
            }
          }
          break;

        case 'pong':
          break;
      }
    } catch (e) {
      console.error('Lỗi xử lý tin nhắn socket:', e);
    }
  };

  ws.onclose = () => {
    updateBadge(wsStatusBadge, 'Mất kết nối Server', 'badge-stop');
    updateBadge(rtcStatusBadge, 'Chờ kết nối...', 'badge-warning');
    // Thử kết nối lại sau 3 giây
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    ws.close();
  };

  // Heartbeat ping mỗi 20s
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 20000);
}

// 2. Bật Camera điện thoại
async function startCamera() {
  try {
    startBtn.disabled = true;
    startBtn.textContent = 'Đang mở Camera...';

    // Dừng stream cũ nếu đang chạy
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Chọn độ phân giải
    const res = resolutionSelect.value;
    let width = 1280;
    let height = 720;
    if (res === '480p') {
      width = 640;
      height = 480;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' }, // Camera sau
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30, max: 30 }
      }
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = localStream;
    await videoEl.play();

    isStreaming = true;
    overlayMsg.classList.add('hidden');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    videoTag.textContent = `CAMERA SAU (${res.toUpperCase()})`;

    // Giữ màn hình luôn sáng
    requestWakeLock();

    // Bắt đầu tạo kết nối WebRTC nếu server đã sẵn sàng
    initiateCall();

  } catch (err) {
    console.error('Lỗi truy cập Camera:', err);
    alert('Không thể mở Camera! Vui lòng cho phép quyền truy cập Camera trong trình duyệt.\nChi tiết: ' + err.message);
    startBtn.disabled = false;
    startBtn.textContent = 'Bật Camera Sau';
  }
}

// 3. Dừng Camera
function stopCamera() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  releaseWakeLock();
  isStreaming = false;

  videoEl.srcObject = null;
  overlayMsg.classList.remove('hidden');
  startBtn.style.display = 'inline-flex';
  startBtn.disabled = false;
  startBtn.textContent = 'Bật Camera Sau';
  stopBtn.style.display = 'none';
  videoTag.textContent = 'SẴN SÀNG';

  updateBadge(rtcStatusBadge, 'Đã dừng', 'badge-warning');
}

// 4. Khởi tạo phiên WebRTC và gửi Offer tới Monitor
async function initiateCall() {
  if (!localStream) return;

  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Thêm các video track từ camera vào RTCPeerConnection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Khi tìm được ICE Candidate -> gửi tới monitor
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'candidate',
        candidate: event.candidate
      }));
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log('[WebRTC State]', state);
    if (state === 'connected') {
      updateBadge(rtcStatusBadge, 'Đang phát tới Monitor', 'badge-safe');
    } else if (state === 'connecting') {
      updateBadge(rtcStatusBadge, 'Đang kết nối WebRTC...', 'badge-warning');
    } else if (state === 'disconnected' || state === 'failed') {
      updateBadge(rtcStatusBadge, 'Mất kết nối WebRTC', 'badge-stop');
      // Thử tạo lại sau 2s
      setTimeout(initiateCall, 2000);
    }
  };

  try {
    // Tạo SDP Offer
    const offer = await peerConnection.createOffer({
      offerToReceiveVideo: false,
      offerToReceiveAudio: false
    });
    await peerConnection.setLocalDescription(offer);

    // Gửi Offer qua WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'offer',
        sdp: peerConnection.localDescription
      }));
    }
  } catch (err) {
    console.error('Lỗi tạo WebRTC Offer:', err);
  }
}

// 5. Quản lý Wake Lock API (Giữ màn hình không tắt)
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Màn hình được giữ sáng liên tục.');
      wakeLock.addEventListener('release', () => {
        console.log('[WakeLock] Đã nhả Wake Lock.');
      });
    } catch (err) {
      console.warn('[WakeLock] Không thể kích hoạt:', err.message);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

// Tiện ích cập nhật giao diện badge
function updateBadge(el, text, className) {
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${className}`;
}

