const fileInput = document.querySelector('#billFile');
const dropzone = document.querySelector('#dropzone');
const fileChip = document.querySelector('#fileChip');
const fileName = document.querySelector('#fileName');
const messages = document.querySelector('#messages');
const form = document.querySelector('#chatForm');
const question = document.querySelector('#question');
const sendButton = document.querySelector('#sendButton');
const promiseInput = document.querySelector('#promise');
const lineCard = document.querySelector('#lineCard');
const lineSummary = document.querySelector('#lineSummary');
const history = [];
let selectedFile = null;
let toastTimer;
let supabaseClient = null;
let currentUser = null;
let activeConversationId = null;
let allowAutoRestore = true;
let authMode = 'signup';

function toast(text) {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function setFile(file) {
  if (!file) return;
  const supported = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!supported.includes(file.type)) return toast('Choose a PDF, JPG, PNG, or WebP file.');
  if (file.size > 3 * 1024 * 1024) return toast('This MVP accepts files up to 3 MB.');
  selectedFile = file;
  fileName.textContent = file.name;
  document.querySelector('.file-type').textContent = file.type === 'application/pdf' ? 'PDF' : 'IMG';
  fileChip.classList.remove('hidden');
  dropzone.classList.add('hidden');
  toast('Bill added. Ask a question to start reviewing it.');
}

fileInput.addEventListener('change', event => setFile(event.target.files[0]));
document.querySelector('#removeFile').addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
});
['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', event => setFile(event.dataTransfer.files[0]));

