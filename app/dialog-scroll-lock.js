// Shared by every native dialog, including those opened before the agenda loads.
let initialized=false;
export function initDialogScrollLock(){
 if(initialized)return;
 initialized=true;
 const start=()=>{
  let saved=null,touch=null;
  const bodyProps=['position','top','left','width','overflow','padding-right'];
  const htmlProps=['overflow','overscroll-behavior','scroll-behavior'];
  const capture=(element,props)=>props.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]);
  const restore=(element,values)=>values.forEach(([name,value,priority])=>value?element.style.setProperty(name,value,priority):element.style.removeProperty(name));
  function sync(){
   const open=document.querySelector('dialog[open]');
   if(open&&!saved){
    const body=document.body,html=document.documentElement;
    const gap=Math.max(0,window.innerWidth-html.clientWidth);
    const padding=parseFloat(window.getComputedStyle(body).paddingRight)||0;
    saved={x:window.scrollX,y:window.scrollY,body:capture(body,bodyProps),html:capture(html,htmlProps)};
    body.style.position='fixed';body.style.top=-saved.y+'px';body.style.left=-saved.x+'px';body.style.width='100%';body.style.overflow='hidden';
    if(gap)body.style.paddingRight=padding+gap+'px';
    html.style.overflow='hidden';html.style.overscrollBehavior='none';
   }else if(!open&&saved){
    const previous=saved;saved=null;touch=null;
    restore(document.body,previous.body);restore(document.documentElement,previous.html);
    // Avoid smooth scrolling when returning to the page's original position.
    document.documentElement.style.scrollBehavior='auto';
    window.scrollTo(previous.x,previous.y);
    const behavior=previous.html.find(([name])=>name==='scroll-behavior');
    restore(document.documentElement,[behavior]);
   }
  }
  const observer=new MutationObserver(records=>{
   if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches('dialog')||node.querySelector('dialog')))))sync();
  });
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});
  document.addEventListener('close',()=>queueMicrotask(sync),true);
  document.addEventListener('touchstart',event=>{
   touch=saved&&event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
  },{passive:true,capture:true});
  document.addEventListener('touchcancel',()=>{touch=null;},{passive:true,capture:true});
  document.addEventListener('touchend',()=>{touch=null;},{passive:true});
  document.addEventListener('touchmove',event=>{
   if(!saved||!touch||event.touches.length!==1)return;
   const point=event.touches[0],dx=point.clientX-touch.x,dy=point.clientY-touch.y;
   touch={x:point.clientX,y:point.clientY};
   const target=event.target.nodeType===1?event.target:event.target.parentElement;
   const dialog=target.closest('dialog[open]');
   if(!dialog){if(event.cancelable)event.preventDefault();return;}
   // Horizontal gestures remain available for event and calendar navigation.
   if(Math.abs(dx)>Math.abs(dy)*1.2||!dy)return;
   for(let node=target;node;node=node.parentElement){
    const style=window.getComputedStyle(node);
    if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1){
     const canScroll=dy>0?node.scrollTop>0:node.scrollTop+node.clientHeight<node.scrollHeight-1;
     if(canScroll)return;
    }
    if(node===dialog)break;
   }
   if(event.cancelable)event.preventDefault();
  },{passive:false,capture:true});
  sync();
 };
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
}
