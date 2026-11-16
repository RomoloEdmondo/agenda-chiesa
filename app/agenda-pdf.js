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

export function agendaPdf(title,events) {
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
  let stream,y;
  function page() {
    if (stream) pages.push(stream);
    const logoHeight = Math.round(90*logoCanvas.height/logoCanvas.width);
    stream = '0.94 0.97 0.99 rg 0 747 595 95 re f\n'+
      '1 1 1 rg 457 758 102 72 re f\n'+
      'q 90 0 0 '+logoHeight+' 463 '+(794-Math.round(logoHeight/2))+' cm /Logo Do Q\n'+
      text(36,805,'AGENDA RUCHHEIM',10,true,'0.12 0.37 0.50')+
      text(36,769,title,23,true)+
      text(36,28,'Christliche Gemeinde Ruchheim',9)+text(541,28,String(pages.length+1),9);
    y=720;
  }
  function write(value,x,width,size,bold,color) {
    for (const part of lines(value,width,size,bold)) {
      if (y<58) page();
      stream += text(x,y,part,size,bold,color);
      y-=size+4;
    }
  }
  page();
  if (!events.length) write('Nessun appuntamento con i filtri selezionati.',36,523,11);
  for (const event of events) {
    if (y<145) page();
    write(event.title,36,523,16,true,'0.08 0.28 0.40');
    y-=3;
    for (const [label,value] of event.fields) {
      if (!value?.trim()) continue;
      if (y<76) page();
      stream += text(36,y,label,9,true,'0.28 0.40 0.49');
      write(value,134,425,10.5);
    }
    y-=17;
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
