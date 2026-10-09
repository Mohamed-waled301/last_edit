import { query, testConnection, isDbConfigured, getDbConfig } from './db.js';

// Safe list of allowed system tables
const ALLOWED_TABLES = new Set([
  'users',
  'audit_log',
  'settings',
  'treasury_accounts',
  'cash_transactions',
  'expense_codes',
  'daily_closings',
  'payment_methods',
  'parties',
  'suppliers',
  'customers',
  'items',
  'item_sizes',
  'item_colors',
  'materials',
  'products',
  'bom_items',
  'storage_locations',
  'stock_transfers',
  'stock_movements',
  'stock_adjustments',
  'stock_counts',
  'stock_count_items',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipts',
  'goods_receipt_items',
  'supplier_invoices',
  'payments',
  'supplier_returns',
  'production_orders',
  'production_material_usage',
  'outsourced_orders',
  'finishing_orders',
  'finishing_materials',
  'overheads',
  'sales_outlets',
  'sales_invoices',
  'sales_invoice_items',
  'customer_payments',
  'customer_returns',
]);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const columnsCache = new Map();
async function getTableColumns(tableName) {
  if (columnsCache.has(tableName)) return columnsCache.get(tableName);
  try {
    const rows = await query(`SHOW COLUMNS FROM \`${tableName}\``);
    const set = new Set(rows.map((r) => r.Field));
    columnsCache.set(tableName, set);
    return set;
  } catch (e) {
    return null;
  }
}

