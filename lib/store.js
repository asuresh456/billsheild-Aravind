const { createHash, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'billshield_session';
const SESSION_DAYS = 30;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database access is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.');
  return { url: url.replace(/\/$/, ''), key };
}

async function db(table, query = '', options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || 'Database request failed.');
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

function authIdentifierHash(email) {
  return createHash('sha256').update(email).digest('hex');
}

async function isAuthBlocked(email) {
  const emailHash = authIdentifierHash(email);
  const rows = await db('billshield_auth_limits', `identifier_hash=eq.${emailHash}&blocked_until=gt.${encodeURIComponent(new Date().toISOString())}&select=identifier_hash&limit=1`);
  return Boolean(rows?.length);
}

async function recordAuthFailure(email) {
  const emailHash = authIdentifierHash(email);
  await db('rpc/billshield_auth_failure', '', {
    method: 'POST', body: { p_identifier_hash: emailHash }
  });
}

function cookieValue(req) {
  const cookieHeader = req.headers.cookie || '';
  const item = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`));
  return item ? decodeURIComponent(item.slice(SESSION_COOKIE.length + 1)) : '';
}

function setSessionCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' || (res.req?.headers?.['x-forwarded-proto'] || '').includes('https');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  setSessionCookie(res, '', 0);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function currentUser(req) {
  const token = cookieValue(req);
  if (!token) return null;
  const sessions = await db('billshield_sessions', `token_hash=eq.${hashToken(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`);
  if (!sessions?.length) return null;
  const users = await db('billshield_users', `id=eq.${sessions[0].user_id}&select=id,email,display_name&limit=1`);
  return users?.[0] || null;
}

async function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db('billshield_sessions', '', {
    method: 'POST', prefer: 'return=minimal',
    body: { user_id: userId, token_hash: hashToken(token), expires_at: expiresAt }
  });
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

async function deleteSession(req, res) {
  const token = cookieValue(req);
  if (token) {
    try { await db('billshield_sessions', `token_hash=eq.${hashToken(token)}`, { method: 'DELETE' }); }
    catch (error) { console.error('Session cleanup failed:', error.message); }
  }
  clearSessionCookie(res);
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user) {
  return { id: user.id, email: user.email, display_name: user.display_name || '' };
}

module.exports = { json, db, currentUser, createSession, deleteSession, hashPassword, verifyPassword, publicUser, isAuthBlocked, recordAuthFailure };
