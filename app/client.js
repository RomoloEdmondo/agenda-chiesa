import {notice} from './toast.js';
import {apiFetch, isAdmin, jsonApi, mayEdit} from './session.js';
import {types, statuses} from './event-types.js';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const format = (date,options) => new Intl.DateTimeFormat('it-IT',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format();
const nowMonth = today.slice(0,7);
const isYear = value => /^(?!0000)\d{4}$/.test(value);
const closed = event => ['Concluso','Annullato'].includes(event.status);
const speakers = event => event.speaker.split(',').map(name=>name.trim()).filter(Boolean);
let events = [];
let month = nowMonth;
let showAll = false;
let view = 'agenda';
let active;
let canSave = false;

const option = (value,label=value,selected=false) => '<option value="'+escape(value)+'"'+(selected?' selected':'')+'>'+escape(label)+'</option>';
const dateLabel = event => event.date
  ? format(event.date,{day:'numeric',month:'short',year:'numeric'}) +
    (event.end && event.end !== event.date ? ' – '+format(event.end,{day:'numeric',month:'short',year:'numeric'}) : '')
  : 'Data da confermare';
const sorted = list => [...list].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999') ||
  a.time.localeCompare(b.time) || a.title.localeCompare(b.title,'it'));
const empty = message => '<p class="empty">'+escape(message)+'</p>';
const eventButton = (event, label, className='plain') => '<button type="button" class="'+className+'" data-event="'+escape(event.id)+'">'+escape(label)+'</button>';

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
  if (period === 'past') return end < today;
  if (period === 'custom') return (!from || end >= from) && (!to || event.date <= to) && (!from || !to || from <= to);
  return end >= period+'-01-01' && event.date <= period+'-12-31';
}