function sanitizeRow(row, validCols, tableName = '') {
  const sanitized = {};
  const effectiveRow = { ...row };
  if (tableName === 'parties' && !effectiveRow.deal_type && effectiveRow.customer_deal_type) {
    effectiveRow.deal_type = effectiveRow.customer_deal_type;
  }
  for (const [k, v] of Object.entries(effectiveRow)) {
    if (v !== undefined && (!validCols || validCols.has(k))) {
      if (typeof v === 'boolean') {
        sanitized[k] = v ? 1 : 0;
      } else if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
        sanitized[k] = JSON.stringify(v);
      } else {
        sanitized[k] = v;
      }
    }
  }
  return sanitized;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/^\/api/, '');
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;

  try {
    // 1. Health & Database connection check
    if (pathname === '/health' || pathname === '/status') {
      const health = await testConnection();
      return sendJson(res, 200, {
        success: true,
        ...health,
        dbConfig: {
          host: getDbConfig().host ? `${getDbConfig().host.slice(0, 4)}***` : 'غير محدد',
          database: getDbConfig().database || 'غير محدد',
          port: getDbConfig().port,
        },
      });
    }

    // 2. Setup Status: Check if system owner exists
    if (pathname === '/setup/status') {
      if (!isDbConfigured()) {
        return sendJson(res, 200, {
          success: true,
          configured: false,
          hasOwner: false,
          message: 'قاعدة البيانات غير مهيأة بعد',
        });
      }
      const users = await query('SELECT id, username, full_name, role FROM users WHERE role = ? LIMIT 1', ['owner']);
      return sendJson(res, 200, {
        success: true,
        configured: true,
        hasOwner: users.length > 0,
        owner: users[0] || null,
      });
    }

    // 3. Setup Init: Initial Clean Setup (Create Owner & Company Profile)
    if (pathname === '/setup/init' && req.method === 'POST') {
      const body = await parseBody(req);
      const { factoryName, ownerName, pinHash, pinSalt } = body;

      if (!factoryName || !ownerName) {
        return sendJson(res, 400, { success: false, error: 'اسم المنشأة واسم المالك مطلوبان' });
      }

      // 3.1 Update Settings
      await query(
        `INSERT INTO settings (id, factory_name, created_at) 
         VALUES (1, ?, NOW()) 
         ON DUPLICATE KEY UPDATE factory_name = VALUES(factory_name)`,
        [factoryName]
      );

      // 3.2 Create or Update Owner User
      const ownerId = 'usr-owner';
      await query(
        `INSERT INTO users (id, username, full_name, role, pin_hash, pin_salt, is_active, created_at)
         VALUES (?, 'owner', ?, 'owner', ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), pin_hash = VALUES(pin_hash), pin_salt = VALUES(pin_salt)`,
        [ownerId, ownerName, pinHash || null, pinSalt || null]
      );

      // 3.3 Ensure Main Treasury exists
      await query(
        `INSERT INTO treasury_accounts (id, name, account_type, is_main, is_active, created_at)
         VALUES ('tr-main', 'الخزينة الرئيسية', 'treasury', 1, 1, NOW())
         ON DUPLICATE KEY UPDATE id = id`
      );

      return sendJson(res, 200, {
        success: true,
        message: 'تم تهيئة النظام النظيف بنجاح',
        user: { id: ownerId, role: 'owner', full_name: ownerName },
      });
    }

    // 4. List all system tables
    if (pathname === '/tables') {
      const tables = Array.from(ALLOWED_TABLES);
      return sendJson(res, 200, { success: true, tables });
    }

    // 5. Generic Table Operations (/data/:table or /data/:table/:id)
    const tableMatch = pathname.match(/^\/data\/([a-zA-Z0-9_]+)(?:\/([a-zA-Z0-9_\-]+))?$/);
    if (tableMatch) {
      const tableName = tableMatch[1];
      const recordId = tableMatch[2] || null;

      if (!ALLOWED_TABLES.has(tableName)) {
        return sendJson(res, 400, { success: false, error: `الجدول المطلوب غير صالح: ${tableName}` });
      }

      const validCols = await getTableColumns(tableName);

      // GET Records
      if (req.method === 'GET') {
        if (recordId) {
          const rows = await query(`SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`, [recordId]);
          if (rows.length === 0) {
            return sendJson(res, 404, { success: false, error: 'السجل غير موجود' });
          }
          return sendJson(res, 200, { success: true, data: rows[0], record: rows[0] });
        }

        // Parse query params for filtering
        const conditions = [];
        const params = [];
        for (const [key, value] of url.searchParams.entries()) {
          if (['limit', 'offset', 'order_by', 'order'].includes(key)) continue;
          if (validCols && !validCols.has(key)) continue;
          conditions.push(`\`${key}\` = ?`);
          params.push(value);
        }

        let sql = `SELECT * FROM \`${tableName}\``;
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        const orderBy = url.searchParams.get('order_by');
        const orderDir = url.searchParams.get('order')?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        if (orderBy && (!validCols || validCols.has(orderBy))) {
          sql += ` ORDER BY \`${orderBy}\` ${orderDir}`;
        } else {
          sql += ` ORDER BY id ASC`;
        }

        const limit = parseInt(url.searchParams.get('limit') || '1000', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        sql += ` LIMIT ${Math.min(limit, 2000)} OFFSET ${offset}`;

        const rows = await query(sql, params);
        return sendJson(res, 200, {
          success: true,
          data: rows,
          records: rows,
          count: rows.length,
          [tableName]: rows,
        });
      }

      // POST Record (Insert or Bulk Insert)
      if (req.method === 'POST') {
        const body = await parseBody(req);

        // Bulk Insert
        if (Array.isArray(body)) {
          if (body.length === 0) {
            return sendJson(res, 200, { success: true, inserted: 0 });
          }

          let insertedCount = 0;
          for (const rawItem of body) {
            const item = sanitizeRow(rawItem, validCols, tableName);
            const keys = Object.keys(item);
            if (keys.length === 0) continue;
            const cols = keys.map((k) => `\`${k}\``).join(', ');
            const placeholders = keys.map(() => '?').join(', ');
            const updates = keys.map((k) => `\`${k}\`=VALUES(\`${k}\`)`).join(', ');
            const values = keys.map((k) => item[k]);

            await query(
              `INSERT INTO \`${tableName}\` (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
              values
            );
            insertedCount++;
          }

          return sendJson(res, 201, { success: true, inserted: insertedCount });
        }

        // Single Insert
        const item = sanitizeRow(body, validCols, tableName);
        const keys = Object.keys(item);
        if (keys.length === 0) {
          return sendJson(res, 400, { success: false, error: 'البيانات المرسلة فارغة' });
        }

        const cols = keys.map((k) => `\`${k}\``).join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys.map((k) => `\`${k}\`=VALUES(\`${k}\`)`).join(', ');
        const values = keys.map((k) => item[k]);

        await query(
          `INSERT INTO \`${tableName}\` (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
          values
        );

        return sendJson(res, 201, {
          success: true,
          data: item,
          record: item,
          message: 'تم حفظ السجل بنجاح في قاعدة البيانات',
        });
      }

      // PUT Record (Update)
      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const targetId = recordId || body.id;

        if (!targetId) {
          return sendJson(res, 400, { success: false, error: 'معرف السجل (id) مطلوب للتحديث' });
        }

        const item = sanitizeRow(body, validCols, tableName);
        const keys = Object.keys(item).filter((k) => k !== 'id');
        if (keys.length === 0) {
          return sendJson(res, 200, { success: true, message: 'لا توجد حقول للتحديث' });
        }

        const setClause = keys.map((k) => `\`${k}\` = ?`).join(', ');
        const values = keys.map((k) => item[k]);
        values.push(targetId);

        await query(`UPDATE \`${tableName}\` SET ${setClause} WHERE id = ?`, values);
        return sendJson(res, 200, { success: true, data: item, message: 'تم تحديث السجل بنجاح' });
      }

      // DELETE Record
      if (req.method === 'DELETE') {
        const targetId = recordId || url.searchParams.get('id');
        if (!targetId) {
          return sendJson(res, 400, { success: false, error: 'معرف السجل (id) مطلوب للحذف' });
        }

        await query(`DELETE FROM \`${tableName}\` WHERE id = ?`, [targetId]);
        return sendJson(res, 200, { success: true, message: 'تم حذف السجل بنجاح' });
      }
    }

    // 6. Custom safe query executor
    if (pathname === '/query' && req.method === 'POST') {
      const body = await parseBody(req);
      const { sql, params } = body;
      if (!sql) {
        return sendJson(res, 400, { success: false, error: 'الاستعلام SQL مطلوب' });
      }

      const rows = await query(sql, params || []);
      return sendJson(res, 200, { success: true, data: rows });
    }

    return sendJson(res, 404, { success: false, error: `المسار غير موجود: ${pathname}` });
  } catch (err) {
    console.error('API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: err.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
      code: err.code || 'INTERNAL_ERROR',
    });
  }
}
