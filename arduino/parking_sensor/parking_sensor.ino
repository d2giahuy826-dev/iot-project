/*
 * ============================================================================
 * DỰ ÁN: HỆ THỐNG HỖ TRỢ LÙI XE AN TOÀN (CHUẨN ĐỒNG BỘ ĐÚNG 3 VÙNG: XANH - VÀNG - ĐỎ)
 * ARDUINO UNO: HC-SR04 + LED XANH (2) + LED VÀNG (3) + LED ĐỎ (4) + CÒI (8)
 * ============================================================================
 */

// ============================================================================
// 🎯 CẤU HÌNH CÁC MỐC KHOẢNG CÁCH (ĐỒNG BỘ 3 VÙNG VỚI WEB)
// ============================================================================
const int MOC_AN_TOAN  = 30;  // > 30 cm        -> VÙNG 1: LED XANH (An toàn)
const int MOC_CANH_BAO = 15;  // 15 cm đến 30 cm -> VÙNG 2: LED VÀNG (Cảnh báo)
// Dưới 15 cm                 -> VÙNG 3: LED ĐỎ NHÁY + CÒI HÚ (Nguy hiểm / Dừng lại)
// ============================================================================

const int TRIG = 9;
const int ECHO = 10;

// Chân kết nối LED (Đúng 3 đèn)
const int LED_G = 2; // Xanh lá - An toàn
const int LED_Y = 3; // Vàng    - Cảnh báo
const int LED_R = 4; // Đỏ      - Nguy hiểm

// Chân còi
const int BUZZER = 8;

// Biến điều khiển nhấp nháy đèn đỏ & còi (không dùng delay)
unsigned long lastBlinkTime = 0;
bool redState = false;

// Biến điều khiển chu kỳ gửi dữ liệu lên Web
unsigned long lastSerialTime = 0;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);

  pinMode(LED_G, OUTPUT);
  pinMode(LED_Y, OUTPUT);
  pinMode(LED_R, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  // Tắt hết đèn và còi lúc mới cắm nguồn
  digitalWrite(LED_G, LOW);
  digitalWrite(LED_Y, LOW);
  digitalWrite(LED_R, LOW);
  noTone(BUZZER);

  // Giao tiếp Serial với Laptop ở tốc độ 115200 baud
  Serial.begin(115200);
}

// Hàm đo khoảng cách bằng cảm biến siêu âm
long getDistance() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // Timeout 20ms (~3.4m)
  long duration = pulseIn(ECHO, HIGH, 20000UL); 
  if (duration == 0) return 999;
  return duration * 0.034 / 2;
}

void loop() {
  long d = getDistance();
  unsigned long currentMillis = millis();
  int level = 0; // 0: XANH (An toàn) | 1: VÀNG (Cảnh báo) | 2: ĐỎ (Nguy hiểm)

  // --- 1. VÙNG 1: AN TOÀN (> MOC_AN_TOAN đến 100cm): Chỉ LED XANH sáng ---
  if (d >= MOC_AN_TOAN && d <= 100) {
    level = 0;
    digitalWrite(LED_G, HIGH);
    digitalWrite(LED_Y, LOW);
    digitalWrite(LED_R, LOW);
    noTone(BUZZER);
  }
  // --- 2. VÙNG 2: CẢNH BÁO (Từ MOC_CANH_BAO đến MOC_AN_TOAN): Chỉ LED VÀNG sáng ---
  else if (d >= MOC_CANH_BAO && d < MOC_AN_TOAN) {
    level = 1;
    digitalWrite(LED_G, LOW);
    digitalWrite(LED_Y, HIGH);
    digitalWrite(LED_R, LOW);
    noTone(BUZZER);
  }
  // --- 3. VÙNG 3: NGUY HIỂM / DỪNG LẠI (< MOC_CANH_BAO): ĐÈN ĐỎ NHÁY + CÒI HÚ ---
  else if (d >= 0 && d < MOC_CANH_BAO) {
    level = 2; // Level 2 là MÀU ĐỎ NGUY HIỂM / DỪNG LẠI
    digitalWrite(LED_G, LOW);
    digitalWrite(LED_Y, LOW);

    // Chớp tắt mỗi 70ms
    if (currentMillis - lastBlinkTime >= 70) {
      lastBlinkTime = currentMillis;
      redState = !redState;
      digitalWrite(LED_R, redState ? HIGH : LOW);
      
      if (redState) {
        tone(BUZZER, 1500); // Âm thanh báo động theo nhịp đèn đỏ
      } else {
        noTone(BUZZER);
      }
    }
  }
  // --- NGOÀI KHOẢNG ĐO (> 100cm hoặc vật cản quá xa): Mặc định An Toàn ---
  else {
    level = 0;
    digitalWrite(LED_G, LOW);
    digitalWrite(LED_Y, LOW);
    digitalWrite(LED_R, LOW);
    noTone(BUZZER);
  }

  // --- GỬI DỮ LIỆU LÊN MÀN HÌNH WEB LAPTOP (mỗi 50ms) ---
  if (currentMillis - lastSerialTime >= 50) {
    lastSerialTime = currentMillis;
    
    // Gửi đúng 3 level: 0 (Xanh), 1 (Vàng), 2 (Đỏ)
    Serial.print(F("{\"d\":"));
    if (d > 100 || d < 0) {
      Serial.print(F("100"));
    } else {
      Serial.print(d);
    }
    Serial.print(F(",\"level\":"));
    Serial.print(level);
    Serial.println(F("}"));
  }

  delay(15);
}
