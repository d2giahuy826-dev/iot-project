/**
 * database.js
 * Quản lý Cơ sở dữ liệu MICROSOFT SQL SERVER (SSMS 19) + Fallback SQLite
 * CƠ CHẾ TIẾT KIỆM BỘ NHỚ: Tự động giới hạn tối đa 500 bản ghi mới nhất (Rolling Window)
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { DatabaseSync } = require('node:sqlite');

const CONFIG_PATH = path.join(__dirname, 'sql-config.json');
let sqlConfig = {
  server: 'localhost',
  database: 'CarReverseDB',
  user: 'sa',
  password: '123',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    sqlConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {}
}

let mssqlPool = null;
let isMSSQLConnected = false;

// Fallback SQLite
const sqliteDb = new DatabaseSync(path.join(__dirname, 'parking_history.db'));
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS parking_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    distance INTEGER NOT NULL,
    level INTEGER NOT NULL,
    status_text TEXT NOT NULL
  )
`);

// Kết nối tới Microsoft SQL Server (SSMS 19)
async function connectMSSQL() {
  try {
    console.log(`[SQL Server] Đang kết nối tới Microsoft SQL Server (${sqlConfig.server})...`);
    mssqlPool = await sql.connect({
      server: sqlConfig.server,
      database: sqlConfig.database,
      user: sqlConfig.user,
      password: sqlConfig.password,
      port: sqlConfig.port || 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    });

    isMSSQLConnected = true;
    console.log(`[SQL Server] ✅ KẾT NỐI MICROSOFT SQL SERVER THÀNH CÔNG!`);
    console.log(`[SQL Server] Database: ${sqlConfig.database} | Bảng: ParkingLogs`);

    // Tự động tạo bảng nếu chưa có
    await mssqlPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ParkingLogs')
      BEGIN
        CREATE TABLE ParkingLogs (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          CreatedAt DATETIME DEFAULT GETDATE(),
          Distance INT NOT NULL,
          Level INT NOT NULL,
          StatusText NVARCHAR(50) NOT NULL
        );
      END
    `);
  } catch (err) {
    isMSSQLConnected = false;
    console.warn(`[SQL Server] ⚠️ Chưa thể đăng nhập Microsoft SQL Server (${err.message}).`);
  }
}

connectMSSQL();

// Biến ghi nhớ trạng thái để lọc chống spam từ Server (Đứng yên tuyệt đối không ghi)
let lastLoggedDist = -999;
let lastLoggedLevel = -1;
let lastLoggedTime = 0;

// Ghi dữ liệu cảm biến vào SQL (Tiết kiệm bộ nhớ & tự động dọn rác)
async function insertLog(distance, level) {
  const now = Date.now();
  const dist = parseInt(distance, 10);
  const lvl = parseInt(level, 10);

  // 1. LỌC ĐỨNG YÊN TẠI SERVER:
  // Nếu cùng mức cảnh báo VÀ khoảng cách xê dịch dưới 5cm -> BỎ QUA NGAY LẬP TỨC!
  const isLevelChanged = (lvl !== lastLoggedLevel);
  const distDiff = Math.abs(dist - lastLoggedDist);

  if (!isLevelChanged && distDiff < 5) {
    return; // Đứng yên -> Không ghi vào DB!
  }

  // Nếu đổi mức cảnh báo nhưng quá nhanh (< 2 giây) do cảm biến chập chờn ranh giới -> Bỏ qua
  if (isLevelChanged && (now - lastLoggedTime < 2000)) {
    return;
  }

  // Cập nhật mốc hợp lệ
  lastLoggedDist = dist;
  lastLoggedLevel = lvl;
  lastLoggedTime = now;

  let statusText = 'AN TOÀN';
  if (lvl === 1) statusText = 'CẢNH BÁO';
  else if (lvl >= 2) statusText = 'NGUY HIỂM';

  // 1. Lưu vào Microsoft SQL Server nếu đã kết nối
  if (isMSSQLConnected && mssqlPool) {
    try {
      // Chèn bản ghi sự kiện có ý nghĩa
      await mssqlPool.request()
        .input('dist', sql.Int, distance)
        .input('lvl', sql.Int, level)
        .input('st', sql.NVarChar(50), statusText)
        .query(`
          INSERT INTO ParkingLogs (Distance, Level, StatusText)
          VALUES (@dist, @lvl, @st);

          -- Tự động dọn dẹp: Chỉ giữ lại tối đa 500 bản ghi mới nhất để database luôn dưới 1MB
          DELETE FROM ParkingLogs 
          WHERE Id NOT IN (
            SELECT TOP 500 Id FROM ParkingLogs ORDER BY Id DESC
          );
        `);
      return;
    } catch (e) {
      console.warn('[SQL Server] Lỗi insert MSSQL:', e.message);
    }
  }

  // 2. Lưu vào SQLite dự phòng (cũng tự giới hạn 500 bản ghi)
  try {
    const insert = sqliteDb.prepare(`
      INSERT INTO parking_logs (distance, level, status_text)
      VALUES (?, ?, ?)
    `);
    insert.run(distance, level, statusText);

    sqliteDb.exec(`
      DELETE FROM parking_logs 
      WHERE id NOT IN (
        SELECT id FROM parking_logs ORDER BY id DESC LIMIT 500
      )
    `);
  } catch (e) {}
}

// Lấy danh sách 50 bản ghi gần nhất
async function getRecentLogs(limit = 50) {
  if (isMSSQLConnected && mssqlPool) {
    try {
      const result = await mssqlPool.request()
        .input('lim', sql.Int, limit)
        .query(`
          SELECT TOP (@lim)
            Id AS id,
            CONVERT(VARCHAR(19), CreatedAt, 120) AS created_at,
            Distance AS distance,
            Level AS level,
            StatusText AS status_text
          FROM ParkingLogs
          ORDER BY Id DESC
        `);
      return { source: 'Microsoft SQL Server (SSMS)', logs: result.recordset };
    } catch (e) {}
  }

  const query = sqliteDb.prepare(`
    SELECT 
      id, 
      datetime(created_at, 'localtime') as created_at,
      distance, 
      level, 
      status_text 
    FROM parking_logs 
    ORDER BY id DESC 
    LIMIT ?
  `);
  return { source: 'SQLite Local', logs: query.all(limit) };
}

// Xóa toàn bộ lịch sử
async function clearLogs() {
  if (isMSSQLConnected && mssqlPool) {
    try {
      await mssqlPool.request().query(`TRUNCATE TABLE ParkingLogs`);
    } catch (e) {}
  }
  sqliteDb.exec(`DELETE FROM parking_logs`);
}

module.exports = {
  insertLog,
  getRecentLogs,
  clearLogs,
  getStatus: () => ({ isMSSQL: isMSSQLConnected, database: sqlConfig.database })
};
