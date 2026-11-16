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

export function agendaPdf(title,events) {
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
  let stream,y;
  function page() {
    if (stream) pages.push(stream);
    stream = '0.07 0.27 0.39 rg 0 742 595 100 re f\n'+
      text(44,805,'AGENDA RUCHHEIM',11,true,'0.84 0.92 0.97')+
      text(44,768,title,24,true,'1 1 1')+
      text(44,32,'Christliche Gemeinde Ruchheim',9)+text(523,32,String(pages.length+1),9);
    y=707;
  }
  function line(value,size=11,bold=false,offset=0) {
    for (const part of lines(value,495-offset,size,bold)) {
      if (y<62) page();
      stream += text(44+offset,y,part,size,bold);
      y-=size+5;
    }
  }
  page();
  if (!events.length) line('Nessun appuntamento con i filtri selezionati.');
  for (const event of events) {
    if (y<145) page();
    stream += '0.20 0.48 0.60 RG 1.5 w 44 '+(y+10)+' m 551 '+(y+10)+' l S\n';
    line(event.title,17,true);
    for (const [label,value] of event.fields) {
      if (!value?.trim()) continue;
      if (y<84) page();
      line(label,9,true);
      line(value,11,false,9);
      y-=4;
    }
    y-=18;
  }
  pages.push(stream);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  for (const [i,content] of pages.entries()) {
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(6+i*2)+' 0 R >>');
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
