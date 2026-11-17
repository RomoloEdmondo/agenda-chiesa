import {notice} from './toast.js';
import {currentToken,setSession,jsonApi} from './session.js';

const $ = id => document.getElementById(id);
const form = $('login-form');
const adminMenu = $('admin-menu');
document.addEventListener('click',event=>{
  if (!adminMenu.contains(event.target) || event.target.closest('.admin-menu-items button')) adminMenu.open = false;
});
adminMenu.addEventListener('keydown',event=>{
  if (event.key==='Escape' && adminMenu.open) {
    adminMenu.open = false;
    adminMenu.querySelector('summary').focus();
  }
});
const linkParams = new URLSearchParams(location.hash.slice(1));
const resetCode = linkParams.get('reset');
const code = resetCode || linkParams.get('invito');
let mode = code ? 'activate' : 'login';
if (code) history.replaceState(null,'',location.pathname+location.search);

const passkeyLogin = $('passkey-login');
const passkeyDialog = $('passkey-dialog');
const passkeyStatus = $('passkey-status');
const passkeysSupported = Boolean(window.PublicKeyCredential && navigator.credentials);

function credentialOptions(options,registration) {
  const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
  const list = values => values?.map(item=>({...item,id:decode(item.id)}));
  const publicKey = {...options,challenge:decode(options.challenge)};
  if (registration) {
    publicKey.user={...options.user,id:decode(options.user.id)};
    publicKey.excludeCredentials=list(options.excludeCredentials);
  } else {
    publicKey.allowCredentials=list(options.allowCredentials);
  }
  return publicKey;
}

function credentialJSON(credential,registration) {
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const {response} = credential;
  return {
    id:credential.id,rawId:encode(credential.rawId),type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment,
    clientExtensionResults:credential.getClientExtensionResults(),
    response:{
      clientDataJSON:encode(response.clientDataJSON),
      ...(registration ? {
        attestationObject:encode(response.attestationObject),transports:response.getTransports?.()
      } : {
        authenticatorData:encode(response.authenticatorData),signature:encode(response.signature),
        userHandle:response.userHandle ? encode(response.userHandle) : undefined
      })
    }
  };
}

async function exchangePasskey(registration,request) {
  const path = '/api/passkeys/'+(registration?'register':'login');
  const {id,options} = await jsonApi(path+'/options',request);
  const data = {publicKey:credentialOptions(options,registration)};
  const credential = await (registration ? navigator.credentials.create(data) : navigator.credentials.get(data));
  if (!credential) throw new Error('Operazione annullata.');
  return jsonApi(path+'/verify',{id,response:credentialJSON(credential,registration)});
}

const passkeyMessage = error => error.name==='NotAllowedError'
  ? 'Operazione annullata o passkey non disponibile su questo dispositivo.' : error.message;

passkeyLogin.onclick = async () => {
  passkeyLogin.disabled = $('login-submit').disabled = true;
  $('login-message').textContent = '';
  try {
    const {token,user,expires} = await exchangePasskey(false,{});
    setSession(token,user,expires);
    await openAgenda(user);
  } catch (error) { $('login-message').textContent = passkeyMessage(error); }
  finally { passkeyLogin.disabled = $('login-submit').disabled = passkeyLogin.disabled = false; }
};

