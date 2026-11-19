// PDF with selectable text and standard Helvetica fonts.
const extended = '€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ';
function pdfString(text) {
  return Array.from(text.normalize('NFC'),char=>{
    const cp = char.codePointAt(0);
    if (cp>=32 && cp<127) return /[\\()]/.test(char) ? '\\'+char : char;
    const index = extended.indexOf(char);
    const byte = cp>=160 && cp<=255 ? cp : index>=0 ? 128+index : 63;
    return '\\'+byte.toString(8).padStart(3,'0');
  }).join('');
}

const logo = new Image();
logo.src = new URL('./logo-ruchheim.webp',import.meta.url).href;

export function pdfLogoReady() {
  return logo.complete && logo.naturalWidth ? null : logo.decode();
}

export function agendaPdf(title,events,{single=false}={}) {
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 300;
  logoCanvas.height = Math.round(300*logo.naturalHeight/logo.naturalWidth);
  const logoContext = logoCanvas.getContext('2d');
  logoContext.fillStyle = '#fff';
  logoContext.fillRect(0,0,logoCanvas.width,logoCanvas.height);
  logoContext.drawImage(logo,0,0,logoCanvas.width,logoCanvas.height);
  const logoData = Array.from(atob(logoCanvas.toDataURL('image/jpeg',.92).split(',')[1]),
    char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>';
  const pages = [];
  const measure = document.createElement('canvas').getContext('2d');
  const text = (x,y,value,size=11,bold=false,color='0.13 0.21 0.28') =>
    color+' rg BT /F'+(bold?2:1)+' '+size+' Tf '+x+' '+y+' Td ('+pdfString(value)+') Tj ET\n';
  function lines(value,width,size,bold) {
    measure.font = (bold?'bold ':'')+size+'px Arial';
    return value.split(/\r?\n/).flatMap(paragraph=>{
      const output=[];
      let line='';
      for (const word of paragraph.trim().split(/\s+/)) {
        const next = line ? line+' '+word : word;
        if (measure.measureText(next).width <= width) { line=next; continue; }
        if (line) output.push(line);
        line='';
        for (const char of word) {
          if (measure.measureText(line+char).width > width) { output.push(line); line=''; }
          line+=char;
        }
      }
      return [...output,line];
    });
  }
  const pageWidth=595,pageHeight=842,margin=36,contentWidth=523;
  const titleLines=lines(title,422,18,true);
  let stream='',y=0;
  function page() {
    if (stream) pages.push(stream);
    stream='0.95 0.97 0.99 rg 0 766 595 76 re f\n'+
      'q 48 0 0 '+Math.round(48*logoCanvas.height/logoCanvas.width)+' 511 782 cm /Logo Do Q\n'+
      text(margin,817,'AGENDA RUCHHEIM',8,true,'0.25 0.38 0.50')+
      text(margin,790,titleLines[0] || 'Programma della comunità',18,true,'0.12 0.24 0.36')+
      text(margin,22,'Christliche Gemeinde Ruchheim',8,false,'0.40 0.47 0.55')+
      text(542,22,String(pages.length+1),8,false,'0.40 0.47 0.55');
    y=750;
  }
  function eventBlock(event) {
    let commands='',offset=0;
    function row(value,x,width,size=9.5,bold=false,color='0.20 0.28 0.36') {
      const parts=lines(String(value),width,size,bold);
      for(const part of parts) {
        commands+=text(x,-offset,part,size,bold,color);
        offset+=size+3;
      }
    }
    row(event.title,margin+10,contentWidth-20,13,true,'0.12 0.27 0.40');
    offset+=2;
    const summary=event.fields.filter(([key,value])=>['Tipo evento','Data','Orario'].includes(key)&&value?.trim())
      .map(([,value])=>value).join('  ·  ');
    if(summary) row(summary,margin+10,contentWidth-20,9,false,'0.35 0.45 0.55');
    offset+=5;
    for(const [label,value] of event.fields) {
      if(['Tipo evento','Data','Orario'].includes(label)) continue;
      const keepEmpty=!single && ['Guida/Conduzione','Relatore'].includes(label);
      if(!value?.trim()&&!keepEmpty) continue;
      const wide=['Descrizione','Materiali e link','File','Checklist'].includes(label);
      const displayLabel=label==='Guida/Conduzione'?'Conduzione':label;
      if(wide) {
        offset+=3;
        row(displayLabel,margin+10,contentWidth-20,8,true,'0.39 0.48 0.57');
        row(value || 'Da definire',margin+10,contentWidth-20,9.5);
      } else {
        commands+=text(margin+10,-offset,displayLabel,8.5,true,'0.39 0.48 0.57');
        row(value || 'Da definire',margin+123,contentWidth-133,9.5);
      }
    }
    offset+=9;
    // Every event is laid out before pagination and drawn as one indivisible block.
    const decoration='0.83 0.88 0.93 RG 0.5 w '+margin+' '+(-offset)+' m '+(pageWidth-margin)+' '+(-offset)+' l S\n'+
      '0.31 0.48 0.63 RG 2 w '+margin+' 9 m '+margin+' -9 l S\n';
    return {commands:decoration+commands,height:offset+14};
  }
  page();
  if(!events.length) stream+=text(margin,y,'Nessun appuntamento con i filtri selezionati.',10);
  for(const event of events) {
    const block=eventBlock(event);
    const available=750-48;
    const scale=Math.min(1,available/block.height);
    const height=block.height*scale;
    if(y-height<48) page();
    // Exceptionally long events shrink together, preserving all text on one page.
    stream+='q 1 0 0 1 '+margin+' '+y+' cm '+scale+' 0 0 '+scale+' '+(-margin*scale)+' 0 cm\n'+block.commands+'Q\n';
    y-=height;
  }
  pages.push(stream);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(6+i*2)+' 0 R').join(' ')+'] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  objects.push('<< /Type /XObject /Subtype /Image /Width '+logoCanvas.width+' /Height '+logoCanvas.height+
    ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '+logoData.length+
    ' >>\nstream\n'+logoData+'\nendstream');
  for (const [i,content] of pages.entries()) {
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents '+(7+i*2)+' 0 R >>');
    objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'endstream');
  }
  let output='%PDF-1.4\n';
  const offsets=[];
  for (const [i,object] of objects.entries()) {
    offsets.push(output.length);
    output+=(i+1)+' 0 obj\n'+object+'\nendobj\n';
  }
  const start=output.length;
  output+='xref\n0 '+(offsets.length+1)+'\n0000000000 65535 f \n'+
    offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+
    'trailer\n<< /Size '+(offsets.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
  return new Blob([output],{type:'application/pdf'});
}
