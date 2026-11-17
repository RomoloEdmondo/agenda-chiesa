import {agendaPdf,pdfLogoReady} from './agenda-pdf.js';
import {notice} from './toast.js';
import {apiFetch, isAdmin, jsonApi, mayEdit} from './session.js';
import {types, statuses} from './event-types.js';
const $ = id => document.getElementById(id);

const agendaNav = document.querySelector('.agenda-nav');
const headerActions = document.querySelector('.top-inner .account-actions');
const mobileNavigation = window.matchMedia('(max-width: 760px), (max-width: 1100px) and (hover: none) and (pointer: coarse)');

const newEventButton = $('new-event');
const calendarHeader = document.querySelector('.calendar .panel-head');
const monthHeading = document.querySelector('.month-heading');

function placeAgendaNavigation() {
  if (mobileNavigation.matches) {
    $('protected-app').append(agendaNav);
    calendarHeader.append(newEventButton);
  } else {
    headerActions.before(agendaNav);
    monthHeading.append(newEventButton);
  }
}

placeAgendaNavigation();
mobileNavigation.addEventListener('change', placeAgendaNavigation);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const format = (date,options) => new Intl.DateTimeFormat('it-IT',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format();
const nowMonth = today.slice(0,7);
const nextMonthDate = new Date(nowMonth+'-01T12:00:00Z');
nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
const nextMonth = nextMonthDate.toISOString().slice(0,7);
const pageSize = 25;
let listPage = 1;
const isYear = value => /^(?!0000)\d{4}$/.test(value);
const closed = event => ['Concluso','Annullato'].includes(event.status);
const speakers = event => event.speaker.split(',').map(name=>name.trim()).filter(Boolean);
let events = [];
let month = nowMonth;
let showAll = false;
let view = 'agenda';
let active;
let canSave = false;
let isNewEvent = false;

const option = (value,label=value,selected=false) => '<option value="'+escape(value)+'"'+(selected?' selected':'')+'>'+escape(label)+'</option>';
const dateLabel = event => event.date
  ? format(event.date,{day:'numeric',month:'short',year:'numeric'}) +
    (event.end && event.end !== event.date ? ' – '+format(event.end,{day:'numeric',month:'short',year:'numeric'}) : '')
  : 'Data da confermare';
const sorted = list => [...list].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999') ||
  a.time.localeCompare(b.time) || a.title.localeCompare(b.title,'it'));
const empty = message => '<p class="empty">'+escape(message)+'</p>';
const eventButton = (event, label, className='plain') => '<button type="button" class="'+className+'" data-color="'+typeColor(event.type)+'" data-event="'+escape(event.id)+'">'+escape(label)+'</button>';

function matches(event) {
  const type = $('type-filter').value;
  const period = $('period-filter').value;
  const from = $('from').value;
  const to = $('to').value;
  const end = event.end || event.date;
  if (type && event.type !== type) return false;
  if (period === 'undated') return !event.date;
  if (!period) return true;
  if (!event.date) return false;
  if (period === 'future') return end >= today;
  if (period === 'current-month' || period === 'next-month') {
    const selectedMonth = period === 'current-month' ? nowMonth : nextMonth;
    return event.date.slice(0,7) <= selectedMonth && end.slice(0,7) >= selectedMonth;
  }
  if (period === 'past') return end < today;
  if (period === 'custom') return (!from || end >= from) && (!to || event.date <= to) && (!from || !to || from <= to);
  return end >= period+'-01-01' && event.date <= period+'-12-31';
}

function row(event, team=false) {
  const day = event.date ? Number(event.date.slice(8)) : '–';
  const label = event.date ? format(event.date,{month:'short'}) : 'Data';
  const notes = [team ? dateLabel(event) : "",event.time,team ? event.place : "",event.speaker].filter(Boolean).join(' · ');
  const extra = team
    ? '<small>'+escape([event.responsible,event.status].filter(Boolean).join(' · '))+'</small>'
    : (event.responsible ? '<small>Conduzione: '+escape(event.responsible)+'</small>' : '');
  return '<button type="button" class="event-row" data-event="'+escape(event.id)+'"><span class="date-tile" aria-hidden="true"><strong>'+day+'</strong>'+escape(label)+'</span>'+
    '<span class="row-copy"><span class="row-type" data-color="'+typeColor(event.type)+'">'+escape(event.type)+'</span><strong>'+escape(event.title)+'</strong>'+(notes?'<small>'+escape(notes)+'</small>':'')+extra+'</span><span aria-hidden="true">›</span></button>';
}

function renderCalendar(list) {
  const first = new Date(month+'-01T12:00:00Z');
  const blanks = (first.getUTCDay()+6)%7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth()+1,0);
  const count = last.getUTCDate();
  const monthEvents = list.filter(e=>e.date && e.date <= month+'-'+count && (e.end||e.date) >= month+'-01');
  $('month-title').textContent = format(month+'-01',{month:'long',year:'numeric'});
  $('calendar-year').value = Number(month.slice(0,4));
  $('calendar-month').value = month.slice(5);
  $('prev').disabled = month === '0001-01';
  $('next').disabled = month === '9999-12';
  const length = Math.ceil((count+blanks)/7)*7;
  $('days').innerHTML = Array.from({length},(_,index)=>{
    const day = index-blanks+1;
    if (day<1 || day>count) return '<div class="day outside" aria-hidden="true"></div>';
    const date = month+'-'+String(day).padStart(2,'0');
    const chips = monthEvents.filter(e=>e.date<=date && (e.end||e.date)>=date).map(e=>
      '<button type="button" class="chip" data-color="'+typeColor(e.type)+'" data-event="'+escape(e.id)+'" title="'+escape(e.title)+'" aria-label="'+
      escape(e.title+' · '+format(date,{day:'numeric',month:'long'}))+'">'+escape(e.title)+'</button>').join('');
    const add = canSave ? '<button type="button" class="day-add" data-new-date="'+date+
      '" aria-label="'+escape('Nuovo evento, '+format(date,{day:'numeric',month:'long',year:'numeric'}))+'"></button>' : '';
    return '<div class="day'+(date===today?' today':'')+'">'+add+'<span class="day-number"'+(date===today?' aria-current="date"':'')+'>'+day+'</span>'+chips+'</div>';
  }).join('');
  $('month-events').innerHTML = monthEvents.length ? monthEvents.map(e=>eventButton(e,Number(e.date.slice(8))+' '+format(e.date,{month:'short'})+' · '+e.title)).join('') : '<span>Nessun appuntamento nel mese selezionato.</span>';
  const upcoming = list.filter(e=>e.date && (e.end||e.date)>=today && !closed(e));
  const pending = list.filter(e=>!e.date && !closed(e));
  $('upcoming').innerHTML = (upcoming.slice(0,showAll?upcoming.length:5).map(e=>row(e)).join('') || empty('Nessun prossimo appuntamento con questi filtri.')) + pending.map(e=>row(e)).join('');
  $('more').hidden = upcoming.length<=5;
  $('more').textContent = showAll?'Mostra meno ↑':'Mostra tutti gli appuntamenti →';
}

