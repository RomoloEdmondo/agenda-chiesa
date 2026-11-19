import {isAdmin,jsonApi} from './session.js';
import {API_BASE} from './config.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number.isFinite(value)?new Intl.NumberFormat('it-IT').format(value):'Non disponibile';
const bytes=value=>Number.isFinite(value)?(value<1024?value+' B':new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(value/1024/1024)+' MB'):'Non disponibile';
const timestamp=value=>value?new Date(typeof value==='number'?value*1000:value).toLocaleString('it-IT'):'Non disponibile';
function facts(entries) {return '<dl class="system-facts">'+entries.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value ?? 'Non disponibile')+'</dd></div>').join('')+'</dl>';}
export function initSystemStatus() {
  const dialog=document.getElementById('system-dialog');
  const refresh=document.getElementById('system-refresh');
  const message=document.getElementById('system-message');
  const content=document.getElementById('system-content');
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
      content.innerHTML=
        '<div class="system-health"><span class="system-state" data-state="'+(data.status==='ok'?'ok':'warning')+'">'+(data.status==='ok'?'Servizi operativi':'Verifica parziale')+'</span><small>Aggiornato '+escape(timestamp(data.checkedAt))+' · risposta API '+latency+' ms</small></div>'+
        '<div class="system-metrics">'+
        card('Database D1',bytes(db.sizeBytes),'Dimensione totale, inclusi allegati e indici')+
        card('Allegati',bytes(files?.bytes),number(files?.total)+' file · limite app '+bytes(data.attachments.limitBytes))+
        card('Eventi',number(m.events?.total),number(m.series?.total)+' serie ricorrenti')+
        card('Accessi',number(m.users?.active)+' utenti attivi',number(m.sessions?.active)+' sessioni valide')+'</div>'+
        (usage!==null?'<div class="system-storage"><label for="system-storage-meter">Spazio allegati: '+usage.toFixed(1)+'% del limite app</label><meter id="system-storage-meter" min="0" max="100" low="70" high="90" optimum="0" value="'+usage+'">'+usage.toFixed(1)+'%</meter><small>Per file: '+bytes(data.attachments.perFileBytes)+' · per evento: '+bytes(data.attachments.perEventBytes)+' e '+data.attachments.maxPerEvent+' file</small></div>':'')+
        '<section class="system-section"><h3>Database</h3>'+facts([
          ['Connessione',db.status==='ok'?'Disponibile':'Non disponibile'],['Nome',db.name],['ID database',db.id],
          ['Regione / nodo',db.region],['Query di controllo',db.queryMs==null?null:db.queryMs+' ms'],
          ['Migrazioni applicate',number(m.migrations?.total)],['Ultima migrazione',m.migrations?.latest?.name],
          ['Data migrazione',m.migrations?.latest?.applied_at],['Registro attività',number(m.activity?.total)+' voci'],
          ['Ultima attività',timestamp(m.activity?.latest)]])+'</section>'+
        '<section class="system-section"><h3>Backend e configurazione</h3>'+facts([
          ['Servizio',data.backend.provider],['Worker',data.backend.name],['URL API',API_BASE],
          ['Origine frontend',data.backend.frontendOrigin],['Versione backend',data.backend.version],['Versione creata',timestamp(data.backend.versionTimestamp)],
          ['Cron configurato',data.backend.cron],['Sicurezza password',data.configuration.passwordSecurity?'Configurata':'Da configurare'],
          ['Invio email',data.configuration.email?'Configurato':'Da configurare']])+'</section>'+
        '<section class="system-section"><h3>Email e promemoria</h3>'+facts([
          ['In attesa',number(m.mail?.pending)],['In invio',number(m.mail?.sending)],
          ['Fallite / esito incerto',number(m.mail?.failed)],['In ritardo oltre 15 minuti',number(m.mail?.overdue)],
          ['Ultimo invio riuscito',timestamp(m.mail?.lastSent)]])+'</section>'+
        (data.issues.length?'<p class="system-issue" role="status">Dati non disponibili: '+escape(data.issues.join(', '))+'.</p>':'')+
        '<section class="system-section"><h3>Manutenzione</h3><div class="system-links">'+
        '<a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">Cloudflare ↗</a>'+
        '<a href="https://www.cloudflarestatus.com/" target="_blank" rel="noopener noreferrer">Stato Cloudflare ↗</a>'+
        '<a href="https://github.com/RomoloEdmondo/agenda-chiesa/actions" target="_blank" rel="noopener noreferrer">Rilasci frontend ↗</a>'+
        '<a href="https://github.com/RomoloEdmondo/agenda-chiesa-backend" target="_blank" rel="noopener noreferrer">Codice backend ↗</a></div>'+
        '<p class="muted">Traffico, consumi giornalieri, limiti del piano, log del Worker e backup si consultano nel pannello Cloudflare. Questa schermata mostra una verifica puntuale, senza modificare i dati.</p></section>';
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
  refresh.onclick=load;
}
