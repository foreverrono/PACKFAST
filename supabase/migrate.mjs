// One-time data migration: Vercel Blob + api/tms-data.js  ->  Supabase tables.
// Reads the service_role key from ../.env.migration (gitignored). Idempotent
// (upserts by id). Prints a before/after count report so nothing is lost.
//
//   node supabase/migrate.mjs
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://ykuncfakwfzjltlfnvhp.supabase.co';
const BLOB_URL = 'https://packfast.vercel.app/api/blob-store?key=tms';

// ── load service_role key from .env.migration ──
let KEY = '';
try {
  const env = readFileSync(new URL('../.env.migration', import.meta.url), 'utf8');
  KEY = (env.match(/SUPABASE_SERVICE_ROLE\s*=\s*(.+)/) || [])[1]?.trim() || '';
} catch {}
if (!KEY) { console.error('❌ Missing SUPABASE_SERVICE_ROLE in packfast/.env.migration'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const idRows = (arr, gen) => {
  const seen = new Set(), out = [];
  (arr || []).forEach((o, i) => {
    if (!o || typeof o !== 'object') return;
    let id = o.id != null ? String(o.id) : (gen ? gen(o, i) : null);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, data: o });
  });
  return out;
};

async function upsert(table, rows) {
  if (!rows.length) { console.log(`  ${table}: 0 rows (skipped)`); return; }
  const B = 300;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!r.ok) { console.error(`  ❌ ${table} batch ${i}-${i+batch.length}: HTTP ${r.status}`, (await r.text()).slice(0, 300)); process.exit(1); }
  }
  console.log(`  ${table}: upserted ${rows.length}`);
}

async function count(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const cr = r.headers.get('content-range') || '*/0';
  return parseInt(cr.split('/')[1] || '0', 10);
}

// ── sources ──
console.log('Fetching live Blob snapshot…');
const blob = (await (await fetch(BLOB_URL)).json()).data || {};
const blobLoads = blob.loads || [];

console.log('Reading api/tms-data.js (historical seed)…');
const src = readFileSync(new URL('../api/tms-data.js', import.meta.url), 'utf8');
const seed = JSON.parse(src.slice(src.indexOf('const DATA') , src.indexOf('module.exports')).trim().replace(/^const DATA\s*=\s*/, '').replace(/;\s*$/, ''));
const seedLoads = seed.loads || [];

// merge: blob is primary; backfill seed loads missing by id / ref / trip_name
const byId = new Set(blobLoads.map(l => l.id));
const byRef = new Set(blobLoads.map(l => (l.ref || '').trim()).filter(Boolean));
const byTrip = new Set(blobLoads.map(l => (l.trip_name || '').trim()).filter(Boolean));
let backfilled = 0;
const mergedLoads = blobLoads.slice();
for (const l of seedLoads) {
  if (byId.has(l.id)) continue;
  if (l.trip_name && byTrip.has(l.trip_name.trim())) continue;
  if (l.ref && byRef.has(l.ref.trim())) continue;
  mergedLoads.push({ ...l, status: 'Delivered', past: true });
  backfilled++;
}

console.log('\n── SOURCE COUNTS ──');
console.log('  blob loads:', blobLoads.length, '| seed loads:', seedLoads.length, '| backfilled from seed:', backfilled, '| merged total:', mergedLoads.length);
const histTotal = mergedLoads.filter(l => l.past === true).length;
console.log('  historical (past=true) in merged:', histTotal);

// ── upserts ──
console.log('\n── MIGRATING ──');
await upsert('loads', idRows(mergedLoads));
await upsert('customers', idRows(blob.customers, (o,i)=>'CUST-'+(String(o.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('mig-'+i))));
await upsert('locations', idRows(blob.locationBook, (o,i)=>'LOC-mig-'+i));
await upsert('drivers', idRows(blob.drivers));
await upsert('equipment', idRows(blob.equipment));
await upsert('carriers', idRows(blob.carriers));
await upsert('owner_operators', idRows(blob.ownerOperators));
await upsert('invoices', idRows(blob.clientInvoices, (o,i)=>'INV-mig-'+i));
await upsert('org_settings', [{ id: 'singleton', data: {
  loadSeq: blob.loadSeq || 3923,
  driverPayRate: blob.driverPayRate || 28,
  payRates: blob.payRates || {},
  finances: blob.finances || {},
  driverWeekPaid: blob.driverWeekPaid || {},
  ownerOpWeekPaid: blob.ownerOpWeekPaid || {},
  savedLocations: blob.savedLocations || [],
  pendingInvoiceLoads: blob.pendingInvoiceLoads || [],
} }]);

// ── verify ──
console.log('\n── DESTINATION COUNTS (Supabase) ──');
for (const t of ['loads','customers','locations','drivers','equipment','carriers','owner_operators','invoices','org_settings']) {
  console.log(`  ${t}: ${await count(t)}`);
}
const dbLoads = await count('loads');
console.log('\nRESULT:', dbLoads >= mergedLoads.length - 5
  ? `✅ ${dbLoads} loads in Supabase (expected ~${mergedLoads.length}; historical ${histTotal} intact)`
  : `⚠️ MISMATCH — Supabase ${dbLoads} vs expected ${mergedLoads.length}`);