function listPagination(total) {
  const pages = Math.ceil(total/pageSize);
  if (pages < 2) return '';
  return '<nav class="list-pagination" aria-label="Paginazione appuntamenti">'+
    '<button type="button" class="plain" data-list-page="'+(listPage-1)+'"'+(listPage===1?' disabled':'')+'>‹ Indietro</button>'+
    '<span role="status">Pagina '+listPage+' di '+pages+'</span>'+
    '<button type="button" class="plain" data-list-page="'+(listPage+1)+'"'+(listPage===pages?' disabled':'')+'>Avanti ›</button></nav>';
}

function renderPrep(list) {
  const cards = list.map(event=>({
    event,tasks:closed(event)?[]:event.tasks.filter(task=>!task.done)
  }));
  const total = cards.reduce((sum,item)=>sum+item.tasks.length,0);
  const tracked = cards.filter(({event,tasks})=>!closed(event) && (tasks.length || event.status!=='Pronto')).length;
  $('prep').innerHTML = '<div class="panel-head"><div><h2>Attività da preparare</h2><p class="muted">'+total+' attività aperte · '+tracked+' appuntamenti da seguire</p></div></div>'+
    (cards.length ? '<div class="prep-list">'+cards.slice((listPage-1)*pageSize,listPage*pageSize).map(({event,tasks})=>'<article class="prep-card" data-status="'+escape(event.status)+'">'+
      (event.status==='Annullato'?'<span class="prep-cancelled" aria-hidden="true">×</span>':'')+eventButton(event,event.title)+
      '<p class="muted">'+escape(dateLabel(event)+' · '+event.status+(event.responsible?' · '+event.responsible:''))+'</p>'+
      (tasks.length?'<ul>'+tasks.map(task=>'<li>'+escape(task.label)+'</li>').join('')+'</ul>':'')+'</article>').join('')+'</div>' : empty('Nessun appuntamento con questi filtri.'))+listPagination(list.length);
}

async function copyAgendaLink(url) {
  try { await navigator.clipboard.writeText(url); notice('Link copiato. Si apre per chi ha accesso all’agenda.'); }
  catch { window.prompt('Copia il link dell’agenda',url); }
}

function pdfEvent(event) {
  return {title:event.title,fields:[
    ['Tipo evento',event.type],['Data',dateLabel(event)],['Orario',event.time],
    ['Luogo',event.place || churchPlace],['Stato preparazione',event.status],
    ['Guida/Conduzione',event.responsible],['Relatore',event.speaker],
    ['Descrizione',event.description],['Materiali e link',event.materials],
    ['Checklist',event.tasks.map(task=>(task.done?'[Completata] ':'[Da fare] ')+task.label).join('\n')]
  ]};
}

function makeAgendaFile(title,fileName,events,single) {
  return new File([agendaPdf(title,events.map(pdfEvent),{single})],fileName,{type:'application/pdf'});
}

