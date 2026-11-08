@echo off
title He Thong Ho Tro Lui Xe An Toan
color 0A

echo ===============================================================
echo      HE THONG HO TRO LUI XE AN TOAN (SMART PARKING SYSTEM)
echo ===============================================================
echo.
echo [1/2] Dang khoi dong Web Server Node.js (HTTPS & WebRTC)...
start cmd /k "node server.js"

echo [2/2] Cho server san sang (2 giay)...
timeout /t 2 /nobreak > nul

echo [3/3] Dang mo trinh duyet vao man hinh lui xe...
start https://localhost:3443/monitor.html

echo.
echo ===============================================================
echo DA KHOI CHAY HOAN TAT!
echo Ban co the:
echo 1. Chon Iriun Webcam truc tiep o menu camera phia duoi.
echo 2. Hoac mo trang camera tren dien thoai qua Wi-Fi.
echo 3. Bam 'Ket noi Arduino' de doc cam bien sieu am.
echo ===============================================================
pause

