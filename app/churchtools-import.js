import {jsonApi,isAdmin} from './session.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=date=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
function details(event){
 return `<h3>${esc(event.title)}</h3><p class="ct-event-date">${esc(label(event.date))}${event.end?' – '+esc(label(event.end)):''}${event.time?' · '+esc([event.time,event.endTime ?? event.churchtools?.endTime].filter(Boolean).join(' – ')):''}</p><dl><dt>Conduzione</dt><dd>${esc(event.responsible||'Non indicata')}</dd><dt>Relatore</dt><dd>${esc(event.speaker||'Non indicato')}</dd><dt>Luogo</dt><dd>${esc(event.place||'Non indicato')}</dd></dl><details><summary>Descrizione</summary><p class="ct-description">${esc(event.description||'Nessuna descrizione')}</p></details>`;
}
const buttonIcons={preview:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18m-12 4h6m-6 3h4"/>',import:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',keep:'<path d="m5 12 4 4L19 6"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',retry:'<path d="M20 8a8 8 0 1 0 1 5M20 3v5h-5"/>',skip:'<path d="m5 5 9 7-9 7V5ZM19 5v14"/>'};
function actionButton(id,kind,label){$(id).innerHTML='<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+buttonIcons[kind]+'</svg><span>'+esc(label)+'</span>';}
export function initChurchTools({onSaved,onFinished,month}){
 const dialog=$('churchtools-dialog'),message=$('ct-message');
 for(const [id,kind] of [['ct-load','preview'],['ct-start','import'],['ct-keep','keep'],['ct-use','import'],['ct-stop','stop'],['ct-retry','retry'],['ct-skip','skip']]) actionButton(id,kind,$(id).textContent);
 let listing=[],queue=[],index=0,current=null,busy=false,running=false,stop=false,counts={};
 const status=text=>{message.textContent=text;};
 const progress=()=>`${index} di ${queue.length} esaminati · ${counts.created||0} importati · ${counts.updated||0} aggiornati · ${counts.kept||0} mantenuti`;
 const controls=()=>{
  $('ct-month').disabled=running||busy;$('ct-bilingual').disabled=running||busy;$('ct-load').disabled=running||busy;
  $('ct-start').disabled=running||busy||!listing.length;$('ct-close').disabled=running||busy;
  $('ct-stop').hidden=!running;$('ct-stop').disabled=stop;
 };
 function reset(){listing=[];$('ct-preview').replaceChildren();$('ct-review').hidden=true;$('ct-start').hidden=true;$('ct-select-all').hidden=true;controls();}
 async function finish(){running=false;busy=false;current=null;$('ct-review').hidden=true;status((stop?'Importazione interrotta. ':'Importazione terminata. ')+progress()+'.');reset();onFinished();}
 async function next(){
  if(stop||index>=queue.length){await finish();return;}
  busy=true;controls();$('ct-review').hidden=true;status('Lettura di Conduzione e Relatore… '+progress());
  const entry=queue[index];
  try{
   const query=new URLSearchParams({view:'item',calendar:entry.source.calendarId,appointment:entry.source.appointmentId,date:entry.core.date});
   current=await jsonApi('/api/churchtools?'+query);
   if(stop){await finish();return;}
   busy=false;
   const same=current.linkedId&&current.conflicts.find(e=>e.id===current.linkedId);
   if(same&&Object.entries(current.core).every(([k,v])=>same[k]===v)){counts.kept++;index++;await next();return;}
   if(!current.conflicts.length&&!current.warnings.length){await save('create');return;}
   $('ct-review').hidden=false;$('ct-retry').hidden=true;$('ct-keep').hidden=false;$('ct-use').hidden=false;$('ct-skip').hidden=true;$('ct-incoming').parentElement.hidden=false;
   $('ct-review-title').textContent=current.conflicts.length?'Appuntamenti nello stesso giorno':'Verifica i dati prima di importare';
   $('ct-review-info').textContent=current.conflicts.length?'Scegli se mantenere la tua agenda o usare i dati ChurchTools. Checklist, materiali, allegati e stato di preparazione dell’evento aggiornato vengono conservati.':'ChurchTools non contiene tutti i dati. Puoi importare comunque oppure saltare questo appuntamento.';
   $('ct-incoming').innerHTML=details(current.core);
   $('ct-warnings').textContent=current.warnings.join(' ');$('ct-warnings').hidden=!current.warnings.length;
   $('ct-existing').replaceChildren();
   for(const event of current.conflicts){
    const card=document.createElement('label');card.className='ct-existing-card';
    const disabled=current.linkedId&&event.id!==current.linkedId;
    card.innerHTML=`<span class="ct-choice"><input type="radio" name="ct-target" value="${esc(event.id)}" ${disabled?'disabled':''} ${event.id===current.linkedId||!current.linkedId&&event.id===current.conflicts[0].id?'checked':''}> ${disabled?'Altro appuntamento: verrà conservato':'Aggiorna questo appuntamento'}</span>${details(event)}`;
    $('ct-existing').append(card);
   }
   $('ct-local-column').hidden=!current.conflicts.length;
   actionButton('ct-keep','keep',current.conflicts.length>1?'Mantieni i miei appuntamenti':'Mantieni il mio evento');
   $('ct-skip').hidden=!!current.conflicts.length;
   actionButton('ct-use','import',current.conflicts.length?'Usa l’evento ChurchTools':'Importa comunque');
   status(`${index+1} di ${queue.length} · ${current.linkedId?'Già importato: confronto delle modifiche':current.conflicts.length+' appuntamenti presenti'}`);
   controls();$('ct-use').focus();
  }catch(error){busy=false;$('ct-review').hidden=false;$('ct-review-title').textContent='Appuntamento non importato';$('ct-review-info').textContent=entry.core.title+' · '+label(entry.core.date);$('ct-incoming').replaceChildren();$('ct-existing').replaceChildren();$('ct-local-column').hidden=true;$('ct-warnings').hidden=true;$('ct-use').hidden=true;$('ct-retry').hidden=false;$('ct-keep').hidden=false;$('ct-keep').hidden=true;$('ct-skip').hidden=false;$('ct-incoming').parentElement.hidden=true;status(error.message);controls();}
 }
 async function save(mode){
  if(!current||busy)return;busy=true;controls();$('ct-use').disabled=true;$('ct-keep').disabled=true;$('ct-skip').disabled=true;$('ct-retry').disabled=true;
  status('Salvataggio in agenda… '+progress());
  try{
   const target=dialog.querySelector('input[name="ct-target"]:checked')?.value;
   const result=await jsonApi('/api/churchtools',{ticket:current.ticket,mode,target});
   onSaved(result.event);counts[mode==='create'?'created':'updated']++;index++;busy=false;
   await next();
  }catch(error){busy=false;status(error.message+' Nessuna modifica applicata a questo appuntamento. Premi Ricarica confronto.');$('ct-review').hidden=false;$('ct-retry').hidden=false;$('ct-use').hidden=true;controls();}
  finally{$('ct-use').disabled=false;$('ct-keep').disabled=false;$('ct-skip').disabled=false;$('ct-retry').disabled=false;}
 }
 $('open-churchtools').onclick=async()=>{
  if(!isAdmin()||running)return;$('admin-menu').open=false;dialog.showModal();$('ct-month').value=month();stop=false;reset();status('Verifica collegamento ChurchTools…');
  try{const data=await jsonApi('/api/churchtools?view=status');$('ct-setup').open=!data.configured;status(data.configured?'Scegli il mese e carica l’anteprima. Nessun dato viene modificato durante l’anteprima.':'Per leggere anche Conduzione e Relatore, configura il Secret CHURCHTOOLS_API_TOKEN indicato sotto.');}catch(error){status(error.message);}
 };
 $('ct-load').onclick=async()=>{
  if(busy||running)return;reset();busy=true;controls();status('Caricamento appuntamenti italiani…');
  try{
   const data=await jsonApi('/api/churchtools?'+new URLSearchParams({view:'month',month:$('ct-month').value,bilingual:$('ct-bilingual').checked?'1':'0'}));listing=data.items;
   $('ct-preview').innerHTML=listing.map((item,i)=>`<label class="ct-preview-row"><input type="checkbox" data-ct-index="${i}" checked><span><strong>${esc(item.core.title)}</strong><small>${esc(label(item.core.date))}${item.core.time?' · '+esc([item.core.time,item.core.endTime].filter(Boolean).join(' – ')):''}</small></span><span class="ct-calendar-label">${item.source.calendarId===52?'Bilingue':'Italiano'}</span></label>`).join('');
   $('ct-start').hidden=!listing.length;$('ct-select-all').hidden=!listing.length;$('ct-all').checked=true;
   status(listing.length?`${listing.length} appuntamenti trovati. Seleziona quelli da importare. I conflitti saranno confrontati uno alla volta.`:'Nessun appuntamento trovato nel mese selezionato.');
  }catch(error){status(error.message);}finally{busy=false;controls();}
 };
 $('ct-all').onchange=()=>dialog.querySelectorAll('[data-ct-index]').forEach(c=>{c.checked=$('ct-all').checked;});
 for(const id of ['ct-month','ct-bilingual'])$(id).onchange=()=>{reset();status('Filtri modificati. Carica nuovamente l’anteprima.');};
 $('ct-start').onclick=async()=>{
  if(busy||running)return;queue=[...dialog.querySelectorAll('[data-ct-index]:checked')].map(c=>listing[Number(c.dataset.ctIndex)]);
  if(!queue.length){status('Seleziona almeno un appuntamento.');return;}
  counts={created:0,updated:0,kept:0};index=0;stop=false;running=true;$('ct-preview').replaceChildren();$('ct-start').hidden=true;$('ct-select-all').hidden=true;await next();
 };
 $('ct-keep').onclick=async()=>{if(busy||!running)return;counts.kept++;index++;await next();};
 $('ct-skip').onclick=$('ct-keep').onclick;
 $('ct-use').onclick=()=>save(current?.conflicts.length?'replace':'create');
 $('ct-retry').onclick=()=>{if(!busy&&running)next();};
 $('ct-stop').onclick=()=>{stop=true;controls();if(!busy)finish();else status('Interruzione dopo la richiesta in corso. Gli appuntamenti già salvati resteranno in agenda.');};
 $('ct-close').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(running||busy){event.preventDefault();status('Per terminare usa Interrompi. Gli appuntamenti già salvati resteranno in agenda.');}});
}

