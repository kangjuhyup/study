// Educational fixture: fixed demo tokens, not a login server or production auth SDK.
import http from 'node:http';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const now = () => Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
function assertion(claims) {
  const data = `${encode({ alg: 'EdDSA', typ: 'JWT' })}.${encode(claims)}`;
  return `${data}.${sign(null, Buffer.from(data), privateKey).toString('base64url')}`;
}
function readAssertion(value) {
  if (typeof value !== 'string') throw new Error('missing');
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('format');
  const [head, body, signature] = parts;
  if (JSON.parse(Buffer.from(head, 'base64url')).alg !== 'EdDSA' ||
      !verify(null, Buffer.from(`${head}.${body}`), publicKey, Buffer.from(signature, 'base64url'))) {
    throw new Error('signature');
  }
  const c = JSON.parse(Buffer.from(body, 'base64url'));
  if (c.iss !== 'demo-edge' || c.aud !== 'demo-gateway' ||
      c.source_issuer !== 'urn:demo:auth' || typeof c.sub !== 'string' || !c.sub ||
      !Number.isFinite(c.exp) || c.exp <= now() || !Number.isFinite(c.iat) || c.iat > now() ||
      !Array.isArray(c.scopes) || !c.scopes.includes('api:read')) throw new Error('claims');
  return c;
}
const listen = (port, handler) => http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(() => json(res, 503, { error: 'unavailable' }));
}).listen(port, '0.0.0.0');

// Demo-only introspection fixture. No real credentials or accounts are used.
listen(9001, async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/introspect') return json(res, 404, {});
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 4096) return json(res, 413, {});
  }
  const token = new URLSearchParams(text).get('token');
  if (token === 'demo-auth-down') return json(res, 503, {});
  if (!['demo-valid', 'demo-expired', 'demo-no-scope'].includes(token)) {
    return json(res, 200, { active: false });
  }
  json(res, 200, {
    active: true, iss: 'urn:demo:auth', aud: 'demo-api', sub: 'demo-user',
    exp: now() + (token === 'demo-expired' ? -60 : 300),
    scope: token === 'demo-no-scope' ? '' : 'api:read',
  });
});

// HTTP ext_authz endpoint. Envoy forwards the original request path and method.
listen(9000, async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/profile') return json(res, 403, {});
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
  if (!match) return json(res, 401, { error: 'token_required' });
  const response = await fetch('http://127.0.0.1:9001/introspect', {
    method: 'POST', body: new URLSearchParams({ token: match[1] }),
    signal: AbortSignal.timeout(1000),
  });
  if (!response.ok) return json(res, 503, { error: 'auth_unavailable' });
  const c = await response.json();
  if (c.active !== true || c.iss !== 'urn:demo:auth' || c.aud !== 'demo-api' ||
      !Number.isFinite(c.exp) || c.exp <= now() || typeof c.sub !== 'string' || !c.sub) {
    return json(res, 401, { error: 'invalid_token' });
  }
  const scopes = typeof c.scope === 'string' ? c.scope.split(/\s+/) : [];
  if (!scopes.includes('api:read')) return json(res, 403, { error: 'scope_required' });
  res.setHeader('x-edge-assertion', assertion({
    iss: 'demo-edge', aud: 'demo-gateway', source_issuer: c.iss,
    sub: c.sub, scopes, iat: now(), exp: Math.min(c.exp, now() + 20),
  }));
  res.writeHead(200);
  res.end();
});

// Protected read-only API. Direct Bearer authentication is deliberately absent.
listen(8081, (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/profile') return json(res, 404, {});
  try {
    const principal = readAssertion(req.headers['x-edge-assertion']);
    json(res, 200, { user: principal.sub, via: 'verified-edge-assertion',
      bearerForwarded: Boolean(req.headers.authorization) });
  } catch {
    json(res, 401, { error: 'invalid_edge_assertion' });
  }
});
console.log('Demo ready: authorizer :9000, fixture auth :9001, protected API :8081');
