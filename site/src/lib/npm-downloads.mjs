const DAY = 86_400_000;
const FIRST_STATS_DAY = '2015-01-10';
const cache = new Map();
const waiting = [];
let active = 0;

async function withRequestSlot(work) {
  if (active >= 4) await new Promise(resolve => waiting.push(resolve));
  else active += 1;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

// Reuse in-flight requests and recent results during local Astro navigation.
// Each production build starts a fresh process and therefore refreshes the data.
export function getCachedPackageDownloads(packageName) {
  const cached = cache.get(packageName);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const entry = { expiresAt: Infinity, promise: null };
  entry.promise = withRequestSlot(() => getPackageDownloads(packageName)).then(stats => {
    entry.expiresAt = Date.now() + (stats ? 60 * 60_000 : 60_000);
    return stats;
  });
  cache.set(packageName, entry);
  return entry.promise;
}

export function sumPackageDownloads(stats) {
  if (stats.length === 0 || stats.some(item => !item || item.end !== stats[0].end)) return null;
  const total = stats.reduce((sum, item) => sum + item.total, 0);
  if (!Number.isSafeInteger(total)) return null;
  return { total, end: stats[0].end, packageCount: stats.length };
}

export async function getProjectDownloads(packageNames) {
  return sumPackageDownloads(await Promise.all([...new Set(packageNames)].map(getCachedPackageDownloads)));
}

function dateValue(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid npm date');
  const value = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== day) throw new Error('Invalid npm date');
  return value;
}

function validatePoint(point, packageName) {
  if (point.package !== packageName || !Number.isSafeInteger(point.downloads) || point.downloads < 0 || dateValue(point.start) > dateValue(point.end)) {
    throw new Error('Invalid npm download statistics');
  }
}

// Scoped packages need individual requests. Every cumulative window is at most
// 365 days, with inclusive dates and no overlap between windows.
export async function getPackageDownloads(packageName, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const encodedName = encodeURIComponent(packageName);
  const request = async url => {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`npm API returned ${response.status}`);
    return response.json();
  };

  try {
    const [metadata, latest] = await Promise.all([
      request(`https://registry.npmjs.org/${encodedName}`),
      request(`https://api.npmjs.org/downloads/point/last-day/${encodedName}`),
    ]);
    validatePoint(latest, packageName);
    if (latest.start !== latest.end) throw new Error('Invalid npm daily period');
    const createdDay = metadata.time?.created?.slice(0, 10);
    dateValue(createdDay);
    const start = createdDay < FIRST_STATS_DAY ? FIRST_STATS_DAY : createdDay;
    const lastDay = dateValue(latest.end);
    if (dateValue(start) > lastDay) throw new Error('Package has no completed statistics period');

    let total = 0;
    for (let cursor = dateValue(start); cursor <= lastDay;) {
      const windowEnd = Math.min(cursor + 364 * DAY, lastDay);
      const from = new Date(cursor).toISOString().slice(0, 10);
      const to = new Date(windowEnd).toISOString().slice(0, 10);
      const point = await request(`https://api.npmjs.org/downloads/point/${from}:${to}/${encodedName}`);
      validatePoint(point, packageName);
      if (point.start !== from || point.end !== to) throw new Error('Incomplete npm download period');
      total += point.downloads;
      if (!Number.isSafeInteger(total)) throw new Error('Invalid npm download total');
      cursor = windowEnd + DAY;
    }
    if (total < latest.downloads) throw new Error('Inconsistent npm download total');
    return { total, start, end: latest.end };
  } catch {
    // An unavailable API must not block publication or turn missing data into 0.
    return null;
  }
}