function addMessage(text, role, withSuggestions = false) {
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'Y' : 'B';
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = role === 'user' ? 'YOU · NOW' : 'BILLSHIELD · REVIEW';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.append(meta, bubble);
  if (withSuggestions) {
    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions';
    for (const [label, prompt] of [['Explain a line', 'Can you explain a line on this bill?'], ['Check the maths', 'Can you check whether these totals add up?']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.prompt = prompt;
      button.textContent = label;
      button.addEventListener('click', () => {
        question.value = prompt;
        question.focus();
        question.dispatchEvent(new Event('input'));
      });
      suggestions.append(button);
    }
    wrap.append(suggestions);
  }
  row.append(avatar, wrap);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function resetConversationView() {
  messages.replaceChildren();
  history.length = 0;
  activeConversationId = null;
  promiseInput.value = '';
  lineCard.classList.add('hidden');
  addMessage('Add your bill and what you expected. I’ll help you follow the line items, explain unfamiliar wording, and check arithmetic. If the statement doesn’t contain enough evidence, I’ll say so.', 'assistant', true);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function showLineCard(text) {
  const amountMatches = [...text.matchAll(/(?:₹|Rs\.?\s?)([\d,]+(?:\.\d{1,2})?)/g)].map(match => match[0]);
  if (!amountMatches.length) return;
  lineSummary.textContent = `Amounts mentioned in the latest explanation: ${[...new Set(amountMatches)].join(' · ')}\nCheck each figure against the bill before relying on it.`;
  lineCard.classList.remove('hidden');
}

function setAuthView(user) {
  currentUser = user || null;
  const authForm = document.querySelector('#authForm');
  const signOutButton = document.querySelector('#signOutButton');
  const list = document.querySelector('#conversationList');
  const copy = document.querySelector('#accountCopy');
  const status = document.querySelector('#privacyStatus');
  const authenticated = Boolean(currentUser);
  document.querySelector('#authRequiredBanner').classList.toggle('hidden', authenticated);
  document.querySelector('#chatCard').classList.toggle('auth-locked', !authenticated);
  document.querySelectorAll('#uploadCard, .promise-card, #lineCard').forEach(node => node.classList.toggle('auth-locked', !authenticated));
  document.querySelectorAll('#billFile, #removeFile, #question, #sendButton, #promise, #calculateButton, #understoodButton, #draftButton').forEach(node => { node.disabled = !authenticated; });
  if (currentUser) {
    authForm.classList.add('hidden');
    signOutButton.classList.remove('hidden');
    list.classList.remove('hidden');
    copy.textContent = currentUser.email || 'Signed in';
    status.textContent = 'Private history enabled';
    loadConversationList();
  } else {
    authForm.classList.remove('hidden');
    signOutButton.classList.add('hidden');
    list.classList.add('hidden');
    copy.textContent = supabaseClient
      ? (authMode === 'signup' ? 'Create an account to keep your bill reviews private and available next time.' : 'Sign in to return to your saved bill reviews.')
      : 'Account storage is not connected. Reviews are paused until setup is available.';
    status.textContent = supabaseClient ? 'Sign in required' : 'Account setup unavailable';
    list.replaceChildren();
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.querySelector('#signupMode').classList.toggle('active', signup);
  document.querySelector('#loginMode').classList.toggle('active', !signup);
  document.querySelector('#signupMode').setAttribute('aria-pressed', String(signup));
  document.querySelector('#loginMode').setAttribute('aria-pressed', String(!signup));
  document.querySelector('#authNameLabel').classList.toggle('hidden', !signup);
  document.querySelector('#authName').classList.toggle('hidden', !signup);
  document.querySelector('#authName').required = false;
  document.querySelector('#authEmail').autocomplete = signup ? 'email' : 'username';
  document.querySelector('#authButton').textContent = signup ? 'Create account with email' : 'Sign in with email';
  document.querySelector('#authHelp').textContent = signup
    ? 'We’ll email you a secure link to confirm your address and finish creating your account.'
    : 'Enter the email you used to sign up. We’ll send a secure sign-in link.';
  if (!currentUser) document.querySelector('#accountCopy').textContent = signup
    ? 'Create an account to keep your bill reviews private and available next time.'
    : 'Sign in to return to your saved bill reviews.';
}

async function loadConversationList() {
  if (!supabaseClient || !currentUser) return;
  const list = document.querySelector('#conversationList');
  const { data, error } = await supabaseClient.from('conversations')
    .select('id,title,updated_at').order('updated_at', { ascending: false }).limit(8);
  if (error) {
    console.error('Could not load saved conversations:', error.message);
    document.querySelector('#accountCopy').textContent = 'History storage is not ready yet. Apply the database setup, then reload.';
    return;
  }
  list.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('span');
    empty.className = 'conversation-empty';
    empty.textContent = 'Saved reviews will appear here.';
    list.append(empty);
    return;
  }
  for (const item of data) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saved-conversation';
    button.textContent = item.title || 'Bill review';
    button.title = button.textContent;
    button.classList.toggle('selected', item.id === activeConversationId);
    button.addEventListener('click', () => openConversation(item.id));
    list.append(button);
  }
  if (allowAutoRestore && !activeConversationId && history.length === 0 && data.length) {
    allowAutoRestore = false;
    await openConversation(data[0].id);
  }
}

async function openConversation(id) {
  const { data: conversation, error: conversationError } = await supabaseClient.from('conversations')
    .select('id,title,context').eq('id', id).single();
  if (conversationError) return toast('Could not open that saved review.');
  const { data, error } = await supabaseClient.from('messages')
    .select('role,content').eq('conversation_id', id).order('created_at', { ascending: true }).limit(100);
  if (error) return toast('Could not load the saved messages.');
  activeConversationId = id;
  history.splice(0, history.length, ...data.map(({ role, content }) => ({ role, content })));
  messages.replaceChildren();
  for (const item of data) addMessage(item.content, item.role);
  if (!data.length) addMessage('This saved review has no messages yet.', 'assistant');
  promiseInput.value = conversation.context || '';
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
  lineCard.classList.add('hidden');
  const note = document.createElement('div');
  note.className = 'saved-file-note';
  note.textContent = 'Conversation restored. Bill files are not stored; upload the statement again if a new question depends on it.';
  messages.prepend(note);
  loadConversationList();
  question.focus();
}

async function ensureConversation(firstQuestion) {
  if (!currentUser || activeConversationId) return activeConversationId;
  const title = firstQuestion.trim().replace(/\s+/g, ' ').slice(0, 72) || 'Bill review';
  const { data, error } = await supabaseClient.from('conversations').insert({
    user_id: currentUser.id,
    title,
    context: promiseInput.value.trim().slice(0, 3000)
  }).select('id').single();
  if (error) throw error;
  activeConversationId = data.id;
  loadConversationList();
  return activeConversationId;
}

async function saveMessage(role, content, firstQuestion = '') {
  if (!currentUser || !supabaseClient) return false;
  const id = await ensureConversation(firstQuestion);
  if (role === 'user') {
    await supabaseClient.from('conversations').update({ context: promiseInput.value.trim().slice(0, 3000) }).eq('id', id);
  }
  const { error } = await supabaseClient.from('messages').insert({ conversation_id: id, user_id: currentUser.id, role, content: content.slice(0, 6000) });
  if (error) throw error;
  await supabaseClient.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
  return true;
}

document.querySelector('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient) return toast('Database sign-in is not configured yet.');
  const email = document.querySelector('#authEmail').value.trim();
  const displayName = document.querySelector('#authName').value.trim();
  const button = document.querySelector('#authButton');
  button.disabled = true;
  try {
    const options = { emailRedirectTo: window.location.origin, shouldCreateUser: authMode === 'signup' };
    if (authMode === 'signup' && displayName) options.data = { display_name: displayName };
    const { error } = await supabaseClient.auth.signInWithOtp({ email, options });
    if (error) throw error;
    toast(authMode === 'signup' ? 'Account link sent. Check your email to finish signing up.' : 'Sign-in link sent. Check your email.');
    document.querySelector('#accountCopy').textContent = authMode === 'signup'
      ? 'Check your inbox to confirm your email and activate your account.'
      : 'Check your inbox for a secure sign-in link. It may take a minute to arrive.';
  } catch (error) {
    console.error('Sign-in error:', error.message);
    toast('Could not send the link. Check Supabase Auth email and redirect settings.');
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#signupMode').addEventListener('click', () => setAuthMode('signup'));
document.querySelector('#loginMode').addEventListener('click', () => setAuthMode('login'));

document.querySelector('#signOutButton').addEventListener('click', async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  resetConversationView();
  allowAutoRestore = true;
  setAuthView(null);
  toast('Signed out.');
});

const supabaseReady = (async () => {
  try {
    const response = await fetch('./api/supabase-config');
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Supabase config is unavailable.');
    if (!window.supabase?.createClient) throw new Error('Supabase browser library did not load.');
    supabaseClient = window.supabase.createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await supabaseClient.auth.getSession();
    setAuthView(data.session?.user || null);
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      setAuthView(session?.user || null);
      if (session?.user) {
        const displayName = session.user.user_metadata?.display_name || null;
        if (displayName) {
          const { error } = await supabaseClient.from('profiles').upsert({
            id: session.user.id,
            display_name: displayName,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
          if (error) console.error('Could not save profile name:', error.message);
        }
      } else {
        activeConversationId = null;
        history.length = 0;
        selectedFile = null;
        fileInput.value = '';
        fileChip.classList.add('hidden');
        dropzone.classList.remove('hidden');
        resetConversationView();
      }
    });
  } catch (error) {
    console.error('Database setup unavailable:', error.message);
    document.querySelector('#accountCopy').textContent = 'Account storage is not connected. Reviews are paused until setup is available.';
    setAuthView(null);
  }
})();

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text) return;
  await supabaseReady;
  if (!currentUser) {
    toast(supabaseClient ? 'Create an account or sign in before starting a bill review.' : 'Sign-in storage is unavailable right now. Try again after setup is restored.');
    document.querySelector('#authEmail').focus();
    return;
  }
  if (!selectedFile && history.length === 0) return toast('Add a bill before asking your first question.');
  const file = selectedFile;
  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  question.value = '';
  question.style.height = 'auto';
  sendButton.disabled = true;
  const pending = addMessage('I’m reading the bill and checking what information is available…', 'assistant');
  let saved = false;
  try {
    if (currentUser) {
      try {
        await saveMessage('user', text, text);
        saved = true;
      } catch (error) {
        console.error('Could not save your message:', error.message);
        toast('Review is running, but chat history could not be saved. Check that the database setup was applied.');
      }
    }
    const payload = { message: text, history: history.slice(-11, -1), promise: promiseInput.value.trim() };
    if (file) payload.file = { name: file.name, type: file.type, data: await readFileAsDataURL(file) };
    const response = await fetch('./api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Bill review failed.');
    pending.textContent = result.answer;
    history.push({ role: 'assistant', content: result.answer });
    if (currentUser && saved) {
      try { await saveMessage('assistant', result.answer); }
      catch (error) { console.error('Could not save the review response:', error.message); toast('The response is ready, but could not be added to saved history.'); }
    }
    showLineCard(result.answer);
    loadConversationList();
  } catch (error) {
    pending.textContent = error.message || 'Something went wrong. Please try again.';
    if (currentUser && saved) {
      try { await saveMessage('assistant', pending.textContent); } catch { /* Retain the visible error if storage is unavailable. */ }
    }
  } finally {
    sendButton.disabled = false;
    question.focus();
    messages.scrollTop = messages.scrollHeight;
  }
});