function row(event, team=false) {
  const day = event.date ? Number(event.date.slice(8)) : '–';
  const label = event.date ? format(event.date,{month:'short'}) : 'Data';
  const notes = [event.time,team ? event.place : "",event.speaker].filter(Boolean).join(' · ');
  const extra = team ? '<small>'+escape([event.responsible,event.status].filter(Boolean).join(' · '))+'</small>' : '';
  return '<button type="button" class="event-row" data-event="'+escape(event.id)+'"><span class="date-tile" aria-hidden="true"><strong>'+day+'</strong>'+escape(label)+'</span>'+
    '<span class="row-copy"><span class="row-type">'+escape(event.type)+'</span><strong>'+escape(event.title)+'</strong><small>'+
    escape(dateLabel(event)+(notes?' · '+notes:''))+'</small>'+extra+'</span><span aria-hidden="true">›</span></button>';
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

function renderPrep(list) {
  const cards = list.map(event=>({
    event,tasks:closed(event)?[]:event.tasks.filter(task=>!task.done)
  }));
  const total = cards.reduce((sum,item)=>sum+item.tasks.length,0);
  const tracked = cards.filter(({event,tasks})=>!closed(event) && (tasks.length || event.status!=='Pronto')).length;
  $('prep').innerHTML = '<div class="panel-head"><div><h2>Attività da preparare</h2><p class="muted">'+total+' attività aperte · '+tracked+' appuntamenti da seguire</p></div></div>'+
    (cards.length ? '<div class="prep-list">'+cards.map(({event,tasks})=>'<article class="prep-card" data-status="'+escape(event.status)+'">'+
      (event.status==='Annullato'?'<span class="prep-cancelled" aria-hidden="true">×</span>':'')+eventButton(event,event.title)+
      '<p class="muted">'+escape(dateLabel(event)+' · '+event.status+(event.responsible?' · '+event.responsible:''))+'</p>'+
      (tasks.length?'<ul>'+tasks.map(task=>'<li>'+escape(task.label)+'</li>').join('')+'</ul>':'')+'</article>').join('')+'</div>' : empty('Nessun appuntamento con questi filtri.'));
}

function renderTeam(list) {
  $('team').innerHTML = '<div class="panel-head"><div><h2>Programma per il team</h2><p class="muted">'+list.length+' appuntamenti · Christliche Gemeinde Ruchheim</p></div>'+
    '<div class="team-actions"><button class="primary" id="copy-link">Copia link</button><button class="plain" id="print">Stampa / PDF</button></div></div>'+
    (list.map(event=>row(event,true)).join('') || empty('Nessun appuntamento con questi filtri.'));
  $('copy-link').onclick = async () => {
    const link = new URL(location.href);
    for (const id of ['type-filter','period-filter','from','to']) {
      if ($(id).value) link.searchParams.set(id,$(id).value);
      else link.searchParams.delete(id);
    }
    link.searchParams.delete('speaker-filter');
    link.hash = 'team';
    try { await navigator.clipboard.writeText(link.href); notice('Link copiato. Si apre per chi ha accesso all’agenda.'); }
    catch { window.prompt('Copia il link della vista team',link.href); }
  };
  $('print').onclick = () => window.print();
}

function render() {
  const list = sorted(events.filter(matches));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view));
  for (const name of ['agenda','prep','team']) $(name).hidden = name!==view;
  $('new-event').hidden = view!=='agenda' || !mayEdit();
  $('date-filters').hidden = $('period-filter').value!=='custom';
  const titles = {
    agenda:['Agenda della comunità','Appuntamenti e preparazione del programma della comunità.'],
    prep:['Preparazione','Checklist e responsabilità per gli appuntamenti in programma.'],
    team:['Vista team','Programma della comunità.']
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

function renderCatalog() {
  const names = catalogNames(catalogKind);
  $('catalog-list').innerHTML = names.length ? names.map(name=>'<li class="account-row"><span>'+escape(name)+
    '</span><div class="catalog-actions">'+(catalogKind==='type'?
      '<span class="color-swatch" data-color="'+typeColor(name)+'" aria-hidden="true"></span>'+
      '<select data-color-type="'+escape(name)+'" aria-label="Colore di '+escape(name)+'">'+colorOptions(typeColor(name))+'</select>':'')+
    '<button type="button" class="icon-button delete-icon" data-remove="'+escape(name)+
    '" aria-label="Rimuovi '+escape(name)+'" title="Rimuovi '+escape(name)+'"></button></div></li>').join('')
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

$('catalog-list').onchange = async event => {
  const select = event.target.closest('select[data-color-type]');
  if (!select || $('catalog-save').disabled) return;
  const name = select.dataset.colorType;
  catalogBusy(true);
  try {
    updateCatalog(await jsonApi('/api/catalog',{kind:'type',action:'color',firstName:name,color:select.value}));
    $('catalog-message').textContent = 'Colore salvato.';
  } catch (error) {
    select.value = typeColor(name);
    $('catalog-message').textContent = error.message;
  } finally {
    catalogBusy(false);
    [...$('catalog-list').querySelectorAll('select')].find(item=>item.dataset.colorType===name)?.focus();
  }
};

$('catalog-list').onclick = async event => {
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
  $('catalog-form').hidden = false;
  $('catalog-add').setAttribute('aria-expanded','true');
  $('catalog-form').elements.firstName.focus();
};
$('catalog-dialog').addEventListener('cancel',event=>{
  if ($('catalog-save').disabled) event.preventDefault();
});
$('catalog-form').onsubmit = async event => {
  event.preventDefault();
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
  ['title','Titolo','text'],['type','Tipo evento','suggestions'],['date','Data inizio','date'],
  ['end','Data fine','date'],['time','Orario','time'],['place','Luogo','text'],
  ['responsible','Guida/Conduzione','text'],['speaker','Relatore','suggestions'],
  ['status','Stato di preparazione','select'],['description','Descrizione','textarea'],['materials','Materiali e link','textarea']
];

const churchAddress = 'Oggersheimer Str. 2, 67071 Ludwigshafen';
const churchPlace = 'Christliche Gemeinde Ruchheim · '+churchAddress;
const churchMap = 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(churchAddress);

function openEditor(event, editing=view!=='team', date='') {
  active = event || {id:crypto.randomUUID(),revision:0,title:'',type:'',status:'Da preparare',date,end:'',time:'',place:'',speaker:'',responsible:'',description:'',materials:'',tasks:[{label:'Definire i responsabili',done:false}]};
  renderEditor(editing);
  $('editor').showModal();
  if (!event && editing && canSave) $('event-title').focus();
}

function renderEditor(editing) {
  const readOnly = !editing || !canSave;
  const place = active.place || churchPlace;
  $('edit-event').hidden = !readOnly || !canSave;
  $('editor-label').textContent = active.title ? 'Scheda evento' : 'Nuovo evento';
  $('edit-title').textContent = active.title || 'Nuovo evento';
  $('edit-title').hidden = !readOnly;
  const title = $('event-title');
  title.hidden = title.disabled = readOnly;
  title.value = active.title;
  $('form-message').textContent = '';
  $('save').hidden = readOnly;
  if (readOnly) {
    $('details').innerHTML = '<dl class="readonly">'+fields.filter(([key])=>key!=='title').map(([key,label])=>'<div><dt>'+escape(label)+'</dt><dd>'+
      escape(key==='place' ? place : (['date','end'].includes(key)&&active[key]?format(active[key],{day:'numeric',month:'long',year:'numeric'}):active[key]) || 'Da definire')+'</dd></div>').join('')+
      '</dl><h3>Checklist</h3><ul>'+active.tasks.map(t=>'<li>'+ (t.done?'✓ ':'○ ')+escape(t.label)+'</li>').join('')+'</ul>';
  } else {
    function renderField([key,label,kind]) {
      const value = escape(active[key]);
      if (key==='date') {
        return '<label>Data inizio<input type="date" name="date" min="0001-01-01" max="9999-12-31" value="'+value+'"></label>';
      }
      if (key==='end') {
        return '<details'+(active.end?' open':'')+'><summary>Data fine</summary><label class="event-end-input">'+
          '<input type="date" name="end" aria-label="Data fine" min="'+(escape(active.date)||'0001-01-01')+'" max="9999-12-31" value="'+value+'"></label></details>';
      }
      if (key==='place') {
        return '<div class="event-place"><label for="event-place-input">Luogo</label><div class="event-place-row">'+
          '<div id="event-place-preview">'+(place===churchPlace ? '<strong>Christliche Gemeinde Ruchheim</strong> <span aria-hidden="true">·</span> <a href="'+churchMap+
          '" target="_blank" rel="noopener noreferrer">'+churchAddress+'</a>' : escape(place))+'</div>'+
          '<input type="text" name="place" id="event-place-input" value="'+escape(place)+'" maxlength="5000" hidden>'+
          '<button type="button" id="edit-place" class="icon-button" aria-label="Modifica luogo" title="Modifica luogo">✎</button></div></div>';
      }
      if (key==='materials') {
        return '<details class="event-materials wide"><summary>Materiali e link'+(active.materials?' · presenti':'')+
          '</summary><textarea name="materials" aria-label="Materiali e link" rows="3" maxlength="5000">'+value+'</textarea></details>';
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
    $('details').innerHTML = '<div class="fields"><div class="event-schedule wide">'+
      ['type','date','end','time'].map(field).join('')+'</div><div class="event-location wide">'+
      ['place','status'].map(field).join('')+'</div>'+
      ['responsible','speaker','description','materials'].map(field).join('')+'</div><section class="tasks"><h3>Checklist</h3><div id="task-list"></div><button type="button" class="plain" id="add-task">＋ Aggiungi attività</button></section>';
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
    $('details').querySelectorAll('.event-choice').forEach(choice=>{
      const input = choice.querySelector('input');
      const toggle = choice.querySelector('.choice-toggle');
      const list = choice.querySelector('.choice-options');
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
        setOpen(false);
        input.focus();
      };
      choice.addEventListener('focusout',event=>{
        if (!choice.contains(event.relatedTarget)) setOpen(false);
      });
      choice.addEventListener('keydown',event=>{
        if (event.key==='Escape' && !list.hidden) {
          event.preventDefault();
          setOpen(false);
          toggle.focus();
        }
      });
    });
    for (const task of active.tasks) addTask(task);
    $('add-task').onclick = () => {
      if ($('task-list').children.length<80) addTask({label:'',done:false}).focus();
    };
  }
}

function addTask(task) {
  const item = document.createElement('div');
  item.className = 'task';
  item.innerHTML = '<input type="checkbox" aria-label="Attività completata" '+(task.done?'checked':'')+'><input type="text" maxlength="240" aria-label="Descrizione attività" value="'+escape(task.label)+'"><button type="button" class="square" aria-label="Rimuovi attività">×</button>';
  item.querySelector('button').onclick = () => item.remove();
  $('task-list').append(item);
  return item.querySelector('input[type=text]');
}

async function save(event) {
  event.preventDefault();
  if (!canSave || $('save').hidden || $('save').disabled) return;
  const data = Object.fromEntries(new FormData(event.target));
  data.place = data.place.trim() || churchPlace;
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
    const selectedPeriod = $('period-filter').value;
    if (saved.date && view==='agenda') month = saved.date.slice(0,7);
    $('editor').close();
    fillTypes();
    fillPeriods(isYear(selectedPeriod) && view==='agenda' ? month.slice(0,4) : selectedPeriod);
    render();
    notice('Scheda salvata.');
  } catch (error) {
    $('form-message').textContent = error.message || 'Salvataggio non riuscito.';
  } finally { $('save').disabled = false; }
}

function selectView() {
  view = ['agenda','prep','team'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'agenda';
  render();
}

function moveMonth(by) {
  const next = new Date(month+'-01T12:00:00Z');
  next.setUTCMonth(next.getUTCMonth()+by);
  const year = next.getUTCFullYear();
  if (year >= 1 && year <= 9999) navigateMonth(next.toISOString().slice(0,7));
}

function navigateMonth(next) {
  const year = next.slice(0,4);
  if (isYear($('period-filter').value) && $('period-filter').value !== year) fillPeriods(year);
  month = next;
  render();
}

function fillPeriods(selected=$('period-filter').value) {
  const filter = $('period-filter');
  for (const item of [...filter.options]) if (isYear(item.value)) item.remove();
  const years = new Set([today.slice(0,4)]);
  for (const event of events) {
    if (event.date) years.add(event.date.slice(0,4));
    if (event.end) years.add(event.end.slice(0,4));
  }
  if (isYear(selected)) years.add(selected);
  for (const year of [...years].sort()) {
    filter.add(new Option('Anno '+Number(year),year),filter.options.length-1);
  }
  filter.value = selected;
}

function jumpYear(year) {
  const candidate = sorted(events.filter(e=>e.date.startsWith(year)&&matches(e)))[0];
  month = year===nowMonth.slice(0,4) ? nowMonth : candidate?.date.slice(0,7) || year+'-01';
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
const params = new URLSearchParams(location.search);
fillPeriods(params.get('period-filter') || '');
for (const id of ['type-filter','period-filter','from','to']) {
  if (params.has(id)) $(id).value = params.get(id);
  $(id).onchange = () => {
    if (id==='period-filter' && isYear($(id).value)) jumpYear($(id).value);
    render();
  };
}
if (isYear($('period-filter').value)) jumpYear($('period-filter').value);
$('reset').onclick = () => {
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
  renderEditor(true);
  $('event-form').elements.title.focus();
};
$('event-form').onsubmit = save;
document.addEventListener('click',event=>{
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
    fillTypes(params.get('type-filter') || $('type-filter').value);
    fillPeriods();
    render();
    try {
      catalog = await jsonApi('/api/catalog');
      $('catalog-menu').hidden = !isAdmin();
      fillTypes(params.get('type-filter') || $('type-filter').value);
      render();
    } catch (error) {
      if (error.status!==404) notice('Impossibile caricare gli elenchi di relatori e tipi di evento.');
    }
    canSave = mayEdit();
    $('new-event').disabled = !canSave;
    if (view==='agenda') render();
  } catch {
    notice('Impossibile caricare il calendario. Riprova tra poco.');
  }
}
load();
