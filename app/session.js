import {API_BASE} from './config.js';

const storageKey = 'ruchheim.session';
let token;
let expires;
let role;
let expiryTimer;

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (stored?.expires > Date.now()/1000) {
    token = stored.token;
    expires = stored.expires;
  } else {
    localStorage.removeItem(storageKey);
  }
} catch {}
token ||= sessionStorage.getItem(storageKey);

function checkExpiry() {
  if (token && expires && expires<=Date.now()/1000) {
    setSession(null);
    location.reload();
  }
}

export function setSession(value,user,until) {
  token = value;
  role = user?.role;
  expires = until;
  clearTimeout(expiryTimer);
  try {
    if (value && until) {
      localStorage.setItem(storageKey,JSON.stringify({token:value,expires:until}));
      sessionStorage.removeItem(storageKey);
    } else if (!value) {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    if (value) sessionStorage.setItem(storageKey,value);
  }
  if (value && until) expiryTimer = setTimeout(checkExpiry,Math.max(0,until*1000-Date.now()));
}

document.addEventListener('visibilitychange',()=>{
  if (!document.hidden) checkExpiry();
});
window.addEventListener('storage',event=>{
  if (event.key!==storageKey || event.newValue===event.oldValue) return;
  sessionStorage.removeItem(storageKey);
  location.reload();
});

export const currentToken = () => token;
export const isAdmin = () => role==='admin';
export const mayEdit = () => ['admin','editor'].includes(role);

export async function apiFetch(path,options={}) {
  if (!API_BASE) throw new Error('Configura l’indirizzo dell’API Cloudflare.');
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization','Bearer '+token);
  return fetch(API_BASE+path,{...options,headers,credentials:'omit'});
}

export async function jsonApi(path,data) {
  const response = await apiFetch(path,data===undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Richiesta non riuscita.');
    error.status = response.status;
    throw error;
  }
  return result;
}
