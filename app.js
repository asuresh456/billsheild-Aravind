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

function toast(text) {
  const el = document.querySelector('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
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

function addMessage(text, role) {
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
  row.append(avatar, wrap);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
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

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text) return;
  if (!selectedFile && history.length === 0) return toast('Add a bill before asking your first question.');
  const file = selectedFile;
  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  question.value = '';
  question.style.height = 'auto';
  sendButton.disabled = true;
  const pending = addMessage('I’m reading the bill and checking what information is available…', 'assistant');
  try {
    const payload = { message: text, history: history.slice(-9, -1), promise: promiseInput.value.trim() };
    if (file) payload.file = { name: file.name, type: file.type, data: await readFileAsDataURL(file) };
    const response = await fetch('./api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Bill review failed.');
    pending.textContent = result.answer;
    history.push({ role: 'assistant', content: result.answer });
    showLineCard(result.answer);
  } catch (error) {
    pending.textContent = error.message || 'Something went wrong. Please try again.';
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
document.querySelector('#newReview').addEventListener('click', () => window.location.reload());
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  question.value = button.dataset.prompt;
  question.focus();
  question.dispatchEvent(new Event('input'));
}));

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
