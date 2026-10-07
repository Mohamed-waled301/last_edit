/**
 * Workshop ERP - Unified Data Access Layer (DAL)
 * Pure frontend repository pattern wrapping Dexie IndexedDB for Clothing Factory ERP.
 */

export { default as db } from './db';
export { default as auditRepo } from './repositories/auditRepo';
export { default as usersRepo } from './repositories/usersRepo';
export { default as settingsRepo } from './repositories/settingsRepo';
export { default as suppliersRepo } from './repositories/suppliersRepo';
export { default as materialsRepo } from './repositories/materialsRepo';
export { default as productsRepo } from './repositories/productsRepo';
export { default as manufacturingRepo } from './repositories/manufacturingRepo';
export { default as finishingRepo } from './repositories/finishingRepo';
export { default as salesRepo } from './repositories/salesRepo';
export { default as cashRepo } from './repositories/cashRepo';
export { default as reportsRepo } from './repositories/reportsRepo';
export { default as backupRepo } from './repositories/backupRepo';

// Master Data & Operations Repositories
export { default as itemsRepo } from './repositories/itemsRepo';
export { default as partiesRepo } from './repositories/partiesRepo';
export { default as storageRepo } from './repositories/storageRepo';
export { default as treasuriesRepo } from './repositories/treasuriesRepo';
export { default as expenseCodesRepo } from './repositories/expenseCodesRepo';
