import {isAdmin,jsonApi} from './session.js';
import {API_BASE} from './config.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number.isFinite(value)?new Intl.NumberFormat('it-IT').format(value):'Non disponibile';
const bytes=value=>Number.isFinite(value)?(value<1024?value+' B':new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(value/1024/1024)+' MB'):'Non disponibile';
const timestamp=value=>value?new Date(typeof value==='number'?value*1000:value).toLocaleString('it-IT'):'Non disponibile';
function facts(entries) {return '<dl class="system-facts">'+entries.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value ?? 'Non disponibile')+'</dd></div>').join('')+'</dl>';}

const panelIcons={"database":"<ellipse cx=\"12\" cy=\"5\" rx=\"8\" ry=\"3\"/><path d=\"M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0\"/>","backend":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"18\" height=\"7\" rx=\"2\"/><path d=\"M7 6.5h.01M7 17.5h.01M11 6.5h6m-6 11h6\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>","tools":"<path d=\"m14 7 3 3M5 21l-2-2L14 8a6 6 0 0 1 7-7l-4 4 2 2 4-4a6 6 0 0 1-7 7Z\"/>"};
panelIcons.churchtools='<path d="M12 3 4 8v13h16V8L12 3ZM12 7v6m-3-3h6M9 21v-5h6v5"/>';
function panel(kind,title,subtitle,body,id='') {
  return '<section class="system-detail-panel system-panel-'+kind+'"'+(id?' id="'+id+'"':'')+'>'+
    '<header class="system-panel-heading"><span class="system-panel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+panelIcons[kind]+'</svg></span><div><h3>'+escape(title)+'</h3><p>'+escape(subtitle)+'</p></div></header>'+body+'</section>';
}

