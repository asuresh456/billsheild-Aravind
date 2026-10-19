const { randomBytes } = require('node:crypto');
const { json, db, currentUser, createSession, deleteSession, hashPassword, verifyPassword, publicUser, isAuthBlocked, recordAuthFailure } = require('../lib/store');

const DUMMY_SALT = randomBytes(16).toString('hex');
const DUMMY_HASH = randomBytes(64).toString('hex');

function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const host = req.headers.host;
    return new URL(origin).host === host;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await db('billshield_users', 'select=id&limit=0');
      const user = await currentUser(req);
      return json(res, 200, { user: user ? publicUser(user) : null });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Use GET or POST.' });
    if (!validOrigin(req)) return json(res, 403, { error: 'Request origin was not allowed.' });

    const { action, email: emailInput, password, displayName = '' } = req.body || {};
    if (action === 'logout') {
      await deleteSession(req, res);
      return json(res, 200, { ok: true });
    }
    const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Enter a valid email address to use as your BillShield ID.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return json(res, 400, { error: 'Use a password between 8 and 128 characters.' });
    }
    if (action === 'signup') {
      if (typeof displayName !== 'string' || displayName.length > 100) return json(res, 400, { error: 'Name must be 100 characters or fewer.' });
      const { salt, hash } = await hashPassword(password);
      const created = await db('billshield_users', '', {
        method: 'POST', prefer: 'return=representation',
        body: { email, display_name: displayName.trim(), password_salt: salt, password_hash: hash }
      });
      const user = created?.[0];
      if (!user) throw new Error('Account could not be created.');
      await createSession(user.id, res);
      return json(res, 201, { user: publicUser(user) });
    }

    if (action === 'login') {
      if (await isAuthBlocked(email)) return json(res, 429, { error: 'Too many failed sign-in attempts. Wait 15 minutes and try again.' });
      const rows = await db('billshield_users', `email=eq.${encodeURIComponent(email)}&select=id,email,display_name,password_salt,password_hash&limit=1`);
      const user = rows?.[0];
      const passwordMatches = await verifyPassword(password, user?.password_salt || DUMMY_SALT, user?.password_hash || DUMMY_HASH);
      if (!user || !passwordMatches) {
        await recordAuthFailure(email);
        return json(res, 401, { error: 'Email or password is incorrect.' });
      }
      await createSession(user.id, res);
      return json(res, 200, { user: publicUser(user) });
    }

    return json(res, 400, { error: 'Choose sign up or sign in.' });
  } catch (error) {
    console.error('Account request failed:', error.message);
    if (error.code === '23505' || error.status === 409) return json(res, 409, { error: 'An account with that email already exists. Choose Sign in instead.' });
    return json(res, 503, { error: error.message.includes('not configured') ? error.message : 'Account service is temporarily unavailable. Check the database setup and try again.' });
  }
};