question.addEventListener('input', () => { question.style.height = 'auto'; question.style.height = `${Math.min(question.scrollHeight, 100)}px`; });
question.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
document.querySelector('#understoodButton').addEventListener('click', () => { toast('Marked as understood. No message needed.'); lineCard.classList.add('hidden'); });
document.querySelector('#draftButton').addEventListener('click', () => { question.value = 'Help me draft a polite question to the issuer about this line. Do not claim it is an error.'; question.focus(); question.dispatchEvent(new Event('input')); });
document.querySelector('#newReview').addEventListener('click', () => {
  allowAutoRestore = false;
  resetConversationView();
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.add('hidden');
  dropzone.classList.remove('hidden');
  loadConversationList();
});

document.querySelector('#calculateButton').addEventListener('click', () => {
  const amountText = document.querySelector('#baseAmount').value.trim().replace(/,/g, '');
  const rateText = document.querySelector('#taxRate').value.trim().replace(/,/g, '');
  const amount = Number(amountText);
  const rate = Number(rateText);
  const result = document.querySelector('#calcResult');
  if (!amountText || !rateText || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return toast('Enter a valid charge and tax rate.');
  const tax = Math.round((amount * rate / 100 + Number.EPSILON) * 100) / 100;
  result.textContent = `₹${amount.toFixed(2)} × ${rate}% = ₹${tax.toFixed(2)} tax`;
  result.classList.remove('hidden');
});

resetConversationView();
setAuthMode('signup');