export function initSystemStatus() {
  const dialog=document.getElementById('system-dialog');
  const refresh=document.getElementById('system-refresh');
  const message=document.getElementById('system-message');
  const content=document.getElementById('system-content');
  const mailActions=document.getElementById('system-mail-actions');
  async function load() {
    if(!isAdmin() || refresh.disabled) return;
    refresh.disabled=true;
    message.textContent='Verifica dei servizi in corso…';
    const started=performance.now();
    try {
      const data=await jsonApi('/api/system');
      const latency=Math.round(performance.now()-started);
      const m=data.metrics,db=data.database,files=m.attachments;
      const usage=files?Math.min(100,files.bytes/data.attachments.limitBytes*100):null;
      const card=(label,value,note)=>'<article class="system-metric"><h3>'+escape(label)+'</h3><strong>'+escape(value)+'</strong><small>'+escape(note)+'</small></article>';
      const expanded=[...content.querySelectorAll('.system-technical[open]')].map(el=>el.querySelector('summary').textContent);
      dialog.querySelector('.account-content').append(mailActions);
      content.innerHTML=
        '<div class="system-health"><span class="system-state" data-state="'+(data.status==='ok'?'ok':'warning')+'">'+(data.status==='ok'?'Servizi operativi':'Verifica parziale')+'</span><small>Aggiornato '+escape(timestamp(data.checkedAt))+' · risposta API '+latency+' ms</small></div>'+
        '<div class="system-metrics">'+
        card('Database D1',bytes(db.sizeBytes),'Dimensione totale, inclusi allegati e indici')+
        card('Allegati',bytes(files?.bytes),number(files?.total)+' file · limite app '+bytes(data.attachments.limitBytes))+
        card('Eventi',number(m.events?.total),number(m.series?.total)+' serie ricorrenti')+
        card('Accessi',number(m.users?.active)+' utenti attivi',number(m.sessions?.active)+' sessioni valide')+'</div>'+
        (usage!==null?'<div class="system-storage"><label for="system-storage-meter">Spazio allegati: '+usage.toFixed(1)+'% del limite app</label><meter id="system-storage-meter" min="0" max="100" low="70" high="90" optimum="0" value="'+usage+'">'+usage.toFixed(1)+'%</meter><small>Per file: '+bytes(data.attachments.perFileBytes)+' · per evento: '+bytes(data.attachments.perEventBytes)+' e '+data.attachments.maxPerEvent+' file</small></div>':'')+
        '<div class="system-detail-grid">'+
        panel('database','Database','Archiviazione e struttura dei dati',facts([
          ['Connessione',db.status==='ok'?'Disponibile':'Non disponibile'],['Nome',db.name],
          ['Regione / nodo',db.region],['Query di controllo',db.queryMs==null?null:db.queryMs+' ms'],
          ['Migrazioni',number(m.migrations?.total)+' applicate'],['Registro attività',number(m.activity?.total)+' voci'],
          ['Ultima attività',timestamp(m.activity?.latest)]])+
          '<details class="system-technical"><summary>Identificativi e migrazioni</summary>'+facts([
            ['ID database',db.id],['Ultima migrazione',m.migrations?.latest?.name],['Applicata il',m.migrations?.latest?.applied_at]])+'</details>')+
        panel('backend','Backend','Servizio, accessi e configurazione',facts([
          ['Piattaforma',data.backend.provider],['Worker',data.backend.name],
          ['Sicurezza password',data.configuration.passwordSecurity?'Configurata':'Da configurare'],
          ['Invio email',data.configuration.email?'Configurato':'Da configurare'],
          ['Cron configurato',data.backend.cron],['Versione creata',timestamp(data.backend.versionTimestamp)]])+
          '<details class="system-technical"><summary>Endpoint e versione</summary>'+facts([
            ['URL API',API_BASE],['Origine frontend',data.backend.frontendOrigin],['Versione backend',data.backend.version]])+'</details>')+
        panel('churchtools','ChurchTools','Collegamento con i calendari e i servizi della comunità',facts([
          ['Login Token',data.churchtools?.configured?'Configurato':'Da configurare'],
          ['Modalità',data.churchtools?.mode || 'Importazione manuale'],
          ['Eventi importati presenti',number(data.churchtools?.importedEvents)],
          ['Ultima importazione',timestamp(data.churchtools?.lastImport)],
          ['Calendari italiani','43 · 46 · 49'],['Bilingue','52 · opzionale'],
          ['Conduzione','Servizio 3'],['Relatore','Servizio 1']])+
          '<div class="system-ct-actions"><button type="button" class="system-ct-button" id="system-ct-check"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m3 12 5 5L21 4M3 5h6M3 21h18"/></svg>Verifica collegamento</button><button type="button" class="system-ct-button" id="system-ct-import"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>Apri importazione</button></div>'+
          '<div id="system-ct-health" class="system-ct-health" role="status" aria-live="polite">Il controllo verifica accesso a calendari, eventi e servizi senza modificare dati.</div>'+
          '<details class="system-technical"><summary>API e strumenti ChurchTools</summary>'+facts([
            ['Origine','https://cg-ruchheim.church.tools'],['API base','https://cg-ruchheim.church.tools/api'],
            ['Appuntamenti','GET /api/calendars/appointments'],['Dettaglio e assegnazioni','GET /api/events/{eventId}'],
            ['Calendari','GET /api/calendars'],['Servizi','GET /api/services'],
            ['Secret nel Worker','CHURCHTOOLS_API_TOKEN']])+
          '<div class="system-links"><a href="https://cg-ruchheim.church.tools/" target="_blank" rel="noopener noreferrer">Apri ChurchTools ↗</a><a href="https://cg-ruchheim.church.tools/api" target="_blank" rel="noopener noreferrer">Documentazione API ↗</a></div></details>')+
        panel('mail','Email e promemoria','Coda invii, esiti e consultazione dello storico',
          '<div class="system-mail-counters">'+[
            ['In attesa',m.mail?.pending,'neutral'],['In invio',m.mail?.sending,'blue'],
            ['Fallite / incerte',m.mail?.failed,m.mail?.failed>0?'red':'neutral'],
            ['In ritardo',m.mail?.overdue,m.mail?.overdue>0?'amber':'neutral']
          ].map(([label,value,tone])=>'<div data-tone="'+tone+'"><span>'+escape(label)+'</span><strong>'+number(value)+'</strong></div>').join('')+'</div>'+
          '<p class="system-mail-last">Ultimo invio riuscito <strong>'+escape(timestamp(m.mail?.lastSent))+'</strong></p>'+
          '<p class="system-mail-hint">Il ritardo indica invii in attesa da oltre 15 minuti. Lo storico include filtri per data, stato e utente.</p>',
          'system-mail-panel')+
        panel('tools','Manutenzione','Pannelli e strumenti esterni',
          '<div class="system-links">'+
          '<a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare ↗</a>'+
          '<a href="https://www.cloudflarestatus.com/" target="_blank" rel="noopener noreferrer">Stato Cloudflare ↗</a>'+
          '<a href="https://github.com/RomoloEdmondo/agenda-chiesa/actions" target="_blank" rel="noopener noreferrer">Rilasci frontend ↗</a>'+
          '<a href="https://github.com/RomoloEdmondo/agenda-chiesa-backend" target="_blank" rel="noopener noreferrer">Codice backend ↗</a></div>'+
          '<p class="system-mail-hint">Traffico, consumi, limiti del piano, log del Worker e backup sono disponibili nel pannello Cloudflare.</p>')+
        '</div>'+
        (data.issues.length?'<p class="system-issue" role="status">Dati non disponibili: '+escape(data.issues.join(', '))+'.</p>':'');
      document.getElementById('system-ct-import').onclick=()=>{dialog.close();document.getElementById('open-churchtools').click();};
      document.getElementById('system-ct-check').onclick=async event=>{
        const button=event.currentTarget,output=document.getElementById('system-ct-health');
        button.disabled=true;output.textContent='Verifica connessione e permessi…';
        try{
          const result=await jsonApi('/api/churchtools?view=health');
          output.innerHTML='<p><strong>'+escape(result.status==='ok'?'Collegamento operativo':'Verifica parziale')+'</strong> · '+escape(timestamp(result.checkedAt))+' · '+number(result.durationMs)+' ms</p>'+result.checks.map(check=>'<p class="system-ct-check" data-ok="'+check.ok+'"><span>'+escape(check.label)+'</span><strong>'+escape(check.ok?'Accessibile · '+check.durationMs+' ms':check.issue)+'</strong></p>').join('');
        }catch(error){output.textContent=error.message;}finally{button.disabled=false;}
      };
      document.getElementById('system-mail-panel').append(mailActions);
      content.querySelectorAll('.system-technical').forEach(el=>{el.open=expanded.includes(el.querySelector('summary').textContent);});
      message.textContent='';
    } catch(error) {
      message.textContent=(content.childElementCount?'Dati precedenti: aggiornamento non riuscito. ':'')+
        (error.status===404?'Il backend è in aggiornamento. Riprova tra poco.':error.message);
    } finally {refresh.disabled=false;}
  }
  document.getElementById('open-system').onclick=()=>{
    if(!isAdmin()) return;
    document.getElementById('admin-menu').open=false;
    dialog.showModal();
    load();
  };
  document.getElementById('mail-back-system').onclick=()=>{
    if(!isAdmin()) return;
    document.getElementById('mail-history-dialog').close();
    dialog.showModal();
    document.getElementById('open-mail-history').focus();
  };
  refresh.onclick=load;
}

