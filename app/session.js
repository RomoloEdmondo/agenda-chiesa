import {API_BASE} from './config.js';

let token = sessionStorage.getItem('ruchheim.session');
let role;

export function setSession(value,user) {
  token = value;
  role = user?.role;
  if (value) sessionStorage.setItem('ruchheim.session',value);
  else sessionStorage.removeItem('ruchheim.session');
}
export const currentToken = () => token;
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
