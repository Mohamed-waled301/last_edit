/**
 * Apex Enterprise ERP - Local Offline Synchronization Layer
 * Operates 100% offline with zero remote network requests to Hostinger.
 */

export async function syncPush(_tableName, _action, _record, _id = null) {
  return { success: true, offline: true };
}

export async function syncFetch(_tableName, _params = {}) {
  return null;
}

export async function syncHydrateAll() {
  // Offline-first: Data is managed purely through local database
  return Promise.resolve();
}

export default {
  syncPush,
  syncFetch,
  syncHydrateAll,
};
