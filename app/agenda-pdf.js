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
  const icons = {
    'Data':'1 1 11 10 re 1 8 m 12 8 l 4 10 m 4 13 l 9 10 m 9 13 l',
    'Orario':'6.5 1 m 9.54 1 12 3.46 12 6.5 c 12 9.54 9.54 12 6.5 12 c 3.46 12 1 9.54 1 6.5 c 1 3.46 3.46 1 6.5 1 c 6.5 10 m 6.5 6.5 l 9 5 l',
    'Luogo':'6.5 0.8 m 6.5 0.8 2 5.5 2 8 c 2 14 11 14 11 8 c 11 5.5 6.5 0.8 6.5 0.8 c 5.5 7 m 7.5 7 l',
    'Guida/Conduzione':'4.5 8 4 4 re 2 2 m 2 6 l 11 6 l 11 2 l',
    'Relatore':'4.5 8 4 4 re 2 2 m 2 6 l 11 6 l 11 2 l',
    'Checklist':'1 1 11 11 re 3 6 m 5.5 3.5 l 10 9 l'
  };
  const pageWidth=420,pageHeight=595,margin=26;
  const titleLines=lines(title,278,22,true);
  const titleFits=titleLines.length<=3;
  let stream,y;
  function page() {
    if (stream) pages.push(stream);
    const headerLines=pages.length || !titleFits
      ? [single?'Agenda della comunità':title] : titleLines;
    const headerBottom=pageHeight-75-(headerLines.length-1)*25;
    const logoHeight=Math.round(62*logoCanvas.height/logoCanvas.width);
    stream='0.94 0.97 0.99 rg 0 '+headerBottom+' '+pageWidth+' '+(pageHeight-headerBottom)+' re f\n'+
      'q 62 0 0 '+logoHeight+' 330 '+(pageHeight-37-Math.round(logoHeight/2))+' cm /Logo Do Q\n'+
      text(margin,568,'AGENDA RUCHHEIM',10,true,'0.12 0.37 0.50')+
      headerLines.map((part,i)=>text(margin,538-i*25,part,22,true)).join('')+
      text(margin,22,'Christliche Gemeinde Ruchheim',9)+text(384,22,String(pages.length+1),9);
    y=headerBottom-23;
  }
  function write(value,x,width,size,bold,color) {
    for (const part of lines(value,width,size,bold)) {
      if (y<51) page();
      stream+=text(x,y,part,size,bold,color);
      y-=size+5;
    }
  }
  page();
  if (!events.length) write('Nessun appuntamento con i filtri selezionati.',margin,368,13);
  for (const event of events) {
    if (y<130) page();
    if (!single || !titleFits) {
      write(event.title,margin,368,18,true,'0.08 0.28 0.40');
      y-=3;
    }
    for (const [label,value] of event.fields) {
      const keepEmpty=!single && ['Guida/Conduzione','Relatore'].includes(label);
      if (!value?.trim() && !keepEmpty) continue;
      if (y<76) page();
      const path=icons[label];
      if (path) stream+='q 0.12 0.37 0.50 RG 1 w 1 0 0 1 '+margin+' '+(y-2)+' cm '+path+' S Q\n';
      stream+=text(margin+(path?18:0),y,label,11,true,'0.20 0.34 0.43');
      const wide=['Descrizione','Materiali e link','Checklist'].includes(label);
      if (wide) y-=17;
      write(value || '',wide?margin:155,wide?368:239,13);
    }
    y-=20;
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
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents '+(7+i*2)+' 0 R >>');
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
