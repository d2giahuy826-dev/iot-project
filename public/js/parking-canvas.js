/**
 * parking-canvas.js
 * Vẽ các vạch hỗ trợ lùi xe ô tô 3D (Đúng 3 vùng: Xanh - Vàng - Đỏ)
 */
class ParkingGuideOverlay {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.distance = 50;
    this.level = 0;
    this.steeringAngle = 0;

    this.config = this.loadConfig();

    this.colors = {
      safe: '#00e676',    // Xanh lá (Vùng 1)
      warning: '#ffeb3b', // Vàng    (Vùng 2)
      danger: '#ff1744',  // Đỏ rực  (Vùng 3 - Nguy hiểm / Dừng)
      track: 'rgba(255, 255, 255, 0.4)'
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        this.setSteeringAngle(Math.max(-30, this.steeringAngle - 5));
      } else if (e.key === 'ArrowRight') {
        this.setSteeringAngle(Math.min(30, this.steeringAngle + 5));
      } else if (e.key === 'ArrowDown' || e.key === ' ') {
        this.setSteeringAngle(0);
      }
    });
  }

  loadConfig() {
    const saved = localStorage.getItem('car_reverse_guideline_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      topYRatio: 0.45,
      bottomYRatio: 0.95,
      topWidthRatio: 0.30,
      bottomWidthRatio: 0.68
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('car_reverse_guideline_config', JSON.stringify(this.config));
    this.draw();
  }

  resetConfig() {
    this.config = {
      topYRatio: 0.45,
      bottomYRatio: 0.95,
      topWidthRatio: 0.30,
      bottomWidthRatio: 0.68
    };
    localStorage.removeItem('car_reverse_guideline_config');
    this.draw();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.draw();
  }

  update(distance, level) {
    this.distance = distance;
    this.level = level;
    this.draw();
  }

  setSteeringAngle(angle) {
    this.steeringAngle = angle;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const cfg = this.config;
    const bottomY = h * cfg.bottomYRatio;
    const topY    = h * cfg.topYRatio;

    const centerX = w / 2;
    const halfBottomWidth = (w * cfg.bottomWidthRatio) / 2;
    const halfTopWidth    = (w * cfg.topWidthRatio) / 2;

    const steerOffset = (this.steeringAngle / 30) * (w * 0.18);

    const leftBottomX  = centerX - halfBottomWidth;
    const rightBottomX = centerX + halfBottomWidth;
    const leftTopX     = centerX - halfTopWidth + steerOffset;
    const rightTopX    = centerX + halfTopWidth + steerOffset;

    // CHỈ CÒN ĐÚNG 3 PHÂN VÙNG DỌC: Xanh (> 30cm) | Vàng (15 - 30cm) | Đỏ (< 15cm)
    const yGreen  = topY + (bottomY - topY) * 0.45;  // Mốc 30cm
    const yYellow = topY + (bottomY - topY) * 0.75;  // Mốc 15cm

    const getLeftX = (y) => {
      const t = (y - topY) / (bottomY - topY);
      const curve = (1 - t) * (1 - t) * steerOffset;
      return (leftTopX - steerOffset) + t * (leftBottomX - (leftTopX - steerOffset)) + curve;
    };

    const getRightX = (y) => {
      const t = (y - topY) / (bottomY - topY);
      const curve = (1 - t) * (1 - t) * steerOffset;
      return (rightTopX - steerOffset) + t * (rightBottomX - (rightTopX - steerOffset)) + curve;
    };

    ctx.shadowBlur = 8;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    // 1. VÙNG 1: AN TOÀN - XANH LÁ
    ctx.strokeStyle = this.colors.safe;
    ctx.shadowColor = this.colors.safe;
    this.drawCurvedSegment(ctx, getLeftX, topY, yGreen);
    this.drawCurvedSegment(ctx, getRightX, topY, yGreen);

    // 2. VÙNG 2: CẢNH BÁO - VÀNG
    ctx.strokeStyle = this.colors.warning;
    ctx.shadowColor = this.colors.warning;
    this.drawCurvedSegment(ctx, getLeftX, yGreen, yYellow);
    this.drawCurvedSegment(ctx, getRightX, yGreen, yYellow);

    // 3. VÙNG 3: NGUY HIỂM - ĐỎ RỰC (KHÔNG DÙNG MÀU CAM)
    ctx.strokeStyle = this.colors.danger;
    ctx.shadowColor = this.colors.danger;
    this.drawCurvedSegment(ctx, getLeftX, yYellow, bottomY);
    this.drawCurvedSegment(ctx, getRightX, yYellow, bottomY);

    // Các vạch ngang cự ly
    ctx.lineWidth = 4;

    // Vạch 1: Xanh
    ctx.strokeStyle = this.colors.safe;
    ctx.shadowColor = this.colors.safe;
    this.drawHLine(topY, getLeftX, getRightX, 'AN TOÀN');

    // Vạch 2: Vàng
    ctx.strokeStyle = this.colors.warning;
    ctx.shadowColor = this.colors.warning;
    this.drawHLine(yGreen, getLeftX, getRightX, '30 cm');

    // Vạch 3: Đỏ
    ctx.strokeStyle = this.colors.danger;
    ctx.shadowColor = this.colors.danger;
    this.drawHLine(yYellow, getLeftX, getRightX, '15 cm');

    // Vạch chướng ngại vật động (BÁM THEO CẢM BIẾN THẬT)
    if (this.distance > 0 && this.distance <= 100) {
      const clampedDist = Math.max(5, Math.min(50, this.distance));
      const distNorm = 1 - ((clampedDist - 5) / 45);
      const obstacleY = topY + distNorm * (bottomY - topY);

      const oLeftX = getLeftX(obstacleY);
      const oRightX = getRightX(obstacleY);

      // ĐÚNG 3 MÀU: Xanh, Vàng, Đỏ
      let obsColor = this.colors.safe;
      if (this.level === 1) obsColor = this.colors.warning;
      if (this.level >= 2) obsColor = this.colors.danger;

      ctx.save();
      ctx.lineWidth = 8;
      ctx.strokeStyle = obsColor;
      ctx.shadowColor = obsColor;
      ctx.shadowBlur = 18;

      ctx.beginPath();
      ctx.moveTo(oLeftX - 10, obstacleY);
      ctx.lineTo(oRightX + 10, obstacleY);
      ctx.stroke();

      this.drawArrow(oLeftX - 14, obstacleY, 'right', obsColor);
      this.drawArrow(oRightX + 14, obstacleY, 'left', obsColor);

      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  drawCurvedSegment(ctx, getXFunc, y1, y2) {
    ctx.beginPath();
    const steps = 15;
    const dy = (y2 - y1) / steps;
    ctx.moveTo(getXFunc(y1), y1);
    for (let i = 1; i <= steps; i++) {
      const currentY = y1 + i * dy;
      ctx.lineTo(getXFunc(currentY), currentY);
    }
    ctx.stroke();
  }

  drawHLine(y, getLeftX, getRightX, label) {
    const lx = getLeftX(y);
    const rx = getRightX(y);

    this.ctx.beginPath();
    this.ctx.moveTo(lx, y);
    this.ctx.lineTo(rx, y);
    this.ctx.stroke();

    if (label) {
      this.ctx.font = 'bold 12px -apple-system, sans-serif';
      this.ctx.fillStyle = this.ctx.strokeStyle;
      this.ctx.fillText(label, rx + 10, y + 4);
    }
  }

  drawArrow(x, y, dir, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    const size = 6;
    if (dir === 'right') {
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x, y);
      ctx.lineTo(x - size, y + size);
    } else {
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x, y);
      ctx.lineTo(x + size, y + size);
    }
    ctx.closePath();
    ctx.fill();
  }
}

window.ParkingGuideOverlay = ParkingGuideOverlay;
