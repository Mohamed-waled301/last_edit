/**
 * Apex Enterprise ERP - Real-Time Hostinger MySQL Synchronization Layer
 * Synchronizes frontend mutations (Insert, Update, Delete) directly with Hostinger MySQL tables.
 * Provides resilient offline fallback and background data hydration.
 */

import db from '../data/db';

const SYNC_TIMEOUT_MS = 6000;

function getBaseApiUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return '';
  }
  return 'http://localhost:3000';
}

/**
 * Pushes a record or modification directly to Hostinger MySQL via /api/data/:table
 * @param {string} tableName Name of the MySQL table
 * @param {'insert'|'update'|'delete'|'post'|'put'} action Operation type
 * @param {object|array} record Data payload
 * @param {string|number|null} id Primary key
 */
export async function syncPush(tableName, action, record, id = null) {
  if (typeof fetch === 'undefined') return { success: false, offline: true };

  try {
    const baseUrl = getBaseApiUrl();
    const act = (action || '').toLowerCase();
    const targetId = id || record?.id;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null;

    let res;
    if (act === 'delete') {
      if (!targetId) return { success: false, error: 'Missing ID for delete' };
      res = await fetch(`${baseUrl}/api/data/${tableName}/${targetId}`, {
        method: 'DELETE',
        signal: controller?.signal,
      });
    } else if (act === 'update' || act === 'put') {
      res = await fetch(`${baseUrl}/api/data/${tableName}${targetId ? `/${targetId}` : ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        signal: controller?.signal,
      });
    } else {
      // Insert / POST
      res = await fetch(`${baseUrl}/api/data/${tableName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        signal: controller?.signal,
      });
    }

    if (timeoutId) clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, ...data };
    }

    return { success: false, status: res?.status };
  } catch (err) {
    // Non-blocking catch to ensure offline resilience and seamless local UX
    return { success: false, error: err.message };
  }
}

/**
 * Fetches records directly from Hostinger MySQL for a given table
 * @param {string} tableName
 * @param {object} params
 */
export async function syncFetch(tableName, params = {}) {
  if (typeof fetch === 'undefined') return null;

  try {
    const baseUrl = getBaseApiUrl();
    const search = new URLSearchParams(params).toString();
    const url = `${baseUrl}/api/data/${tableName}${search ? `?${search}` : ''}`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS) : null;

    const res = await fetch(url, { signal: controller?.signal });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      return json.data || json.records || [];
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Hydrates IndexedDB from Hostinger MySQL tables on application startup
 * Keeps local Dexie synchronized with the authoritative Hostinger database
 */
export async function syncHydrateAll() {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return;

  const tablesToHydrate = [
    'settings',
    'treasury_accounts',
    'payment_methods',
    'storage_locations',
    'expense_codes',
    'parties',
    'suppliers',
    'customers',
    'items',
    'item_sizes',
    'item_colors',
    'materials',
    'products',
    'bom_items',
    'sales_outlets',
    'sales_invoices',
    'sales_invoice_items',
    'purchase_orders',
    'purchase_order_items',
    'goods_receipts',
    'goods_receipt_items',
    'supplier_invoices',
    'payments',
    'customer_payments',
    'cash_transactions',
    'production_orders',
    'outsourced_orders',
    'finishing_orders',
    'daily_closings',
  ];

  try {
    // Check connection first
    const baseUrl = getBaseApiUrl();
    const health = await fetch(`${baseUrl}/api/health`, { method: 'GET' }).catch(() => null);
    if (!health || !health.ok) return;

    for (const table of tablesToHydrate) {
      if (!db[table]) continue;
      const remoteRows = await syncFetch(table);
      if (Array.isArray(remoteRows)) {
        if (remoteRows.length === 0) {
          // If remote is empty, keep local empty
          await db[table].clear().catch(() => {});
        } else {
          // Bulk put remote rows into local store
          await db[table].bulkPut(remoteRows).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.debug('[SyncHydrate Error]', err);
  }
}
