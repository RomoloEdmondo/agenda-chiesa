import {createHash} from 'node:crypto';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
const api = process.env.API_BASE?.trim().replace(/\/$/,'') || '';
if (!api && process.env.CI) throw new Error('Imposta la variabile repository CLOUDFLARE_API_URL.');
if (api && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(api)) throw new Error('API_BASE deve essere un’origine HTTPS.');
mkdirSync('public',{recursive:true});
for (const file of ['style.css','login.js','session.js','event-types.js','logo-ruchheim.webp','simbolo-ruchheim.webp','trash.svg','toast.js','favicon.png','condivisione.jpg','agenda-pdf.js']) copyFileSync('app/'+file,'public/'+file);
const agenda = readFileSync('app/client.js','utf8');
const version = createHash('sha256').update(agenda).update(readFileSync('app/agenda-pdf.js')).update(readFileSync('app/style.css')).update(readFileSync('app/login.js')).update(readFileSync('app/session.js')).update(readFileSync('app/toast.js')).update(readFileSync('app/system-status.js')).update(readFileSync('app/churchtools-import.js')).update(readFileSync('app/dialog-scroll-lock.js')).digest('hex').slice(0,12);
writeFileSync('public/agenda.js',agenda.replace('./churchtools-import.js','./churchtools-import.js?v='+version).replace('./system-status.js','./system-status.js?v='+version).replace('./agenda-pdf.js','./agenda-pdf.js?v='+version).replace('./session.js','./session.js?v='+version));
writeFileSync('public/login.js',readFileSync('app/login.js','utf8').replace('./dialog-scroll-lock.js','./dialog-scroll-lock.js?v='+version).replace('./agenda.js','./agenda.js?v='+version).replace('./session.js','./session.js?v='+version));
writeFileSync('public/system-status.js',readFileSync('app/system-status.js','utf8').replace('./session.js','./session.js?v='+version));
writeFileSync('public/churchtools-import.js',readFileSync('app/churchtools-import.js','utf8').replace('./session.js','./session.js?v='+version));
copyFileSync('app/dialog-scroll-lock.js','public/dialog-scroll-lock.js');
writeFileSync('public/config.js','export const API_BASE = '+JSON.stringify(api)+';\n');

const csp = "default-src 'self'; script-src 'self'; img-src 'self' blob:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src "+(api || "'self'");
const html = readFileSync('app/index.html','utf8').replace('./login.js','./login.js?v='+version).replace('./style.css','./style.css?v='+version).replace('<meta charset="utf-8">','<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="'+csp+'">');
writeFileSync('public/index.html',html);


