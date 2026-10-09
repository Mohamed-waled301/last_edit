import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Automatically load local .env if running in Node.js locally
try {
  if (!process.env.MYSQL_HOST) {
    if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
      process.loadEnvFile('.env');
    } else if (fs.existsSync('.env')) {
      const content = fs.readFileSync('.env', 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

let pool = null;

export function getDbConfig() {
  const host = process.env.MYSQL_HOST || process.env.DB_HOST || '';
  const user = process.env.MYSQL_USER || process.env.DB_USER || '';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || '';
  const port = parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10);
  const ssl = process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  return {
    host,
    user,
    password,
    database,
    port,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

export function isDbConfigured() {
  const cfg = getDbConfig();
  return Boolean(cfg.host && cfg.user && cfg.database);
}

export function getPool() {
  if (!pool) {
    const config = getDbConfig();
    if (!config.host || !config.user || !config.database) {
      throw new Error(
        'قاعدة بيانات MySQL غير مهيأة بعد. يرجى ضبط متغيرات البيئة: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE'
      );
    }
    pool = mysql.createPool(config);
  }
  return pool;
}

export async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function testConnection() {
  if (!isDbConfigured()) {
    return {
      connected: false,
      configured: false,
      error: 'لم يتم تعيين بيانات الاتصال بـ MySQL في متغيرات البيئة (Environment Variables)',
    };
  }

  try {
    const p = getPool();
    const [rows] = await p.query('SELECT 1 as is_alive, NOW() as current_server_time');
    return {
      connected: true,
      configured: true,
      serverTime: rows[0]?.current_server_time,
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      error: err.message,
      code: err.code,
    };
  }
}

export default {
  getPool,
  query,
  testConnection,
  isDbConfigured,
  getDbConfig,
};
