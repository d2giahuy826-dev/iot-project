/**
 * audio-buzzer.js
 * Giả lập tiếng còi buzzer cảm biến lùi bằng Web Audio API
 */
class ParkingAudioBuzzer {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.currentLevel = 0;
    this.timerId = null;
    this.continuousOsc = null;
    this.continuousGain = null;
    this.frequency = 1200; // Tần số bíp (Hz)
  }

  // Khởi tạo AudioContext khi có tương tác người dùng
  initContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Bật / Tắt âm thanh
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stop();
    } else {
      this.setLevel(this.currentLevel);
    }
    return this.isMuted;
  }

  // Đặt mức cảnh báo (0: An toàn, 1: Chú ý, 2: Nguy hiểm, 3: Dừng lại)
  setLevel(level) {
    this.currentLevel = level;
    this.stop();

    if (this.isMuted || level === 0) {
      return;
    }

    this.initContext();

    if (level === 1) {
      // Chú ý: Bíp chậm (bíp 100ms, lặp lại mỗi 600ms)
      this.playBeep(100);
      this.timerId = setInterval(() => {
        this.playBeep(100);
      }, 600);
    } else if (level === 2) {
      // Nguy hiểm: Bíp nhanh (bíp 80ms, lặp lại mỗi 200ms)
      this.playBeep(80);
      this.timerId = setInterval(() => {
        this.playBeep(80);
      }, 200);
    } else if (level === 3) {
      // Dừng lại: Kêu liên tục không ngắt
      this.startContinuousBeep();
    }
  }

  // Phát một tiếng bíp ngắn
  playBeep(durationMs) {
    if (this.isMuted || !this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.frequency, this.audioCtx.currentTime);

      // Chống tiếng nổ lụp bụp ở đầu và cuối xung âm
      gain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, this.audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + (durationMs / 1000));
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }

  // Phát âm thanh liên tục (Level 3 - Dừng lại)
  startContinuousBeep() {
    if (this.isMuted || !this.audioCtx) return;

    try {
      this.continuousOsc = this.audioCtx.createOscillator();
      this.continuousGain = this.audioCtx.createGain();

      this.continuousOsc.type = 'sine';
      this.continuousOsc.frequency.setValueAtTime(1400, this.audioCtx.currentTime);

      this.continuousGain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);

      this.continuousOsc.connect(this.continuousGain);
      this.continuousGain.connect(this.audioCtx.destination);

      this.continuousOsc.start();
    } catch (e) {
      console.warn('Continuous beep error:', e);
    }
  }

  // Dừng mọi âm thanh đang phát
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.continuousOsc) {
      try {
        this.continuousOsc.stop();
        this.continuousOsc.disconnect();
      } catch (e) {}
      this.continuousOsc = null;
    }
  }
}

// Xuất ra window
window.ParkingAudioBuzzer = ParkingAudioBuzzer;

