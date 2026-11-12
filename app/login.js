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
async function loadUsers() {
  const users = await jsonApi('/api/users');
  const rows = users.map(user=>{
    const row = document.createElement('div');
    row.className='account-row';
    const text = document.createElement('span');
    text.textContent = user.email+' · '+labels[user.role]+' · '+(user.active ? (user.activated?'Attivo':'Invito in attesa') : 'Disattivato');
    row.append(text);
    if (user.role==='admin') return row;
    const actions = document.createElement('div');
    const choices = [['invite',user.role,user.activated?'Reimposta password':'Nuovo invito']];
    if (user.active) choices.push(['role',user.role==='editor'?'viewer':'editor',user.role==='editor'?'Imposta lettura':'Consenti modifica'],['disable',user.role,'Disattiva']);
    for (const [action,role,label] of choices) {
      const button = document.createElement('button');
      button.className='plain';
      button.textContent=label;
      button.onclick=()=>modifyUser({action,email:user.email,role},button);
      actions.append(button);
    }
    row.append(actions);
    return row;
  });
  $('account-list').replaceChildren(...rows);
}

async function modifyUser(data,button) {
  if (button.disabled) return;
  button.disabled=true;
  $('admin-message').textContent='';
  $('invite-output').hidden=true;
  try {
    const result = await jsonApi('/api/users',data);
    if (result.code) {
      const link=new URL(location.pathname,location.origin);
      link.hash='invito='+result.code;
      $('invite-link').value=link.href;
      $('invite-output').hidden=false;
      $('admin-message').textContent='Invito pronto da condividere con '+data.email+'.';
    } else $('admin-message').textContent='Utente aggiornato.';
    await loadUsers();
  } catch(error) { $('admin-message').textContent=error.message; }
  finally { button.disabled=false; }
}
$('manage-users').onclick=async()=>{
  $('user-admin').showModal();
  try { await loadUsers(); } catch(error) { $('admin-message').textContent=error.message; }
};
$('invite-form').onsubmit=event=>{
  event.preventDefault();
  modifyUser({action:'invite',...Object.fromEntries(new FormData(event.target))},event.submitter);
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
