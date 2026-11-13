import {currentToken,setSession,jsonApi} from './session.js';

const $ = id => document.getElementById(id);
const form = $('login-form');
const code = new URLSearchParams(location.hash.slice(1)).get('invito');
let mode = code ? 'activate' : 'login';
if (code) history.replaceState(null,'',location.pathname+location.search);

function renderLogin() {
  $('login-title').textContent = {login:'Accedi all’agenda',setup:'Configura amministratore',activate:'Attiva il tuo account'}[mode];
  $('login-submit').textContent = mode==='login' ? 'Accedi' : 'Imposta password';
  $('login-email').hidden = mode==='activate';
  form.elements.email.required = mode!=='activate';
  $('setup-code').hidden = mode!=='setup';
  form.elements.code.required = mode==='setup';
  form.elements.password.autocomplete = mode==='login' ? 'current-password' : 'new-password';
  form.elements.password.minLength = mode==='login' ? 0 : 12;
}

async function openAgenda(user) {
  $('login-shell').hidden = true;
  $('protected-app').hidden = false;
  $('manage-users').hidden = user.role!=='admin';
  await import('./agenda.js');
}

form.onsubmit = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  $('login-submit').disabled = true;
  $('login-message').textContent = '';
  try {
    if (mode==='login') {
      const result = await jsonApi('/api/login',data);
      setSession(result.token,result.user);
      form.reset();
      await openAgenda(result.user);
    } else {
      if (mode==='activate') data.code = code;
      await jsonApi('/api/'+mode,data);
      form.reset();
      mode = 'login';
      $('setup-toggle').hidden = true;
      renderLogin();
      $('login-message').textContent = 'Account pronto. Accedi con la tua email e password.';
    }
  } catch(error) {
    $('login-message').textContent = error.message;
  } finally { $('login-submit').disabled = false; }
};

$('setup-toggle').onclick = () => {
  mode = mode==='login' ? 'setup' : 'login';
  $('setup-toggle').textContent = mode==='setup' ? 'Torna al login' : 'Configura amministratore';
  renderLogin();
};
$('logout').onclick = async () => {
  try { await jsonApi('/api/logout',{}); }
  catch (error) { if (error.status!==401) { $('notice').hidden=false; $('notice').textContent=error.message; return; } }
  setSession(null);
  location.reload();
};

const labels = {admin:'Amministratore',editor:'Modifica',viewer:'Lettura'};
let users = [];
let selectedEmail;
let adminBusy = false;

const statusOf = user => user.active ? (user.activated ? 'Attivo' : 'Invito in attesa') : 'Disattivato';

function userIdentity(user) {
  const identity = document.createElement('span');
  identity.className = 'user-identity';
  const email = document.createElement('strong');
  email.textContent = user.email;
  const role = document.createElement('small');
  role.textContent = labels[user.role];
  identity.append(email,role);
  const status = document.createElement('span');
  status.className = 'user-status';
  status.dataset.state = user.active ? (user.activated ? 'active' : 'pending') : 'disabled';
  status.textContent = statusOf(user);
  return [identity,status];
}

async function loadUsers() {
  users = await jsonApi('/api/users');
  $('user-count').textContent = '('+users.length+')';
  const rows = users.map(user=>{
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'user-list-row';
    const arrow = document.createElement('span');
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden','true');
    row.append(...userIdentity(user),arrow);
    row.onclick = () => showUser(user.email);
    return row;
  });
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nessun utente disponibile.';
    rows.push(empty);
  }
  $('account-list').replaceChildren(...rows);
}

function showUsers() {
  selectedEmail = undefined;
  $('users-overview').hidden = false;
  $('user-panel').hidden = true;
  $('invite-output').hidden = true;
  $('invite-link').value = '';
  $('admin-message').textContent = '';
}

function openUserPanel() {
  $('users-overview').hidden = true;
  $('user-panel').hidden = false;
  $('invite-output').hidden = true;
  $('invite-link').value = '';
  $('admin-message').textContent = '';
}

