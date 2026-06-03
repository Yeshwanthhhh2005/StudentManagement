import fs from 'fs';
import { parse } from 'csv-parse';
import xlsx from 'xlsx';
import { Student } from '../models/Student.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const UPSERT_BATCH = 2000;

// Map common header variants to our schema fields.
const FIELD_ALIASES = {
  name: 'name',
  fullname: 'name',
  phone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  whatsapp: 'phone',
  email: 'email',
  course: 'course',
  batch: 'batch',
  city: 'city',
  location: 'city',
  status: 'status',
};

function normaliseRow(row) {
  const out = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const key = String(rawKey).trim().toLowerCase().replace(/[\s_-]/g, '');
    const field = FIELD_ALIASES[key];
    if (field && value != null && String(value).trim() !== '') {
      out[field] = String(value).trim();
    }
  }
  // Normalise phone to E.164. Keep an explicit country code (leading +);
  // for bare local numbers, default the country code (India by default).
  if (out.phone) {
    const raw = out.phone.replace(/[\s()-]/g, '');
    if (raw.startsWith('+')) {
      out.phone = `+${raw.slice(1).replace(/\D/g, '')}`;
    } else {
      let digits = raw.replace(/\D/g, '').replace(/^0+/, '');
      const cc = env.defaultCountryCode;
      // A 10-digit number is a bare local mobile -> prepend the default CC.
      if (digits.length === 10) digits = `${cc}${digits}`;
      out.phone = `+${digits}`;
    }
  }
  return out;
}

/** Bulk upsert a batch of students keyed on phone (dedupes re-imports). */
async function upsertBatch(rows) {
  const ops = rows
    .filter((r) => r.phone && r.name)
    .map((r) => ({
      updateOne: {
        filter: { phone: r.phone },
        update: { $set: r },
        upsert: true,
      },
    }));
  if (!ops.length) return { upserted: 0, modified: 0 };
  const res = await Student.bulkWrite(ops, { ordered: false });
  return {
    upserted: res.upsertedCount || 0,
    modified: res.modifiedCount || 0,
  };
}

/** Import a CSV file via streaming parser (constant memory for 300K rows). */
export async function importCsv(filePath) {
  return new Promise((resolve, reject) => {
    const stats = { total: 0, upserted: 0, modified: 0, skipped: 0 };
    let buffer = [];
    let pending = Promise.resolve();

    const parser = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }));

    const flush = () => {
      const batch = buffer;
      buffer = [];
      pending = pending.then(async () => {
        const { upserted, modified } = await upsertBatch(batch);
        stats.upserted += upserted;
        stats.modified += modified;
        stats.skipped += batch.length - upserted - modified;
      });
      return pending;
    };

    parser.on('data', (row) => {
      stats.total += 1;
      buffer.push(normaliseRow(row));
      if (buffer.length >= UPSERT_BATCH) {
        parser.pause();
        flush().then(() => parser.resume()).catch(reject);
      }
    });
    parser.on('end', async () => {
      try {
        await flush();
        await pending;
        resolve(stats);
      } catch (err) {
        reject(err);
      }
    });
    parser.on('error', reject);
  });
}

/** Import an .xlsx/.xls file (read fully — Excel files are smaller in practice). */
export async function importExcel(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  const stats = { total: rows.length, upserted: 0, modified: 0, skipped: 0 };
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH).map(normaliseRow);
    const { upserted, modified } = await upsertBatch(batch);
    stats.upserted += upserted;
    stats.modified += modified;
  }
  stats.skipped = stats.total - stats.upserted - stats.modified;
  return stats;
}

/** Dispatch on file extension. */
export async function importStudentsFromFile(filePath, originalName = '') {
  const lower = originalName.toLowerCase();
  let stats;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    stats = await importExcel(filePath);
  } else {
    stats = await importCsv(filePath);
  }
  fs.unlink(filePath, () => {}); // clean up temp upload
  logger.info(`Import complete: ${JSON.stringify(stats)}`);
  return stats;
}

export default importStudentsFromFile;
