# 🚗 HỆ THỐNG HỖ TRỢ LÙI XE AN TOÀN (SMART REVERSE PARKING SYSTEM)

Hệ thống hỗ trợ đỗ xe & lùi xe thông minh tích hợp phần cứng nhúng **Arduino Uno** và ứng dụng web thời gian thực **Node.js (Iriun Webcam + WebRTC + Web Serial API + Web Audio API)**.

---

## 🌟 ĐIỂM NỔI BẬT: HỖ TRỢ ĐA DẠNG NGUỒN CAMERA

Bạn có thể truyền hình ảnh từ điện thoại sang màn hình lùi xe theo **2 cách cực kỳ linh hoạt**:

1. **Cách 1: Sử dụng Iriun Webcam (Khuyên dùng - Cực nhanh & Ổn định)**
   - Bạn chỉ cần bật ứng dụng **Iriun Webcam** trên điện thoại và laptop (kết nối qua Wi-Fi hoặc cắm cáp USB).
   - Trên trang web Màn hình lùi của Laptop (`monitor.html`), hệ thống **tự động phát hiện "Iriun Webcam"** trong menu chọn camera. Bấm chọn là hình ảnh hiển thị ngay lập tức, độ trễ cực thấp, không cần mở thêm trang web trên điện thoại!
2. **Cách 2: Sử dụng WebRTC trực tiếp trên Trình duyệt (Không cần cài app)**
   - Quét mã QR hiển thị trên màn hình laptop hoặc terminal bằng điện thoại.
   - Trình duyệt điện thoại tự động mở camera sau và phát luồng video trực tiếp qua mạng Wi-Fi nội bộ.

---

