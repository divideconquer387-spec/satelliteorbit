require("dotenv").config();
const mysql = require("mysql2");

const {
  MYSQL_URL,
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL = "false",
  MYSQLHOST,
  MYSQLPORT,
  MYSQLUSER,
  MYSQLPASSWORD,
  MYSQLDATABASE,
  MYSQL_SSL
} = process.env;

// Railway / cloud connection string
const connectionUri = MYSQL_URL || DATABASE_URL;

// SSL detection
const sslFlag = MYSQL_SSL || DB_SSL;
const useSsl = ["1", "true", "required"].includes(String(sslFlag).toLowerCase());

// Create connection pool
const db = connectionUri
  ? mysql.createPool(connectionUri)
  : mysql.createPool({
      host: DB_HOST || MYSQLHOST || "centerbeam.proxy.rlwy.net",
      port: Number(DB_PORT || MYSQLPORT || 44905),
      user: DB_USER || MYSQLUSER || "root",
      password: DB_PASSWORD || MYSQLPASSWORD || "zBkJtGXReVesgChFbwyaTmwcASEoSoHm",
      database: DB_NAME || MYSQLDATABASE || "railway",
      ssl: useSsl ? { rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

// Test connection
function checkConnection() {
  db.getConnection((err, connection) => {
    if (err) {
      console.error("DB connection failed:", err.message || err.code);
      return;
    }

    connection.ping((pingErr) => {
      if (pingErr) {
        console.error("DB ping failed:", pingErr.message || pingErr.code);
      } else {
        console.log("Database pool connected");
      }
      connection.release();
    });
  });
}

module.exports = { db, checkConnection };