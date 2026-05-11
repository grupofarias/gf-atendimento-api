export const adminHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GF Atendimento — Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f1f5f9; color: #1e293b; min-height: 100vh; }
  header { background: #1e293b; color: white; padding: 16px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 18px; font-weight: 600; flex: 1; }
  .key-wrap { display: flex; gap: 8px; }
  .key-wrap input { padding: 6px 10px; border-radius: 6px; border: none; font-size: 13px; width: 280px; }
  .key-wrap button { padding: 6px 14px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .key-wrap button:hover { background: #2563eb; }
  #status { font-size: 12px; padding: 4px 10px; border-radius: 12px; }
  .ok { background: #dcfce7; color: #166534; }
  .err { background: #fee2e2; color: #991b1b; }
  nav { background: white; border-bottom: 1px solid #e2e8f0; padding: 0 24px; display: flex; gap: 4px; }
  nav button { padding: 12px 16px; border: none; background: none; cursor: pointer; font-size: 14px; color: #64748b; border-bottom: 2px solid transparent; }
  nav button.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 500; }
  nav button:hover:not(.active) { color: #1e293b; }
  main { padding: 24px; max-width: 900px; margin: 0 auto; }
  .section { display: none; }
  .section.active { display: block; }
  .card { background: white; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; }
  .card-header { padding: 14px 20px; font-weight: 600; font-size: 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .card-body { padding: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; color: #64748b; font-weight: 500; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; background: #dbeafe; color: #1d4ed8; }
  .del-btn { background: none; border: 1px solid #fca5a5; color: #ef4444; padding: 4px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; }
  .del-btn:hover { background: #fee2e2; }
  .empty { text-align: center; color: #94a3b8; padding: 32px; font-size: 13px; }
  form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; align-items: end; }
  label { font-size: 12px; color: #64748b; display: block; margin-bottom: 4px; font-weight: 500; }
  input, select { width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
  input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
  .submit-btn { padding: 8px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
  .submit-btn:hover { background: #2563eb; }
  .hint { font-size: 12px; color: #94a3b8; margin-top: 6px; }
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 8px; font-size: 13px; color: white; z-index: 999; opacity: 0; transition: opacity .3s; pointer-events: none; }
  .toast.show { opacity: 1; }
  .toast.success { background: #16a34a; }
  .toast.error { background: #dc2626; }
</style>
</head>
<body>

<header>
  <h1>GF Atendimento — Admin</h1>
  <div class="key-wrap">
    <input type="password" id="apiKey" placeholder="MIDDLEWARE_API_KEY" />
    <button onclick="connect()">Conectar</button>
    <span id="status"></span>
  </div>
</header>

<nav>
  <button class="active" onclick="tab('accounts', this)">Contas Chatwoot</button>
</nav>

<main>

<!-- CONTAS -->
<div class="section active" id="sec-accounts">
  <div class="card">
    <div class="card-header">Adicionar Conta Chatwoot</div>
    <div class="card-body">
      <form onsubmit="create(event,'accounts')">
        <div>
          <label>Account ID</label>
          <input name="accountId" type="number" required placeholder="1" />
          <p class="hint">Número da conta no Chatwoot (URL: /app/accounts/<b>1</b>/...)</p>
        </div>
        <div>
          <label>Base URL</label>
          <input name="baseUrl" required placeholder="https://chatwoot.seudominio.com.br" />
        </div>
        <div>
          <label>API Token</label>
          <input name="apiToken" required placeholder="token de acesso do Chatwoot" />
          <p class="hint">Perfil → Tokens de Acesso no Chatwoot</p>
        </div>
        <div><button class="submit-btn" type="submit">Adicionar</button></div>
      </form>
    </div>
  </div>
  <div class="card">
    <div class="card-header">Contas cadastradas</div>
    <div class="card-body" id="list-accounts"><div class="empty">Conecte com a API Key para carregar.</div></div>
  </div>
</div>


</main>

<div class="toast" id="toast"></div>

<script>
let key = localStorage.getItem('gf_admin_key') || '';
if (key) { document.getElementById('apiKey').value = key; connect(); }

function tab(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  btn.classList.add('active');
}

async function connect() {
  key = document.getElementById('apiKey').value.trim();
  if (!key) return;
  localStorage.setItem('gf_admin_key', key);
  const st = document.getElementById('status');
  try {
    const r = await fetch('/admin/accounts', { headers: { 'x-api-key': key } });
    if (r.ok) { st.textContent = '● conectado'; st.className = 'ok'; loadAll(); }
    else { st.textContent = '● chave inválida'; st.className = 'err'; }
  } catch { st.textContent = '● erro de conexão'; st.className = 'err'; }
}

async function loadAll() {
  await load('accounts');
}

async function load(res) {
  const r = await fetch('/admin/' + res, { headers: { 'x-api-key': key } });
  const data = await r.json();
  document.getElementById('list-' + res).innerHTML = renderTable(res, data);
}

function renderTable(res, data) {
  if (!data.length) return '<div class="empty">Nenhum registro.</div>';
  const cols = {
    accounts: [['ID', 'id'], ['Account ID', 'accountId'], ['Base URL', 'baseUrl']],
    inboxes:  [['ID', 'id'], ['Inbox ID', 'chatwootInboxId'], ['Account ID', 'accountId'], ['Canal', 'channelType'], ['Ativo', 'active']],
  }[res];
  const head = cols.map(([l]) => '<th>' + l + '</th>').join('');
  const rows = data.map(row => {
    const cells = cols.map(([, k]) => {
      const v = row[k] ?? '—';
      if (k === 'channelType') return '<td><span class="badge">' + v + '</span></td>';
      if (k === 'active') return '<td>' + (v ? '✅' : '❌') + '</td>';
      return '<td>' + v + '</td>';
    }).join('');
    return '<tr>' + cells + '<td><button class="del-btn" onclick="del(&apos;' + res + '&apos;,' + row.id + ')">remover</button></td></tr>';
  }).join('');
  return '<table><thead><tr>' + head + '<th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}

async function create(e, res) {
  e.preventDefault();
  const form = e.target;
  const body = {};
  new FormData(form).forEach((v, k) => {
    if (v !== '') body[k] = form.elements[k].type === 'number' ? +v : v;
  });
  const r = await fetch('/admin/' + res, { method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.ok) { toast('Adicionado!', 'success'); form.reset(); load(res); }
  else { const err = await r.json().catch(() => ({})); toast(err.message || 'Erro ao salvar', 'error'); }
}

async function del(res, id) {
  if (!confirm('Remover item ' + id + '?')) return;
  const r = await fetch('/admin/' + res + '/' + id, { method: 'DELETE', headers: { 'x-api-key': key } });
  if (r.ok || r.status === 204) { toast('Removido', 'success'); load(res); }
  else toast('Erro ao remover', 'error');
}

function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 2500);
}
</script>
</body>
</html>`;