async function sharePdf(title,fileName,events,{preview=false,single=false}={}) {
  let file;
  try {
    const ready = pdfLogoReady();
    if (ready) await ready;
    file = makeAgendaFile(title,fileName,events,single);
  } catch {
    notice('Impossibile preparare il PDF. Riprova tra poco.','error');
    return;
  }
  if (!preview && navigator.canShare?.({files:[file]}) && typeof navigator.share==='function') {
    try { await navigator.share({files:[file],title}); return; }
    catch (error) { if (error.name==='AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href=url;
  if (preview) { link.target='_blank'; link.rel='noopener'; }
  else link.download=file.name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

function renderTeam(list) {
  $('team').innerHTML = '<div class="panel-head"><div><h2>Appuntamenti in programma</h2><p class="muted">'+list.length+' appuntamenti · Christliche Gemeinde Ruchheim</p></div>'+
    '<div class="team-actions"><details class="team-sharing"><summary class="primary action-with-icon"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>Condividi <span aria-hidden="true">⌄</span></summary><div class="team-sharing-options"><button type="button" class="plain" id="share-team"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Zm0 0v7h7M8 14h8m-8 3h5"/></svg>Condividi PDF</button><button type="button" class="plain" id="copy-link"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2m2 6a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2"/></svg>Copia link</button><button type="button" class="plain" id="print"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-3"/><path d="M7 14h10v7H7z"/></svg>Stampa / PDF</button></div></details></div></div>'+
    (list.slice((listPage-1)*pageSize,listPage*pageSize).map(event=>row(event,true)).join('') || empty('Nessun appuntamento con questi filtri.'))+listPagination(list.length);
  const sharing = $('team').querySelector('.team-sharing');
  sharing.addEventListener('click',event=>{
    if (!event.target.closest('button')) return;
    sharing.open = false;
    sharing.querySelector('summary').focus();
  });
  const teamLink = () => {
    const link = new URL(location.pathname,location.origin);
    for (const id of ['type-filter','period-filter','from','to']) {
      if (id==='period-filter' || $(id).value) link.searchParams.set(id,$(id).value);
    }
    link.hash = 'team';
    return link.href;
  };
  $('share-team').onclick = () => sharePdf('Programma per il team','programma-ruchheim.pdf',list);
  $('copy-link').onclick = () => copyAgendaLink(teamLink());
  $('print').onclick = () => sharePdf('Programma per il team','programma-ruchheim.pdf',list,{preview:true});
}

function render() {
  const list = sorted(events.filter(matches));
  listPage = Math.min(listPage,Math.max(1,Math.ceil(list.length/pageSize)));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view));
  for (const name of ['agenda','prep','team']) $(name).hidden = name!==view;
  $('new-event').hidden = view!=='agenda' || !mayEdit();
  $('date-filters').hidden = $('period-filter').value!=='custom';
  $('reset').classList.toggle('filters-idle', !$('type-filter').value && !$('period-filter').value);
  const titles = {
    agenda:['Agenda della comunità','Appuntamenti e preparazione del programma della comunità.'],
    prep:['Preparazione','Checklist e responsabilità per gli appuntamenti in programma.'],
    team:['Programma','Programma della comunità.']
  };
  $('page-title').textContent = titles[view][0];
  $('page-subtitle').textContent = titles[view][1];
  if (view==='agenda') renderCalendar(list);
  if (view==='prep') renderPrep(list);
  if (view==='team') renderTeam(list);
}



let catalog = [];
let catalogKind;
const catalogName = entry => [entry.firstName,entry.lastName].filter(Boolean).join(' ');
const nameKey = value => value.trim().normalize('NFC').replace(/\s+/g,' ').toLocaleLowerCase('it');

const palette = {blue:'Blu',green:'Verde',yellow:'Giallo',pink:'Rosa',orange:'Arancione',
  gray:'Grigio',purple:'Viola',teal:'Turchese',red:'Rosso',brown:'Marrone'};
const defaultColors = {agape:'yellow',bambini:'pink',concerto:'pink',convegno:'purple',
  culto:'green',donne:'blue',seminario:'purple',uomini:'blue',cinema:'green'};

function typeColor(name) {
  const key = nameKey(name);
  const color = catalog.find(entry=>entry.kind==='type' && nameKey(catalogName(entry))===key)?.color;
  return Object.hasOwn(palette,color) ? color : (Object.hasOwn(defaultColors,key) ? defaultColors[key] : 'gray');
}

const colorOptions = selected => Object.entries(palette).map(([id,label])=>option(id,label,id===selected)).join('');

function catalogNames(kind) {
  const entries = catalog.filter(entry=>entry.kind===kind);
  const names = kind==='type' ? [...types,...events.map(event=>event.type)] : events.flatMap(speakers);
  const byKey = new Map(names.filter(Boolean).map(name=>[nameKey(name),name]));
  for (const entry of entries) {
    const name = catalogName(entry);
    if (entry.removed) byKey.delete(nameKey(name));
    else byKey.set(nameKey(name),name);
  }
  return [...byKey.values()].sort((a,b)=>a.localeCompare(b,'it'));
}

function fillTypes(selected=$('type-filter').value) {
  const filter = $('type-filter');
  const names = [...new Set([...catalogNames('type'),...events.map(event=>event.type).filter(Boolean)])]
    .sort((a,b)=>a.localeCompare(b,'it'));
  filter.innerHTML = option('','Tutti i tipi')+names.map(name=>option(name)).join('');
  filter.value = names.includes(selected) ? selected : '';
}

function catalogColorPicker(name) {
  const selected = typeColor(name);
  return '<details class="catalog-color" data-color-type="'+escape(name)+'">'+
    '<summary aria-label="Colore di '+escape(name)+': '+palette[selected]+'">'+
    '<span class="color-swatch" data-color="'+selected+'" aria-hidden="true"></span><span aria-hidden="true">⌄</span></summary>'+
    '<div class="catalog-palette" role="group" aria-label="Scegli colore">'+
    Object.entries(palette).map(([color,label])=>'<button type="button" class="icon-button" data-pick-color="'+color+
      '" aria-label="'+label+'" aria-pressed="'+(selected===color)+'" title="'+label+
      '"><span class="color-swatch" data-color="'+color+'" aria-hidden="true"></span></button>').join('')+'</div></details>';
}

function renderCatalog() {
  const names = catalogNames(catalogKind);
  $('catalog-list').innerHTML = names.length ? names.map(name=>'<li class="account-row"><span>'+escape(name)+
    '</span><div class="catalog-actions">'+(catalogKind==='type' ? (isAdmin() ? catalogColorPicker(name) :
      '<span class="color-swatch" data-color="'+typeColor(name)+'" aria-label="'+palette[typeColor(name)]+'"></span>') : '')+
    (isAdmin() ? '<button type="button" class="icon-button delete-icon" data-remove="'+escape(name)+
    '" aria-label="Rimuovi '+escape(name)+'" title="Rimuovi '+escape(name)+'"></button>' : '')+'</div></li>').join('')
    : '<li class="muted">Nessuna voce presente.</li>';
}

function updateCatalog(entry) {
  catalog = catalog.filter(item=>item.kind!==entry.kind || nameKey(catalogName(item))!==nameKey(catalogName(entry)));
  catalog.push(entry);
  fillTypes();
  render();
  renderCatalog();
}

function catalogBusy(busy) {
  $('catalog-save').disabled = busy;
  $('catalog-dialog').querySelector('[method="dialog"] button').disabled = busy;
  $('catalog-list').querySelectorAll('button,select').forEach(control=>control.disabled=busy);
}

$('catalog-list').onclick = async event => {
  if (!isAdmin()) return;
  const swatch = event.target.closest('[data-pick-color]');
  if (swatch && !$('catalog-save').disabled) {
    const picker = swatch.closest('[data-color-type]');
    const name = picker.dataset.colorType;
    const color = swatch.dataset.pickColor;
    if (color===typeColor(name)) {
      picker.open = false;
      picker.querySelector('summary').focus();
      return;
    }
    catalogBusy(true);
    try {
      updateCatalog(await jsonApi('/api/catalog',{kind:'type',action:'color',firstName:name,color}));
      $('catalog-message').textContent = 'Colore salvato.';
      [...$('catalog-list').querySelectorAll('[data-color-type]')]
        .find(item=>item.dataset.colorType===name)?.querySelector('summary').focus({preventScroll:true});
    } catch (error) {
      $('catalog-message').textContent = error.message;
    } finally {
      catalogBusy(false);
    }
    return;
  }
  const button = event.target.closest('button[data-remove]');
  if (!button || $('catalog-save').disabled) return;
  const name = button.dataset.remove;
  if (!window.confirm('Rimuovere «'+name+'» dalle scelte? Gli eventi già salvati conserveranno il valore.')) return;
  catalogBusy(true);
  try {
    updateCatalog(await jsonApi('/api/catalog',{kind:catalogKind,firstName:name,remove:true}));
    $('catalog-message').textContent = 'Voce rimossa.';
    $('catalog-add').focus();
  } catch (error) {
    $('catalog-message').textContent = error.message;
  } finally {
    catalogBusy(false);
  }
};

function openCatalog(kind) {
  catalogKind = kind;
  $('catalog-add').hidden = !isAdmin();
  const isSpeaker = kind==='speaker';
  $('catalog-menu').open = false;
  $('catalog-title').textContent = isSpeaker ? 'Relatori' : 'Tipi di evento';
  $('catalog-first-label').textContent = isSpeaker ? 'Nome' : 'Nome del tipo di evento';
  $('catalog-last-label').hidden = !isSpeaker;
  $('catalog-color-label').hidden = isSpeaker;
  $('catalog-form').elements.color.disabled = isSpeaker;
  $('catalog-form').elements.color.innerHTML = colorOptions('gray');
  $('catalog-form').elements.lastName.required = isSpeaker;
  $('catalog-form').reset();
  $('catalog-form').hidden = true;
  $('catalog-add').setAttribute('aria-expanded','false');
  $('catalog-message').textContent = '';
  renderCatalog();
  $('catalog-dialog').showModal();
}

document.querySelectorAll('[data-catalog]').forEach(button=>{
  button.onclick = () => openCatalog(button.dataset.catalog);
});
$('catalog-add').onclick = () => {
  if (!isAdmin()) return;
  $('catalog-form').hidden = false;
  $('catalog-add').setAttribute('aria-expanded','true');
  $('catalog-form').elements.firstName.focus();
};
$('catalog-dialog').addEventListener('cancel',event=>{
  if ($('catalog-save').disabled) event.preventDefault();
});
$('catalog-form').onsubmit = async event => {
  event.preventDefault();
  if (!isAdmin()) return;
  if ($('catalog-save').disabled) return;
  const form = event.currentTarget;
  const data = {kind:catalogKind,...Object.fromEntries(new FormData(form))};
  const label = catalogName({...data,lastName:catalogKind==='speaker' ? data.lastName : ''});
  if (catalogNames(catalogKind).some(name=>nameKey(name)===nameKey(label))) {
    $('catalog-message').textContent = 'Questa voce è già presente.';
    return;
  }
  catalogBusy(true);
  $('catalog-message').textContent = '';
  try {
    updateCatalog(await jsonApi('/api/catalog',data));
    form.reset();
    form.hidden = true;
    $('catalog-add').setAttribute('aria-expanded','false');
    $('catalog-add').focus();
    $('catalog-message').textContent = 'Voce aggiunta.';
  } catch (error) {
    $('catalog-message').textContent = error.message;
  } finally {
    catalogBusy(false);
  }
};

const fields = [
  ['title','Titolo','text'],['type','Tipo evento','suggestions'],['date','Data','date'],
  ['end','Data fine','date'],['time','Orario','time'],['place','Luogo','text'],
  ['responsible','Guida/Conduzione','text'],['speaker','Relatore','suggestions'],
  ['status','Stato preparazione','select'],['description','Descrizione','textarea']
];

const churchAddress = 'Oggersheimer Str. 2, 67071 Ludwigshafen';
const churchPlace = 'Christliche Gemeinde Ruchheim · '+churchAddress;
const churchMap = 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(churchAddress);

function openEditor(event, editing=!event, date='') {
  isNewEvent = !event;
  active = event || {id:crypto.randomUUID(),revision:0,title:'',type:'',status:'Da preparare',date,end:'',time:'',place:'',speaker:'',responsible:'',description:'',materials:'',tasks:[{label:'Definire i responsabili',done:false}]};
  renderEditor(editing);
  $('event-title').autofocus = !event && editing && canSave;
  $('close-editor').autofocus = !$('event-title').autofocus;
  $('editor').showModal();
}

let releaseAttachmentPreview = () => {};
$('editor').addEventListener('close',()=>releaseAttachmentPreview());

function setupAttachments(readOnly) {
  const section = $('event-attachments');
  const eventId = active.id;
  const list = section.querySelector('ul');
  const status = section.querySelector('[role="status"]');
  const preview = section.querySelector('.attachment-preview');
  const input = section.querySelector('input');
  const connected = () => section.isConnected && $('editor').open;
  const path = (params={}) => '/api/attachments?'+new URLSearchParams({event:eventId,...params});
  const formatSize = size => size>=1024*1024
    ? (size/(1024*1024)).toLocaleString('it-IT',{maximumFractionDigits:1})+' MB'
    : Math.max(1,Math.round(size/1024))+' KB';
  let loaded = false;
  let busy = false;
  let objectUrl;
  releaseAttachmentPreview = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    preview.replaceChildren();
  };

  function setBusy(value) {
    busy = value;
    section.querySelectorAll('button,input').forEach(control=>{ control.disabled = value; });
  }

  const fileDetails = section.closest('details');
  async function refresh(openWhenPopulated=false) {
    const files = await jsonApi(path());
    if (!connected()) return;
    list.innerHTML = files.map(file=>
      '<li><button class="plain attachment-name" type="button" data-preview-file="'+escape(file.id)+'">'+
      escape(file.name)+' <small>'+formatSize(file.size)+'</small></button>'+
      (readOnly?'':'<button type="button" class="icon-button delete-icon" data-remove-file="'+escape(file.id)+
      '" aria-label="Rimuovi '+escape(file.name)+'"></button>')+'</li>').join('');
    status.textContent = files.length ? '' : 'Nessun allegato.';
    loaded = true;
    if (openWhenPopulated && files.length) fileDetails.open = true;
  }

  async function run(action) {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Caricamento…';
    try { await action(); }
    catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  }

  fileDetails.addEventListener('toggle',event=>{
    if (event.currentTarget.open && !loaded && !isNewEvent && connected()) run(refresh);
  });

  if (!isNewEvent) run(()=>refresh(true));

  if (input) input.onchange = () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5*1024*1024) {
      status.textContent = 'Il file supera 5 MB.';
      return;
    }
    run(async ()=>{
      const response = await apiFetch(path({name:file.name}),{
        method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Caricamento non riuscito.');
      if (connected()) await refresh();
    });
  };

  list.onclick = event=>{
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.dataset.removeFile) {
      if (!confirm('Rimuovere questo allegato?')) return;
      run(async ()=>{
        const response = await apiFetch(path({id:button.dataset.removeFile}),{
          method:'DELETE',headers:{'Content-Type':'application/json'}
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Rimozione non riuscita.');
        if (!connected()) return;
        releaseAttachmentPreview();
        await refresh();
      });
      return;
    }
    if (!button.dataset.previewFile) return;
    run(async ()=>{
      const response = await apiFetch(path({id:button.dataset.previewFile}));
      if (!response.ok) throw new Error((await response.json()).error || 'Allegato non disponibile.');
      const blob = await response.blob();
      if (!connected()) return;
      releaseAttachmentPreview();
      objectUrl = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = objectUrl;
      download.download = button.firstChild.textContent.trim();
      download.textContent = 'Scarica file';
      if (blob.type.startsWith('image/')) {
        const image = document.createElement('img');
        image.alt = download.download;
        image.src = objectUrl;
        preview.append(image);
      } else if (blob.type.startsWith('text/plain')) {
        const text = await blob.slice(0,32768).text();
        if (!connected()) return;
        const pre = document.createElement('pre');
        pre.textContent = blob.size>32768 ? text+'\n…' : text;
        preview.append(pre);
      } else {
        const open = document.createElement('a');
        open.href = objectUrl;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Apri PDF';
        preview.append(open);
      }
      preview.append(download);
      status.textContent = '';
    });
  };
}

function renderEditor(editing) {
  releaseAttachmentPreview();
  const readOnly = !editing || !canSave;
  const place = active.place || churchPlace;
  const attachments = '<section id="event-attachments" aria-label="Allegati">'+
    (isNewEvent ? '<p class="muted">Salva l’evento per aggiungere allegati.</p>'
      : readOnly ? '' : '<label>Carica allegato · max 5 MB<input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.md"></label>')+
    '<p class="muted" role="status"></p><ul></ul><div class="attachment-preview"></div></section>';
  $('edit-event').hidden = !readOnly || !canSave;
  $('editor-label').textContent = active.title ? 'Scheda evento' : 'Nuovo evento';
  $('edit-title').textContent = active.title || 'Nuovo evento';
  $('edit-title').hidden = !readOnly;
  const title = $('event-title');
  title.hidden = title.disabled = readOnly;
  title.value = active.title;
  $('form-message').textContent = '';
  $('save').hidden = readOnly;
  $('delete-event').hidden = readOnly || isNewEvent;
  $('event-mail').hidden = !canSave || isNewEvent;
  $('event-sharing').hidden = isNewEvent;
  $('event-sharing').open = false;
  const typeSlot = $('editor-type');
  $('editor').classList.toggle('event-preview',readOnly);
  const fieldIcons = {"date":"<svg class=\"action-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18\"/></svg>","time":"<svg class=\"action-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/></svg>"};

  function previewField(key,label) {
    const value = escape(active[key]);
    if (key==='description') {
      return '<details class="event-description"'+(value?' open':'')+'><summary>Descrizione</summary>'+
        '<p class="event-text">'+(value || 'Nessuna descrizione.')+'</p></details>';
    }
    if (key==='end' && !value) return '';
    let display = value;
    if (key==='type') display = '<span class="row-type" data-color="'+typeColor(active.type)+'">'+value+'</span>';
    if (['date','end'].includes(key) && value) {
      display = escape(format(active[key],{day:'2-digit',month:'2-digit',year:'numeric'}));
    }
    if (key==='place') {
      display = place===churchPlace || place.trim().toLowerCase()==='christliche gemeinde ruchheim'
        ? '<a class="preview-place-link" href="'+churchMap+'" target="_blank" rel="noopener noreferrer" aria-label="Christliche Gemeinde Ruchheim, '+churchAddress+'">'+
          '<strong>Christliche Gemeinde Ruchheim</strong><span class="preview-place-address"> · '+churchAddress+'</span></a>'
        : escape(place);
    }
    return '<div class="event-fact" data-field="'+key+'"><span class="event-field-label">'+(fieldIcons[key] || '')+label+
      '</span><div class="event-fact-value">'+(display || '<span class="muted">Da definire</span>')+'</div></div>';
  }
  function renderField([key,label,kind]) {
    if (readOnly) return previewField(key,label);
    const value = escape(active[key]);
    if (key==='date') {
      return '<label><span class="event-field-label"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>Data</span><input type="date" name="date" min="0001-01-01" max="9999-12-31" value="'+value+'"></label>';
    }
    if (key==='time') {
      return '<label><span class="event-field-label"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Orario</span><input type="time" name="time" value="'+value+'"></label>';
    }
    if (key==='end') {
      return '<details class="event-end"'+(active.end?' open':'')+'><summary>Data fine</summary><label class="event-end-input">'+
        '<input type="date" name="end" aria-label="Data fine" min="'+(escape(active.date)||'0001-01-01')+'" max="9999-12-31" value="'+value+'"></label></details>';
    }
    if (key==='place') {
      const isDefault = place===churchPlace || place.trim().toLowerCase()==='christliche gemeinde ruchheim';
      return '<details class="event-place"'+(isDefault?'':' open')+'><summary>Luogo</summary><div class="event-place-row">'+
        '<div id="event-place-preview">'+(isDefault ? '<strong>Christliche Gemeinde Ruchheim</strong> <span aria-hidden="true">·</span> <a href="'+churchMap+
        '" target="_blank" rel="noopener noreferrer">'+churchAddress+'</a>' : escape(place))+'</div>'+
        '<input type="text" name="place" id="event-place-input" aria-label="Luogo" value="'+escape(place)+'" maxlength="5000" hidden>'+
        '<button type="button" id="edit-place" class="icon-button" aria-label="Modifica luogo" title="Modifica luogo">✎</button></div></details>';
    }
    if (key==='description') {
      return '<details class="event-description"'+(active.description?.trim()?' open':'')+'><summary>Descrizione</summary>'+
        '<textarea name="description" aria-label="Descrizione" rows="3" maxlength="5000">'+value+'</textarea></details>';
    }
    if (kind==='suggestions') {
      const names = catalogNames(key);
      return '<div class="event-choice"><label for="event-'+key+'">'+label+'</label>'+
        '<div class="choice-control"><input id="event-'+key+'" type="text" name="'+key+
        '" maxlength="5000" value="'+value+'"'+(key==='type'?' required':'')+
        (key==='type'?' placeholder="Scegli o scrivi"':'')+'>'+
        '<button type="button" class="icon-button choice-toggle" aria-label="Mostra elenco: '+label+
        '" aria-expanded="false" aria-controls="'+key+'-choices"'+(names.length?'':' disabled')+'></button></div>'+
        '<div class="choice-options" id="'+key+'-choices" hidden>'+
        names.map(name=>'<button type="button" data-value="'+escape(name)+'">'+escape(name)+'</button>').join('')+'</div></div>';
    }
    const field = kind==='select' ? '<select name="'+key+'">'+statuses.map(v=>option(v,v,v===active[key])).join('')+'</select>'
      : kind==='textarea' ? '<textarea rows="3" maxlength="5000" name="'+key+'">'+value+'</textarea>'
      : '<input name="'+key+'" type="'+kind+'" value="'+value+'" '+(key==='title'?'required ':'')+(kind==='date'?'min="0001-01-01" max="9999-12-31"':'maxlength="5000"')+'>';
    return '<label class="'+(kind==='textarea'?'wide':'')+'">'+label+field+'</label>';
  }
  const field = key => renderField(fields.find(([name])=>name===key));
  typeSlot.innerHTML = field('type');
  $('details').innerHTML = '<div class="editor-overview">'+
    '<section class="editor-card editor-program-card"><h3>Programma</h3><div class="fields">'+
    '<div class="event-schedule wide">'+['date','time','status'].map(field).join('')+'</div>'+
    '<div class="event-options wide">'+field('end')+field('place')+'</div>'+
    '</div></section><section class="editor-card editor-people-card"><h3 class="event-field-label"><svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>Persone</h3><div class="editor-people">'+
    ['responsible','speaker'].map(field).join('')+'</div></section></div>'+
    '<div class="editor-notes">'+field('description')+
    '<details class="event-materials wide"><summary>File</summary>'+attachments+'</details></div>'+
    '<section class="editor-card tasks"><div class="checklist-heading"><h3>Checklist</h3>'+
    '<span id="checklist-summary"></span></div><div id="task-list"></div>'+
    (readOnly ? '' : '<button type="button" class="plain" id="add-task">＋ Aggiungi attività</button>')+'</section>';
  if (readOnly) {
    $('task-list').innerHTML = active.tasks.map(task=>'<div class="task preview-task">'+
      '<span class="task-indicator" role="img" aria-label="'+(task.done?'Completata':'Da completare')+'">'+(task.done?'✓':'○')+'</span>'+
      '<span>'+escape(task.label)+'</span></div>').join('');
    const total = active.tasks.length;
    const done = active.tasks.filter(task=>task.done).length;
    $('checklist-summary').textContent = total ? done+' di '+total+' completate' : 'Nessuna attività';
  } else {
    const placeInput = $('event-place-input');
    $('edit-place').onclick = () => {
      $('event-place-preview').hidden = true;
      $('edit-place').hidden = true;
      placeInput.hidden = false;
      placeInput.focus();
    };
    const {date,end} = $('event-form').elements;
    date.onchange = () => { end.min = date.value || '0001-01-01'; };
    end.oninvalid = () => { end.closest('details').open = true; };
    $('event-form').querySelectorAll('.event-choice').forEach(choice=>{
      const input = choice.querySelector('input');
      const toggle = choice.querySelector('.choice-toggle');
      const list = choice.querySelector('.choice-options');
      if (input.name==='type') {
        const paint = () => { choice.dataset.color = typeColor(input.value); };
        input.addEventListener('input',paint);
        paint();
      }
      function setOpen(open) {
        list.hidden = !open;
        toggle.setAttribute('aria-expanded',String(open));
      }
      toggle.onclick = () => {
        const open = list.hidden;
        setOpen(open);
        if (open) list.querySelector('button').focus();
      };
      list.onclick = event => {
        const item = event.target.closest('button[data-value]');
        if (!item) return;
        input.value = item.dataset.value;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        setOpen(false);
        input.focus();
      };
      choice.addEventListener('keydown',event=>{
        if (event.key==='Escape' && !list.hidden) {
          event.preventDefault();
          setOpen(false);
          toggle.focus();
        }
      });
    });
    $('event-form').onpointerdown = event => {
      $('event-form').querySelectorAll('.choice-toggle[aria-expanded="true"]').forEach(toggle=>{
        if (toggle.closest('.event-choice').contains(event.target)) return;
        toggle.setAttribute('aria-expanded','false');
        $(toggle.getAttribute('aria-controls')).hidden = true;
      });
    };
    for (const task of active.tasks) addTask(task);
    updateChecklistCount();
    $('task-list').onchange = updateChecklistCount;
    $('add-task').onclick = () => {
      if ($('task-list').children.length<80) addTask({label:'',done:false}).focus();
    };
  }
  setupAttachments(readOnly);
}

function updateChecklistCount() {
  const list = $('task-list');
  const done = list.querySelectorAll('input:checked').length;
  const total = list.children.length;
  $('checklist-summary').textContent = total ? done+' di '+total+' completate' : 'Nessuna attività';
}

function addTask(task) {
  const item = document.createElement('div');
  item.className = 'task';
  item.innerHTML = '<input type="checkbox" aria-label="Attività completata" '+(task.done?'checked':'')+'><input type="text" maxlength="240" aria-label="Descrizione attività" value="'+escape(task.label)+'"><button type="button" class="icon-button delete-icon" aria-label="Rimuovi attività" title="Rimuovi attività"></button>';
  item.querySelector('button').onclick = () => {
    item.remove();
    updateChecklistCount();
    $('add-task').focus();
  };
  $('task-list').append(item);
  updateChecklistCount();
  return item.querySelector('input[type=text]');
}

$('delete-event').onclick = async () => {
  if (!canSave || isNewEvent || $('delete-event').hidden || $('save').disabled) return;
  if (!window.confirm('Eliminare «'+active.title+'» dal calendario?')) return;
  $('save').disabled = $('delete-event').disabled = true;
  $('form-message').textContent = 'Eliminazione in corso…';
  try {
    const {id,revision} = active;
    const response = await apiFetch('/api/events',{
      method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,revision})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    events = events.filter(event=>event.id!==id);
    $('editor').close();
    fillTypes();

    render();
    notice('Evento eliminato.');
  } catch (error) {
    $('form-message').textContent = error.message || 'Eliminazione non riuscita.';
  } finally {
    $('save').disabled = $('delete-event').disabled = false;
  }
};

const mailForm = $('mail-form');
const mailDialog = $('mail-dialog');
const mailStates = {pending:'Programmato',sending:'In invio',sent:'Inviato',failed:'Rifiutato',unknown:'Esito non confermato',cancelled:'Annullato'};
let mailRequest;

function mailSummary(job) {
  return [job.subject,job.recipient,new Date((job.claimed ?? job.due)*1000).toLocaleString('it-IT'),
    mailStates[job.status]].join(' · ');
}

async function loadLatestMail() {
  const {configured,jobs,issue} = await jsonApi('/api/mail?view=latest');
  $('mail-submit').disabled = !configured;
  if (!configured) $('mail-message').textContent = issue || 'Configurazione email incompleta su Cloudflare.';
  $('mail-latest').textContent = jobs.length ? 'Ultimo invio · '+mailSummary(jobs[0]) : '';
}

async function loadAdminMailHistory() {
  const {jobs} = await jsonApi('/api/mail?view=history');
  $('mail-history-message').textContent = jobs.length ? '' : 'Nessun invio registrato.';
  $('mail-history').replaceChildren(...jobs.map(job=>{
    const row = document.createElement('li');
    row.textContent = mailSummary(job)+' · '+job.owner;
    if (job.canCancel) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'plain';
      cancel.textContent = 'Annulla invio';
      cancel.onclick = async () => {
        cancel.disabled = true;
        try { await jsonApi('/api/mail',{action:'cancel',id:job.id}); await loadAdminMailHistory(); }
        catch (error) { $('mail-history-message').textContent = error.message; cancel.disabled=false; }
      };
      row.append(' ',cancel);
    }
    return row;
  }));
}

const activityLabels = {
  'event.create':'Evento creato',
  'attachment.add':'Allegato caricato',
  'attachment.delete':'Allegato rimosso',
  'event.edit':'Evento modificato',
  'event.delete':'Evento eliminato',
  'speaker.add':'Relatore aggiunto',
  'speaker.remove':'Relatore eliminato',
  'type.add':'Tipo di evento aggiunto',
  'type.remove':'Tipo di evento eliminato',
  'type.color':'Colore del tipo di evento modificato',
  'user.invite':'Invito creato',
  'user.reset':'Reimpostazione password richiesta',
  'user.disable':'Account disattivato',
  'user.role':'Permessi modificati',
  'mail.request':'Invio email richiesto',
  'mail.schedule':'Email programmata',
  'mail.cancel':'Invio email annullato',
  'mail.sent':'Email inviata',
  'mail.failed':'Invio email fallito',
  'mail.unknown':'Esito invio email non confermato'
};
const activityTime = new Intl.DateTimeFormat('it-IT',{
  dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'
});
let activityCursor = null;

async function loadActivity() {
  const more = $('activity-more');
  const message = $('activity-message');
  more.disabled = true;
  message.textContent = 'Caricamento…';
  try {
    const {entries,next} = await jsonApi('/api/activity'+(activityCursor === null ? '' : '?before='+activityCursor));
    $('activity-list').insertAdjacentHTML('beforeend',entries.map(({action,target,actor,time})=>{
      const date = new Date(time*1000);
      return '<li><strong>'+escape(activityLabels[action] || action)+'</strong>'+
        '<span>'+escape(target)+'</span><small>'+escape(actor)+' · <time datetime="'+
        date.toISOString()+'">'+activityTime.format(date)+'</time></small></li>';
    }).join(''));
    activityCursor = next;
    message.textContent = $('activity-list').childElementCount ? '' : 'Nessuna attività registrata.';
    more.hidden = next === null;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    more.disabled = false;
  }
}

$('activity-more').onclick = loadActivity;
$('open-activity').onclick = async () => {
  if (!isAdmin()) return;
  $('admin-menu').open = false;
  activityCursor = null;
  $('activity-list').replaceChildren();
  $('activity-more').hidden = true;
  $('activity-dialog').showModal();
  await loadActivity();
};

$('open-mail-history').onclick = async () => {
  if (!isAdmin()) return;
  $('admin-menu').open = false;
  $('mail-history').replaceChildren();
  $('mail-history-message').textContent = 'Caricamento…';
  $('mail-history-dialog').showModal();
  try { await loadAdminMailHistory(); }
  catch (error) { $('mail-history-message').textContent = error.message; }
};

mailForm.elements.mode.onchange = () => {
  const scheduled = mailForm.elements.mode.value==='later';
  $('mail-date').hidden = !scheduled;
  mailForm.elements.when.required = scheduled;
  $('mail-submit').textContent = scheduled ? 'Programma promemoria' : 'Invia email';
};

const sharing = $('event-sharing');
sharing.addEventListener('click',event=>{
  if (event.target.closest('button')) sharing.open = false;
});
$('editor').addEventListener('click',event=>{
  if (!sharing.contains(event.target)) sharing.open = false;
});
sharing.addEventListener('keydown',event=>{
  if (event.key !== 'Escape' || !sharing.open) return;
  event.preventDefault();
  event.stopPropagation();
  sharing.open = false;
  sharing.querySelector('summary').focus();
});

$('share-event').onclick = () => {
  if (!isNewEvent) sharePdf(active.title,'evento-ruchheim.pdf',[active],{single:true});
};
$('copy-event-link').onclick = () => {
  if (isNewEvent) return;
  const link = new URL(location.pathname,location.origin);
  link.searchParams.set('event',active.id);
  link.hash = 'team';
  copyAgendaLink(link.href);
};
$('event-mail').onclick = async () => {
  if (!canSave || isNewEvent || $('save').disabled) return;
  mailForm.reset();
  mailRequest = undefined;
  mailForm.elements.mode.onchange();
  mailForm.elements.subject.value = active.title.replace(/[\r\n]/g,' ').slice(0,200);
  mailForm.elements.body.value = [active.title,dateLabel(active),active.time && 'Orario: '+active.time,
    'Luogo: '+(active.place || churchPlace),active.speaker && 'Relatore: '+active.speaker].filter(Boolean).join('\n').slice(0,6000);
  $('mail-zone').textContent = 'Data e ora ('+Intl.DateTimeFormat().resolvedOptions().timeZone+')';
  $('mail-latest').textContent = '';
  $('mail-message').textContent = '';
  $('mail-submit').disabled = true;
  mailDialog.showModal();
  try { await loadLatestMail(); }
  catch (error) { $('mail-message').textContent=error.message; }
};

mailForm.onsubmit = async event => {
  event.preventDefault();
  if ($('mail-submit').disabled) return;
  const {to,subject,body,mode,when} = mailForm.elements;
  const data = {action:'send',to:to.value,subject:subject.value,body:body.value};
  if (mode.value==='later') {
    data.due = Math.floor(new Date(when.value).getTime()/1000);
    if (!Number.isFinite(data.due) || data.due<=Date.now()/1000) {
      $('mail-message').textContent = 'Scegli una data e un orario futuri.';
      return;
    }
  }
  const key = JSON.stringify(data);
  if (mailRequest?.key!==key) mailRequest = {key,id:crypto.randomUUID()};
  $('mail-submit').disabled = true;
  try {
    const result = await jsonApi('/api/mail',{...data,id:mailRequest.id});
    $('mail-message').textContent = result.status==='sent' ? 'Email inviata.'
      : result.status==='pending' && data.due ? 'Promemoria programmato.'
      : result.status==='failed' ? 'Invio rifiutato da Google.'
      : 'Esito non ancora confermato. Controlla lo storico prima di riprovare.';
    if (result.status==='failed') mailRequest = undefined;
  } catch (error) { $('mail-message').textContent=error.message; }
  try { await loadLatestMail(); }
  catch { $('mail-submit').disabled=false; }
};

async function save(event) {
  event.preventDefault();
  if (!canSave || $('save').hidden || $('save').disabled) return;
  const data = Object.fromEntries(new FormData(event.target));
  data.place = data.place.trim() || churchPlace;
  data.materials = active.materials || '';
  data.tasks = [...$('task-list').children].map(item=>({
    label:item.querySelector('input[type=text]').value.trim(),
    done:item.querySelector('input[type=checkbox]').checked
  })).filter(task=>task.label);
  data.id = active.id;
  data.revision = active.revision;
  $('save').disabled = true;
  $('form-message').textContent = 'Salvataggio in corso…';
  try {
    const response = await apiFetch('/api/events',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.error);
    events = [...events.filter(item=>item.id!==saved.id),saved];

    if (saved.date && view==='agenda') month = saved.date.slice(0,7);
    $('editor').close();
    fillTypes();

    render();
    notice('Scheda salvata.');
  } catch (error) {
    $('form-message').textContent = error.message || 'Salvataggio non riuscito.';
  } finally { $('save').disabled = false; }
}

function selectView() {
  listPage = 1;
  view = ['agenda','prep','team'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'agenda';
  const params = new URLSearchParams(location.search);
  const period = $('period-filter');
  const requested = params.get('period-filter');
  period.value = [...period.options].some(option=>option.value===requested)
    ? requested : (view==='agenda'?'':'future');
  for (const id of ['type-filter','from','to']) $(id).value = params.get(id) || '';
  render();
}

function moveMonth(by) {
  const next = new Date(month+'-01T12:00:00Z');
  next.setUTCMonth(next.getUTCMonth()+by);
  const year = next.getUTCFullYear();
  if (year >= 1 && year <= 9999) navigateMonth(next.toISOString().slice(0,7));
}

function navigateMonth(next) {

  month = next;
  render();
}

$('calendar-month').innerHTML = Array.from({length:12},(_,index)=>{
  const value = String(index+1).padStart(2,'0');
  return option(value,format('2026-'+value+'-01',{month:'long'}));
}).join('');
$('calendar-month').onchange = () => navigateMonth(month.slice(0,4)+'-'+$('calendar-month').value);
$('year-form').onsubmit = event => {
  event.preventDefault();
  const year = String(Number($('calendar-year').value)).padStart(4,'0');
  if (isYear(year)) navigateMonth(year+'-'+$('calendar-month').value);
};
fillTypes();
for (const id of ['type-filter','period-filter','from','to']) $(id).onchange = () => {
  listPage = 1;
  render();
};
$('reset').onclick = () => {
  listPage = 1;
  for (const id of ['type-filter','period-filter','from','to']) $(id).value='';
  render();
};
$('today').onclick = () => navigateMonth(nowMonth);
$('prev').onclick = () => moveMonth(-1);
$('next').onclick = () => moveMonth(1);
$('more').onclick = () => { showAll=!showAll; render(); };
$('new-event').disabled = true;
$('new-event').onclick = () => openEditor();
$('close-editor').onclick = $('cancel').onclick = () => { if (!$('save').disabled) $('editor').close(); };
$('editor').addEventListener('cancel',event=>{ if ($('save').disabled) event.preventDefault(); });
$('edit-event').onclick = () => {
  if (!canSave) return;
  const materials = $('event-attachments').closest('details');
  const keepMaterialsOpen = materials.open;
  renderEditor(true);
  if (keepMaterialsOpen) {
    const editableMaterials = $('event-attachments').closest('details');
    editableMaterials.open = true;
    editableMaterials.querySelector('summary').focus({preventScroll:true});
    editableMaterials.scrollIntoView({block:'nearest'});
  } else {
    $('event-form').elements.title.focus();
  }
};
$('event-form').onsubmit = save;
document.addEventListener('click',event=>{
  const teamSharing = $('team').querySelector('.team-sharing[open]');
  if (teamSharing && !teamSharing.contains(event.target)) teamSharing.open = false;
  const pageButton = event.target.closest('button[data-list-page]');
  if (pageButton) {
    listPage = Number(pageButton.dataset.listPage);
    render();
    const heading = $(view).querySelector('h2');
    heading.tabIndex = -1;
    heading.focus();
    heading.scrollIntoView({block:'start'});
    return;
  }
  const control = event.target.closest('button[data-view],button[data-event],button[data-new-date]');
  if (!control) return;
  if (control.dataset.view) {
    const target = new URL(location.href);
    target.search = '';
    target.hash = control.dataset.view;
    history.replaceState(null,'',target);
    selectView();
  }
  if (control.dataset.newDate && canSave) openEditor(undefined,true,control.dataset.newDate);
  if (control.dataset.event) {
    const item = events.find(e=>e.id===control.dataset.event);
    if (item) openEditor(item);
  }
});
window.addEventListener('hashchange',selectView);
selectView();

async function load() {
  try {
    const response = await apiFetch('/api/events');
    if (!response.ok) throw new Error('Calendario non disponibile');
    events = await response.json();
    fillTypes(new URLSearchParams(location.search).get('type-filter') || $('type-filter').value);

    render();
    try {
      catalog = await jsonApi('/api/catalog');
      $('catalog-menu').hidden = false;
      fillTypes(new URLSearchParams(location.search).get('type-filter') || $('type-filter').value);
      render();
    } catch (error) {
      if (error.status!==404) notice('Impossibile caricare gli elenchi di relatori e tipi di evento.','error');
    }
    canSave = mayEdit();
    $('new-event').disabled = !canSave;
    if (view==='agenda') render();
    const eventId = new URLSearchParams(location.search).get('event');
    if (view==='team' && eventId) {
      const shared = events.find(event=>event.id===eventId);
      if (shared) openEditor(shared,false);
      else notice('Evento non disponibile.','error');
    }
  } catch {
    notice('Impossibile caricare il calendario. Riprova tra poco.','error');
  }
}
load();
