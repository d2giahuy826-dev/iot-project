-- ============================================================================
-- SCRIPT TẠO CƠ SỞ DỮ LIỆU MICROSOFT SQL SERVER CHO HỆ THỐNG LÙI XE
-- Bạn mở SSMS 19 (SQL Server Management Studio), dán đoạn này vào và bấm F5 (Execute)
-- ============================================================================

-- 1. Tạo Database CarReverseDB nếu chưa có
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'CarReverseDB')
BEGIN
    CREATE DATABASE CarReverseDB;
    PRINT N'Đã tạo Database CarReverseDB thành công!';
END
GO

USE CarReverseDB;
GO

-- 2. Tạo Bảng ParkingLogs lưu trữ khoảng cách cảm biến
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ParkingLogs')
BEGIN
    CREATE TABLE ParkingLogs (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CreatedAt DATETIME DEFAULT GETDATE(),  -- Thời gian lưu
        Distance INT NOT NULL,                 -- Khoảng cách (cm)
        Level INT NOT NULL,                    -- 0: Xanh, 1: Vàng, 2: Đỏ
        StatusText NVARCHAR(50) NOT NULL       -- "AN TOÀN", "CẢNH BÁO", "NGUY HIỂM"
    );
    PRINT N'Đã tạo Bảng ParkingLogs thành công!';
END
GO

-- 3. Xem thử 100 bản ghi mới nhất
SELECT TOP 100 
    Id, 
    CONVERT(VARCHAR(19), CreatedAt, 120) AS ThoiGian, 
    Distance AS KhoangCach_CM, 
    Level AS MucDo, 
    StatusText AS TrangThai 
FROM ParkingLogs 
ORDER BY Id DESC;
GO

	