## 📑 MỤC LỤC
1. [Cấu Trúc Thư Mục](#1-cấu-trúc-thư-mục)
2. [Sơ Đồ Đấu Dây Phần Cứng](#2-sơ-đồ-đấu-dây-phần-cứng)
3. [Nạp Code Cho Arduino Uno](#3-nạp-code-cho-arduino-uno)
4. [Khởi Chạy Web Server](#4-khởi-chạy-web-server)
5. [Hướng Dẫn Sử Dụng Chi Tiết](#5-hướng-dẫn-sử-dụng-chi-tiết)
6. [Xử Lý Lỗi Thường Gặp (Troubleshooting)](#6-xử-lý-lỗi-thường-gặp)

---

## 1. CẤU TRÚC THƯ MỤC

```text
d:\IOT\
├── arduino\
│   └── parking_sensor\
│       └── parking_sensor.ino    # Mã nguồn Arduino Uno (C++)
├── certs\                        # Thư mục chứa SSL Certs (tự động sinh)
│   ├── cert.pem
│   └── key.pem
├── public\                       # Thư mục web client
│   ├── index.html                # Trang chủ chọn Camera hoặc Monitor
│   ├── camera.html               # Giao diện Camera điện thoại
│   ├── monitor.html              # Giao diện Màn hình lùi xe trên Laptop
│   ├── css\
│   │   ├── common.css            # Dark theme, buttons, badges
│   │   ├── camera.css            # Style dành riêng cho điện thoại
│   │   └── monitor.css           # Style màn hình ô tô, HUD, viền nhấp nháy
│   └── js\
│       ├── camera.js             # WebRTC Sender + Wake Lock API
│       ├── monitor.js            # Hỗ trợ Iriun Webcam + WebRTC + Web Serial API
│       ├── parking-canvas.js     # Vẽ vạch lùi xe phối cảnh 3D trên Canvas
│       └── audio-buzzer.js       # Giả lập còi bíp cảm biến bằng Web Audio API
├── server.js                     # HTTPS + WebSocket Signaling Server + Dynamic QR
├── package.json                  # Cấu hình dự án Node.js
├── start.bat                     # File kích hoạt nhanh 1-Click trên Windows
└── README.md                     # Tài liệu hướng dẫn này
```

---

## 2. SƠ ĐỒ ĐẤU DÂY PHẦN CỨNG

### Bảng Nối Chân (Arduino Uno):

| Linh Kiện | Chân Linh Kiện | Nối Đến Arduino Uno | Ghi Chú |
| :--- | :--- | :--- | :--- |
| **HC-SR04** | VCC | 5V | Nguồn cảm biến |
| | GND | GND | Nối đất |
| | TRIG | **D9** | Chân phát xung siêu âm |
| | ECHO | **D10** | Chân nhận xung phản hồi |
| **LED Xanh** | Anode (+) | **D5** | Nối tiếp qua điện trở 220Ω |
| | Cathode (-) | GND | |
| **LED Vàng** | Anode (+) | **D6** | Nối tiếp qua điện trở 220Ω |
| | Cathode (-) | GND | |
| **LED Đỏ** | Anode (+) | **D7** | Nối tiếp qua điện trở 220Ω |
| | Cathode (-) | GND | |
| **Còi Buzzer** | Chân (+) | **D8** | Còi chủ động (Active buzzer) |
| | Chân (-) | GND | |
| **LCD 16x2 I2C** | VCC | 5V | Nguồn màn hình |
| | GND | GND | Nối đất |
| | SDA | **A4** (hoặc chân SDA) | Tín hiệu dữ liệu I2C |
| | SCL | **A5** (hoặc chân SCL) | Tín hiệu xung I2C |

---

## 3. NẠP CODE CHO ARDUINO UNO

1. Mở phần mềm **Arduino IDE**.
2. Cài thư viện: Vào **Sketch** -> **Include Library** -> **Manage Libraries...** -> gõ tìm `LiquidCrystal I2C` và cài đặt.
3. Mở file [arduino/parking_sensor/parking_sensor.ino](file:///d:/IOT/arduino/parking_sensor/parking_sensor.ino).
4. Vào menu **Tools**: Chọn Board **Arduino Uno**, chọn đúng **Port** nối cáp USB.
5. Bấm nút **Upload**.
6. **LƯU Ý:** Sau khi nạp xong, hãy **ĐÓNG Serial Monitor trong Arduino IDE** lại để cổng COM không bị khóa.

---

## 4. KHỞI CHẠY HỆ THỐNG

Bạn có 2 cách khởi chạy:

- **Cách 1 (Nhanh nhất):** Click đúp vào file [start.bat](file:///d:/IOT/start.bat). Server sẽ tự chạy và mở sẵn Google Chrome vào màn hình lùi xe.
- **Cách 2:** Mở PowerShell tại `d:\IOT` và chạy:
  ```powershell
  npm start
  ```

---

## 5. HƯỚNG DẪN SỬ DỤNG VỚI IRIUN WEBCAM

1. Khởi động ứng dụng **Iriun Webcam** trên điện thoại và laptop (hai thiết bị kết nối cùng mạng Wi-Fi hoặc nối cáp USB).
2. Mở trình duyệt vào trang: `https://localhost:3443/monitor.html`.
3. Nhìn xuống thanh công cụ phía dưới, tại menu **📹 Nguồn Camera**:
   - Chọn mục **`🌟 Iriun Webcam (Khuyên dùng)`**.
   - Video từ camera điện thoại sẽ xuất hiện ngay lập tức trên màn hình lùi ô tô!
4. Bấm nút **"🔌 Kết nối Arduino"**:
   - Chọn cổng COM của Arduino Uno và bấm **Connect**.
   - Khoảng cách đo được từ cảm biến HC-SR04 sẽ hiển thị theo thời gian thực (số cm lớn, thanh đo màu, thay đổi nhịp bíp còi và đổi vạch an toàn/cảnh báo).
5. Bạn có thể bấm nút **"🪞 Lật gương"** nếu thấy hình ảnh bị ngược so với gương chiếu hậu.