function showUser(email) {
  const user = users.find(item=>item.email===email);
  if (!user) return;
  selectedEmail = email;
  openUserPanel();
  $('invite-form').hidden = true;
  const details = $('user-details');
  details.hidden = false;
  const heading = document.createElement('div');
  heading.className = 'user-detail-heading';
  heading.append(...userIdentity(user));
  details.replaceChildren(heading);
  if (user.role!=='admin') {
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const choices = [];
    if (user.active) {
      choices.push(['role',user.role==='editor'?'viewer':'editor',user.role==='editor'?'Imposta sola lettura':'Consenti modifica']);
    }
    choices.push(['invite',user.role,!user.active?'Riattiva con un invito':user.activated?'Reimposta password':'Crea un nuovo invito']);
    if (user.active) choices.push(['disable',user.role,'Disattiva accesso']);
    for (const [action,role,label] of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action==='disable' ? 'plain user-danger' : 'plain';
      button.textContent = label;
      button.onclick = () => {
        const confirmation = action==='disable' ? 'Disattivare l’accesso di '+email+'?'
          : action==='invite' && user.activated ? 'Reimpostare la password di '+email+'? L’utente dovrà usare il nuovo invito per accedere.' : '';
        if (!confirmation || window.confirm(confirmation)) modifyUser({action,email,role},button);
      };
      actions.append(button);
    }
    details.append(actions);
  }
  $('user-back').focus();
}

async function modifyUser(data,button) {
  if (adminBusy || button.disabled) return;
  adminBusy=true;
  button.disabled=true;
  $('user-back').disabled=true;
  $('admin-message').textContent='Aggiornamento in corso…';
  try {
    const result = await jsonApi('/api/users',data);
    try {
      await loadUsers();
      if (selectedEmail) showUser(selectedEmail);
      else $('invite-form').reset();
    } catch {
      $('admin-message').textContent='Modifica salvata. Riapri Gestione utenti per aggiornare la lista.';
      if (!result.code) return;
    }
    if (result.code) {
      const link=new URL(location.pathname,location.origin);
      link.hash='invito='+result.code;
      $('invite-link').value=link.href;
      $('invite-output').hidden=false;
      $('admin-message').textContent='Invito pronto per '+data.email+'.';
    } else $('admin-message').textContent='Utente aggiornato.';
  } catch(error) { $('admin-message').textContent=error.message; }
  finally {
    adminBusy=false;
    button.disabled=false;
    $('user-back').disabled=false;
    if (selectedEmail) $('user-back').focus();
  }
}
$('user-back').onclick=()=>{
  showUsers();
  $('show-invite').focus();
};
$('show-invite').onclick=()=>{
  openUserPanel();
  $('user-details').hidden=true;
  const invite = $('invite-form');
  invite.reset();
  invite.hidden=false;
  invite.elements.email.focus();
};
$('manage-users').onclick=async()=>{
  showUsers();
  $('account-list').replaceChildren();
  $('user-count').textContent='';
  $('admin-message').textContent='Caricamento utenti…';
  $('user-admin').showModal();
  try { await loadUsers(); $('admin-message').textContent=''; }
  catch(error) { $('admin-message').textContent=error.message; }
};
$('user-admin').addEventListener('cancel',event=>{
  if (adminBusy) event.preventDefault();
});
$('user-admin').querySelector('[method="dialog"]').addEventListener('submit',event=>{
  if (adminBusy) event.preventDefault();
});
$('user-admin').addEventListener('close',showUsers);
$('invite-form').onsubmit=event=>{
  event.preventDefault();
  modifyUser({action:'invite',...Object.fromEntries(new FormData(event.currentTarget))},event.submitter);
};
$('copy-invite').onclick=async()=>{
  try { await navigator.clipboard.writeText($('invite-link').value); $('admin-message').textContent='Link copiato.'; }
  catch { $('invite-link').select(); }
};

renderLogin();
if (currentToken() && mode==='login') {
  try {
    const user = await jsonApi('/api/me');
    setSession(currentToken(),user);
    await openAgenda(user);
  } catch(error) {
    if (error.status===401) setSession(null);
    else $('login-message').textContent=error.message;
  }
}
if (mode==='login' && !$('login-shell').hidden) {
  try { $('setup-toggle').hidden=!(await jsonApi('/api/setup')).setup; }
  catch(error) { $('login-message').textContent=error.message; }
}
