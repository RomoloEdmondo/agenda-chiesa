import {apiFetch, mayEdit} from './session.js';
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
  const speaker = $('speaker-filter').value;
  const period = $('period-filter').value;
  const from = $('from').value;
  const to = $('to').value;
  const end = event.end || event.date;
  if (type && event.type !== type) return false;
  if (speaker && !speakers(event).includes(speaker)) return false;
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
  const notes = [event.time,event.place,event.speaker].filter(Boolean).join(' · ');
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
      '<button type="button" class="chip" data-type="'+escape(e.type)+'" data-event="'+escape(e.id)+'" title="'+escape(e.title)+'" aria-label="'+
      escape(e.title+' · '+format(date,{day:'numeric',month:'long'}))+'">'+escape(e.title)+'</button>').join('');
    return '<div class="day'+(date===today?' today':'')+'"><span class="day-number"'+(date===today?' aria-current="date"':'')+'>'+day+'</span>'+chips+'</div>';
  }).join('');
  $('month-events').innerHTML = monthEvents.length ? monthEvents.map(e=>eventButton(e,Number(e.date.slice(8))+' '+format(e.date,{month:'short'})+' · '+e.title)).join('') : '<span>Nessun appuntamento nel mese selezionato.</span>';
  const upcoming = list.filter(e=>e.date && (e.end||e.date)>=today && !closed(e));
  const pending = list.filter(e=>!e.date && !closed(e));
  $('upcoming').innerHTML = (upcoming.slice(0,showAll?upcoming.length:5).map(e=>row(e)).join('') || empty('Nessun prossimo appuntamento con questi filtri.')) + pending.map(e=>row(e)).join('');
  $('more').hidden = upcoming.length<=5;
  $('more').textContent = showAll?'Mostra meno ↑':'Mostra tutti gli appuntamenti →';
}

function renderPrep(list) {
  const pending = list.filter(e=>!closed(e) && (!e.date || (e.end||e.date)>=today || $('period-filter').value==='past'))
    .map(event=>({event,tasks:event.tasks.filter(task=>!task.done)})).filter(item=>item.tasks.length || item.event.status!=='Pronto');
  const total = pending.reduce((sum,item)=>sum+item.tasks.length,0);
  $('prep').innerHTML = '<div class="panel-head"><div><h2>Attività da preparare</h2><p class="muted">'+total+' attività aperte · '+pending.length+' appuntamenti da seguire</p></div></div>'+
    (pending.length ? '<div class="prep-list">'+pending.map(({event,tasks})=>'<article class="prep-card">'+eventButton(event,event.title)+
      '<p class="muted">'+escape(dateLabel(event)+' · '+event.status+(event.responsible?' · '+event.responsible:''))+'</p>'+
      (tasks.length?'<ul>'+tasks.map(task=>'<li>'+escape(task.label)+'</li>').join('')+'</ul>':'')+'</article>').join('')+'</div>' : empty('Nessuna attività aperta con questi filtri.'));
}

function renderTeam(list) {
  $('team').innerHTML = '<div class="panel-head"><div><h2>Programma per il team</h2><p class="muted">'+list.length+' appuntamenti · Christliche Gemeinde Ruchheim</p></div>'+
    '<div class="team-actions"><button class="primary" id="copy-link">Copia link</button><button class="plain" id="print">Stampa / PDF</button></div></div>'+
    (list.map(event=>row(event,true)).join('') || empty('Nessun appuntamento con questi filtri.'));
  $('copy-link').onclick = async () => {
    const link = new URL(location.href);
    for (const id of ['type-filter','speaker-filter','period-filter','from','to']) {
      if ($(id).value) link.searchParams.set(id,$(id).value);
      else link.searchParams.delete(id);
    }
    link.hash = 'team';
    try { await navigator.clipboard.writeText(link.href); notice('Link copiato. Si apre per chi ha accesso al Site.'); }
    catch { window.prompt('Copia il link della vista team',link.href); }
  };
  $('print').onclick = () => window.print();
}

function render() {
  const list = sorted(events.filter(matches));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view));
  for (const name of ['agenda','prep','team']) $(name).hidden = name!==view;
  $('new-event').hidden = view==='team' || !mayEdit();
  $('date-filters').hidden = $('period-filter').value!=='custom';
  const titles = {
    agenda:['Agenda della comunità','Appuntamenti e preparazione del programma della comunità.'],
    prep:['Preparazione','Checklist e responsabilità per gli appuntamenti in programma.'],
    team:['Vista team','Programma della comunità in sola lettura.']
  };
  $('page-title').textContent = titles[view][0];
  $('page-subtitle').textContent = titles[view][1];
  if (view==='agenda') renderCalendar(list);
  if (view==='prep') renderPrep(list);
  if (view==='team') renderTeam(list);
}

