// SaviorFuel AI proxy — Copyright (c) 2026 Xavier Chua (Savior). All rights reserved. See the LICENSE file in the repo root.
import { getStore } from '@netlify/blobs';
import { handleScan } from '../../lib/scan-core.mjs';

// Thin Netlify wrapper: all the logic (and its tests) live in lib/scan-core.mjs.
export default async (req, context) => {
  const store = getStore('scan-limits');
  return handleScan(req, { ip: context.ip, store, env: process.env });
};

export const config = { path: '/api/scan-food' };
