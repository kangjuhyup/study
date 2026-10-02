import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPackageDownloads, sumPackageDownloads } from '../src/lib/npm-downloads.mjs';

const name = '@example/package';
const latest = { package: name, downloads: 12, start: '2026-09-29', end: '2026-09-29' };

function fixture({ created = '2026-09-05', daily = latest, point = () => 20 } = {}) {
  const periods = [];
  const fetchImpl = async url => {
    assert.ok(url.endsWith(encodeURIComponent(name)), 'Scoped package name is encoded');
    if (url.startsWith('https://registry.npmjs.org/')) return Response.json({ time: { created: `${created}T12:00:00Z` } });
    const period = url.split('/')[5];
    if (period === 'last-day') return Response.json(daily);
    periods.push(period);
    const [start, end] = period.split(':');
    return Response.json({ package: name, downloads: point(period), start, end });
  };
  return { fetchImpl, periods };
}

test('Cumulative statistics split inclusive periods without gaps or overlap', async () => {
  const { fetchImpl, periods } = fixture({ created: '2024-01-01' });
  const stats = await getPackageDownloads(name, { fetchImpl });
  assert.deepEqual(periods, ['2024-01-01:2024-12-30', '2024-12-31:2025-12-30', '2025-12-31:2026-09-29']);
  assert.deepEqual(stats, { total: 60, start: '2024-01-01', end: '2026-09-29' });
});

test('Statistics start at the first available npm date for older packages', async () => {
  const { fetchImpl, periods } = fixture({ created: '2010-01-01' });
  const stats = await getPackageDownloads(name, { fetchImpl });
  assert.equal(stats.start, '2015-01-10');
  assert.ok(periods[0].startsWith('2015-01-10:'));
});

test('A real zero download count remains available', async () => {
  const { fetchImpl } = fixture({ daily: { ...latest, downloads: 0 }, point: () => 0 });
  assert.equal((await getPackageDownloads(name, { fetchImpl })).total, 0);
});

test('API errors and timeouts produce unavailable statistics instead of zero', async () => {
  assert.equal(await getPackageDownloads(name, { fetchImpl: async () => new Response('', { status: 503 }) }), null);
  // Keep a timer alive because AbortSignal.timeout itself does not keep Node alive.
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({})), 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  assert.equal(await getPackageDownloads(name, { fetchImpl, timeoutMs: 10 }), null);
});

test('Malformed or inconsistent API data is not published as download statistics', async () => {
  for (const options of [
    { daily: { ...latest, downloads: -1 } },
    { daily: { ...latest, package: '@other/package' } },
    { daily: { ...latest, start: '2026-02-30' } },
    { created: '2026-10-01' },
    { point: () => 1 },
  ]) {
    assert.equal(await getPackageDownloads(name, fixture(options)), null);
  }
  const mock = fixture();
  const fetchImpl = async url => {
    const response = await mock.fetchImpl(url);
    if (!url.includes('/point/2026-09-05:')) return response;
    return Response.json({ ...(await response.json()), start: '2026-09-06' });
  };
  assert.equal(await getPackageDownloads(name, { fetchImpl }), null);
});

test('Project downloads sum all related packages on the same reporting date', () => {
  assert.deepEqual(sumPackageDownloads([{ total: 759, end: '2026-09-29' }, { total: 201, end: '2026-09-29' }]), {
    total: 960, end: '2026-09-29', packageCount: 2,
  });
});

test('Partial totals and totals from different reporting dates are unavailable', () => {
  assert.equal(sumPackageDownloads([{ total: 759, end: '2026-09-29' }, null]), null);
  assert.equal(sumPackageDownloads([{ total: 759, end: '2026-09-29' }, { total: 201, end: '2026-09-28' }]), null);
  assert.equal(sumPackageDownloads([]), null);
});