function notice(message) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
}

function fillSpeakers(selected=$('speaker-filter').value) {
  const names = [...new Set(events.flatMap(speakers))].sort((a,b)=>a.localeCompare(b,'it'));
  $('speaker-filter').innerHTML = option('','Tutti i relatori')+names.map(name=>option(name,name,name===selected)).join('');
}

const fields = [
  ['title','Titolo','text'],['type','Tipo di evento','select'],['date','Data di inizio','date'],
  ['end','Data di fine','date'],['time','Orario (Berlino)','time'],['place','Luogo','text'],
  ['responsible','Responsabili','text'],['speaker','Relatore o relatori','text'],
  ['status','Stato di preparazione','select'],['description','Descrizione','textarea'],['materials','Materiali e link','textarea']
];

function openEditor(event) {
  const readOnly = view==='team' || !canSave;
  active = event || {id:crypto.randomUUID(),revision:0,title:'',type:'Culto',status:'Da preparare',date:'',end:'',time:'',place:'',speaker:'',responsible:'',description:'',materials:'',tasks:[{label:'Definire i responsabili',done:false}]};
  $('edit-title').textContent = active.title || 'Nuovo evento';
  $('form-message').textContent = '';
  $('save').hidden = readOnly;
  if (readOnly) {
    $('details').innerHTML = '<dl class="readonly">'+fields.map(([key,label])=>'<div><dt>'+escape(label)+'</dt><dd>'+
      escape((['date','end'].includes(key)&&active[key]?format(active[key],{day:'numeric',month:'long',year:'numeric'}):active[key]) || 'Da definire')+'</dd></div>').join('')+
      '</dl><h3>Checklist</h3><ul>'+active.tasks.map(t=>'<li>'+ (t.done?'✓ ':'○ ')+escape(t.label)+'</li>').join('')+'</ul>';
  } else {
    $('details').innerHTML = '<div class="fields">'+fields.map(([key,label,kind])=>{
      const value = escape(active[key]);
      const field = kind==='select' ? '<select name="'+key+'">'+(key==='type'?types:statuses).map(v=>option(v,v,v===active[key])).join('')+'</select>'
        : kind==='textarea' ? '<textarea rows="3" maxlength="5000" name="'+key+'">'+value+'</textarea>'
        : '<input name="'+key+'" type="'+kind+'" value="'+value+'" '+(key==='title'?'required ':'')+(kind==='date'?'min="0001-01-01" max="9999-12-31"':'maxlength="5000"')+'>';
      return '<label class="'+(kind==='textarea'?'wide':'')+'">'+label+field+'</label>';
    }).join('')+'</div><section class="tasks"><h3>Checklist</h3><div id="task-list"></div><button type="button" class="plain" id="add-task">＋ Aggiungi attività</button></section>';
    for (const task of active.tasks) addTask(task);
    $('add-task').onclick = () => {
      if ($('task-list').children.length<80) addTask({label:'',done:false}).focus();
    };
  }
  $('editor').showModal();
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
    fillSpeakers();
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
$('type-filter').innerHTML += types.map(type=>option(type)).join('');
fillSpeakers();
const params = new URLSearchParams(location.search);
fillPeriods(params.get('period-filter') || '');
for (const id of ['type-filter','speaker-filter','period-filter','from','to']) {
  if (params.has(id)) $(id).value = params.get(id);
  $(id).onchange = () => {
    if (id==='period-filter' && isYear($(id).value)) jumpYear($(id).value);
    render();
  };
}
if (isYear($('period-filter').value)) jumpYear($('period-filter').value);
$('reset').onclick = () => {
  for (const id of ['type-filter','speaker-filter','period-filter','from','to']) $(id).value='';
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
$('event-form').onsubmit = save;
document.addEventListener('click',event=>{
  const control = event.target.closest('button[data-view],button[data-event]');
  if (!control) return;
  if (control.dataset.view) {
    const target = new URL(location.href);
    target.search = '';
    target.hash = control.dataset.view;
    history.replaceState(null,'',target);
    selectView();
  }
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
    canSave = mayEdit();
    $('new-event').disabled = !canSave;
    fillSpeakers(params.get('speaker-filter') || $('speaker-filter').value);
    fillPeriods();
    render();
  } catch {
    notice('Impossibile caricare il calendario. Riprova tra poco.');
  }
}
load();
