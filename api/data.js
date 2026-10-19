const { json, db, currentUser } = require('../lib/store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'POST' && !validOrigin(req)) return json(res, 403, { error: 'Request origin was not allowed.' });
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to access saved reviews.' });

    if (req.method === 'GET') {
      const { resource, id } = req.query || {};
      if (resource === 'conversations') {
        const data = await db('billshield_conversations', `user_id=eq.${user.id}&select=id,title,updated_at&order=updated_at.desc&limit=8`);
        return json(res, 200, { data });
      }
      if (resource === 'conversation' && UUID.test(id || '')) {
        const data = await db('billshield_conversations', `id=eq.${id}&user_id=eq.${user.id}&select=id,title,context&limit=1`);
        if (!data?.length) return json(res, 404, { error: 'Saved review not found.' });
        return json(res, 200, { data: data[0] });
      }
      if (resource === 'messages' && UUID.test(id || '')) {
        const data = await db('billshield_messages', `conversation_id=eq.${id}&user_id=eq.${user.id}&select=role,content&order=created_at.asc&limit=100`);
        return json(res, 200, { data });
      }
      return json(res, 400, { error: 'Invalid saved-review request.' });
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (action === 'createConversation') {
        const { title = 'Bill review', context = '' } = req.body;
        if (typeof title !== 'string' || title.length > 120 || typeof context !== 'string' || context.length > 3000) {
          return json(res, 400, { error: 'Review title or context is too long.' });
        }
        const data = await db('billshield_conversations', '', {
          method: 'POST', prefer: 'return=representation',
          body: { user_id: user.id, title, context }
        });
        return json(res, 201, { data: data?.[0] });
      }
      if (action === 'saveMessage') {
        const { conversationId, role, content, context } = req.body;
        if (!UUID.test(conversationId || '') || !['user', 'assistant'].includes(role) || typeof content !== 'string' || content.length > 6000) {
          return json(res, 400, { error: 'Message details are invalid.' });
        }
        const owned = await db('billshield_conversations', `id=eq.${conversationId}&user_id=eq.${user.id}&select=id&limit=1`);
        if (!owned?.length) return json(res, 404, { error: 'Saved review not found.' });
        if (role === 'user' && typeof context === 'string') {
          await db('billshield_conversations', `id=eq.${conversationId}&user_id=eq.${user.id}`, {
            method: 'PATCH', prefer: 'return=minimal',
            body: { context: context.slice(0, 3000), updated_at: new Date().toISOString() }
          });
        } else {
          await db('billshield_conversations', `id=eq.${conversationId}&user_id=eq.${user.id}`, {
            method: 'PATCH', prefer: 'return=minimal',
            body: { updated_at: new Date().toISOString() }
          });
        }
        const data = await db('billshield_messages', '', {
          method: 'POST', prefer: 'return=minimal',
          body: { conversation_id: conversationId, user_id: user.id, role, content }
        });
        return json(res, 201, { ok: true, data });
      }
      return json(res, 400, { error: 'Invalid saved-review action.' });
    }
    return json(res, 405, { error: 'Use GET or POST.' });
  } catch (error) {
    console.error('Saved-review request failed:', error.message);
    return json(res, 503, { error: 'Saved reviews are temporarily unavailable. Check the database setup and try again.' });
  }
};