async function showPasskeys() {
  const keys = await jsonApi('/api/passkeys');
  const list = $('passkey-list');
  list.replaceChildren();
  for (const {id,created,last_used} of keys) {
    const row = document.createElement('li');
    const when = seconds => new Date(seconds*1000).toLocaleDateString('it-IT');
    const label = document.createElement('span');
    label.textContent = 'Creata il '+when(created)+(last_used ? ' · Ultimo accesso '+when(last_used) : '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'plain';
    remove.textContent = 'Rimuovi';
    remove.onclick = async () => {
      if (!confirm('Rimuovere questa passkey dall’Agenda?')) return;
      remove.disabled = true;
      try {
        await jsonApi('/api/passkeys/revoke',{id});
        await showPasskeys();
        passkeyStatus.textContent = 'Passkey rimossa.';
      } catch (error) { passkeyStatus.textContent = error.message; }
      finally { remove.disabled = false; }
    };
    row.append(label,remove);
    list.append(row);
  }
}

$('manage-passkeys').onclick = async () => {
  $('passkey-list').replaceChildren();
  passkeyStatus.textContent = '';
  $('passkey-form').reset();
  passkeyDialog.showModal();
  try { await showPasskeys(); }
  catch (error) { passkeyStatus.textContent = error.message; }
};
$('passkey-form').onsubmit = async event => {
  event.preventDefault();
  const input = event.currentTarget.elements.password;
  const button = $('create-passkey');
  button.disabled = true;
  const password = input.value;
  input.value = '';
  passkeyStatus.textContent = '';
  try {
    await exchangePasskey(true,{password});
    await showPasskeys();
    passkeyStatus.textContent = 'Passkey attivata.';
  } catch (error) { passkeyStatus.textContent = passkeyMessage(error); }
  finally { button.disabled = false; }
};

function renderLogin() {
  passkeyLogin.hidden = mode!=='login' || !passkeysSupported;
  $('login-title').textContent = {login:'Accedi all’agenda',setup:'Configura amministratore',activate:resetCode?'Reimposta password':'Attiva il tuo account'}[mode];
  $('login-submit').textContent = mode==='login' ? 'Accedi' : 'Imposta password';
  $('login-email').hidden = mode==='activate';
  form.elements.email.required = mode!=='activate';
  $('confirm-password').hidden = mode!=='activate';
  form.elements.confirmation.disabled = mode!=='activate';
  form.elements.confirmation.required = mode==='activate';
  $('setup-code').hidden = mode!=='setup';
  form.elements.code.required = mode==='setup';
  form.elements.password.autocomplete = mode==='login' ? 'current-password' : 'new-password';
  form.elements.password.minLength = mode==='login' ? 0 : 12;
}

async function openAgenda(user) {
  $('login-shell').hidden = true;
  $('protected-app').hidden = false;
  $('admin-menu').hidden = user.role!=='admin';
  $('manage-passkeys').hidden = !passkeysSupported;
  await import('./agenda.js');
}

form.onsubmit = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (mode==='activate' && data.password!==data.confirmation) {
    $('login-message').textContent = 'Le password non coincidono.';
    form.elements.confirmation.focus();
    return;
  }
  delete data.confirmation;
  $('login-submit').disabled = passkeyLogin.disabled = true;
  $('login-message').textContent = '';
  try {
    if (mode==='login') {
      const result = await jsonApi('/api/login',data);
      setSession(result.token,result.user,result.expires);
      form.reset();
      await openAgenda(result.user);
    } else {
      if (mode==='activate') data.code = code;
      await jsonApi('/api/'+mode,data);
      form.reset();
      mode = 'login';
      $('setup-toggle').hidden = true;
      renderLogin();
      $('login-message').textContent = resetCode ? 'Password aggiornata. Accedi con la nuova password.' : 'Account confermato. Accedi con la tua email e password.';
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
  catch (error) { if (error.status!==401) { notice(error.message); return; } }
  setSession(null);
  location.reload();
};

const labels = {admin:'Amministratore',editor:'Modifica',viewer:'Lettura'};
let users = [];
let selectedEmail;
let pendingInvite;
let adminBusy = false;

const statusOf = user => {
  if (!user.active) return 'Disattivato';
  if (user.activated) return user.invite_expires > Date.now()/1000 ? 'Confermato · Reset in attesa' : 'Confermato';
  return user.invite_expires <= Date.now()/1000 ? 'Invito scaduto' : 'Invito in attesa';
};

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
  pendingInvite = undefined;
  $('invite-link').value = '';
  $('admin-message').textContent = '';
}

function openUserPanel() {
  $('users-overview').hidden = true;
  $('user-panel').hidden = false;
  $('invite-output').hidden = true;
  pendingInvite = undefined;
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
    choices.push([user.active && user.activated?'reset':'invite',user.role,!user.active?'Invia invito di riattivazione':user.activated?'Invia link di reimpostazione':'Invia un nuovo invito']);
    if (user.active) choices.push(['disable',user.role,'Disattiva accesso']);
    for (const [action,role,label] of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action==='disable' ? 'plain user-danger' : 'plain';
      button.textContent = label;
      button.onclick = () => {
        const confirmation = action==='disable' ? 'Disattivare l’accesso di '+email+'?'
          : action==='reset' ? 'Inviare a '+email+' un link per scegliere una nuova password?' : '';
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
  let send = false;
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
      link.hash=(result.reset?'reset':'invito')+'='+result.code;
      $('invite-link').value=link.href;
      pendingInvite = {action:'invite',to:data.email,code:result.code,id:crypto.randomUUID(),reset:result.reset};
      $('send-invite').disabled=false;
      $('invite-output').hidden=false;
      $('send-invite').textContent = result.reset ? 'Invia link di reimpostazione' : 'Invia invito via email';
      send = true;
    } else $('admin-message').textContent='Utente aggiornato.';
  } catch(error) { $('admin-message').textContent=error.message; }
  finally {
    adminBusy=false;
    button.disabled=false;
    $('user-back').disabled=false;
    if (selectedEmail) $('user-back').focus();
  }
  if (send) await sendInvite();
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
  if ($('admin-menu').hidden) return;
  $('admin-menu').open = false;
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
async function sendInvite() {
  if (adminBusy || !pendingInvite || $('send-invite').disabled) return;
  adminBusy = $('send-invite').disabled = true;
  let sent = false;
  $('user-back').disabled = true;
  $('admin-message').textContent = 'Invio email in corso…';
  try {
    const result = await jsonApi('/api/mail',pendingInvite);
    sent = result.status==='sent';
    $('admin-message').textContent = sent ? (pendingInvite.reset?'Link di reimpostazione inviato.':'Invito inviato.')
      : result.status==='failed' ? 'Invio rifiutato da Google. Puoi ancora copiare il link.'
      : 'Esito non confermato. Controlla la posta inviata prima di riprovare.';
    if (result.status==='failed') pendingInvite.id = crypto.randomUUID();
  } catch (error) {
    $('admin-message').textContent = error.message;
  } finally {
    adminBusy = false;
    $('send-invite').disabled = sent;
    $('user-back').disabled = false;
  }
}
$('send-invite').onclick = sendInvite;

$('copy-invite').onclick=async()=>{
  try { await navigator.clipboard.writeText($('invite-link').value); $('admin-message').textContent='Link copiato.'; }
  catch { $('invite-link').select(); }
};

renderLogin();
if (currentToken() && mode==='login') {
  try {
    const user = await jsonApi('/api/me');
    setSession(currentToken(),user,user.expires);
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
