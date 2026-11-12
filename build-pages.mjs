import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
const api = process.env.API_BASE?.trim().replace(/\/$/,'') || '';
if (!api && process.env.CI) throw new Error('Imposta la variabile repository CLOUDFLARE_API_URL.');
if (api && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(api)) throw new Error('API_BASE deve essere un’origine HTTPS.');
mkdirSync('public',{recursive:true});
for (const file of ['style.css','login.js','session.js','event-types.js']) copyFileSync('app/'+file,'public/'+file);
copyFileSync('app/client.js','public/agenda.js');
writeFileSync('public/config.js','export const API_BASE = '+JSON.stringify(api)+';\n');

const csp = "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src "+(api || "'self'");
const html = readFileSync('app/index.html','utf8').replace('<meta charset="utf-8">','<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="'+csp+'">');
writeFileSync('public/index.html',html);
