import assert from 'node:assert/strict';
const edge = process.env.EDGE_URL ?? 'http://127.0.0.1:18080';
const direct = process.env.DIRECT_URL ?? 'http://127.0.0.1:18081';
// Wait briefly for Envoy's upstream discovery after container startup.
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(`${edge}/api/profile`, { method: 'POST', signal: AbortSignal.timeout(1000) });
    if (response.status === 401) break;
  } catch {}
  if (attempt === 29) throw new Error('Demo did not become ready');
  await new Promise(resolve => setTimeout(resolve, 500));
}
const cases = [
  ['정상 토큰', edge, 'demo-valid', {}, 200],
  ['토큰 없음', edge, null, {}, 401],
  ['변조 토큰', edge, 'wrong', {}, 401],
  ['만료 토큰', edge, 'demo-expired', {}, 401],
  ['scope 부족', edge, 'demo-no-scope', {}, 403],
  ['Auth 장애', edge, 'demo-auth-down', {}, 503],
  ['위조 헤더만 전달', edge, null, { 'x-edge-assertion': 'forged' }, 401],
  ['정상 토큰 + 위조 헤더 교체', edge, 'demo-valid', { 'x-edge-assertion': 'forged' }, 200],
  ['Gateway 직접 Bearer 호출', direct, 'demo-valid', {}, 401],
  ['Gateway 위조 assertion', direct, null, { 'x-edge-assertion': 'forged' }, 401],
];
for (const [name, base, token, extra, expected] of cases) {
  const response = await fetch(`${base}/api/profile`, {
    method: 'POST', headers: { ...extra, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, expected, name);
  if (expected === 200) {
    const body = await response.json();
    assert.equal(body.bearerForwarded, false, '원본 토큰 제거');
    assert.equal(body.user, 'demo-user');
  }
  console.log(`PASS ${name}: ${response.status}`);
}
for (const [method, path, status] of [['OPTIONS', '/api/profile', 204], ['POST', '/graphql', 404]]) {
  assert.equal((await fetch(`${edge}${path}`, { method })).status, status);
  console.log(`PASS ${method} ${path}: ${status}`);
}
