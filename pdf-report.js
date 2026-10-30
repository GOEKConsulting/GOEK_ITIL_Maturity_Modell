/** Native A4 report: vector charts and selectable Helvetica text, with no browser print. */
const C={red:'#951E38',deep:'#601324',rose:'#AF3147',coral:'#EA4146',gray:'#606060',line:'#E6E6E5',soft:'#F8F8F7',ink:'#262426',white:'#FFFFFF'};
const W=210,H=297,M=15,CW=180,BOTTOM=277;
const PRACTICE_PITCH=8;
const number=new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validStage=value=>Number.isInteger(value)&&value>=0&&value<=5;
const exact=value=>finite(value)?number.format(value):'Noch offen';
const string=value=>String(value??'');
const rgb=value=>/^#[a-f\d]{6}$/i.test(value||'')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):[149,30,56];
const displayed=unit=>validStage(unit?.stage)?unit.stage:unit?.provisional&&validStage(unit.displayLevel)?unit.displayLevel:null;
const stageLabel=unit=>validStage(unit?.stage)?`Stufe ${unit.stage}`:unit?.provisional&&validStage(unit.displayLevel)?`Mindestens ${unit.displayLevel} (vorläufig)`:'Noch offen';
// Discretionary German compound boundaries. Original letters/case are retained;
// visible hyphens are added only when a name actually wraps at one of these points.
const nameParts=[
  ['Architektur','management'],['Konti','nuierliche'],['Informations','sicherheits','management'],
  ['Wissens','management'],['Bericht','erstattung'],['Organisa','torisches'],['Veränderungs','management'],
  ['Organisations','veränderungs','management'],['Portfolio','management'],['Projekt','management'],
  ['Beziehungs','management'],['Risiko','management'],['Finanz','management'],['Strategie','management'],
  ['Lieferanten','management'],['Talent','management'],['Verfügbarkeits','management'],['Anforderungs','analyse'],
  ['Leistungs','management'],['Änderungs','steuerung'],['Störungs','management'],['Ereignis','management'],
  ['Problem','management'],['Service','katalog','management'],['Konfigurations','management'],
  ['Kontinuitäts','management'],['Service','gestaltung'],['Service','anfragen','management'],
  ['Service','validierung'],['Bereitstellungs','management'],['Infra','struktur'],['Plattform','management'],
  ['Software','entwicklung'],
];
const nameBoundaries=new Map(nameParts.map(parts=>[parts.join('').toLocaleLowerCase('de-DE'),parts]));

export function createAssessmentPdf({model,jsPDF=globalThis.jspdf?.jsPDF,logoDataUrl=null}={}){
  if(typeof jsPDF!=='function')throw new Error('Die PDF-Bibliothek konnte nicht geladen werden.');
  if(!model||!Array.isArray(model.components)||model.components.length!==5)throw new Error('Für den PDF-Bericht werden die fünf SVS-Kategorien benötigt.');
  const doc=new jsPDF({format:'a4',orientation:'portrait',unit:'mm',compress:true,putOnlyUsedFonts:true});
  doc.setProperties({title:`SVS Assessment - ${string(model.projectName)}`,subject:'Ergebnisbericht des Service Value Systems',author:'GÖK Consulting',creator:'GÖK SVS Assessment'});
  doc.setLineHeightFactor(1.2);
  let y=0;
  const font=(size=9,style='normal',color=C.ink)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...rgb(color));};
  const text=(value,x,baseline,size=9,style='normal',color=C.ink,options={})=>{font(size,style,color);doc.text(string(value),x,baseline,options);};
  const lines=(value,width,size=9,style='normal')=>{font(size,style);return doc.splitTextToSize(string(value),width).map(string);};
  function practiceNameLines(value,width,size=8.5){
    font(size,'bold');const result=[];let current='';
    for(const word of string(value).split(/\s+/).filter(Boolean)){
      if(doc.getTextWidth(current?`${current} ${word}`:word)<=width){current=current?`${current} ${word}`:word;continue;}
      if(current){result.push(current);current='';}
      if(doc.getTextWidth(word)<=width){current=word;continue;}
      const breaks=new Set();let offset=0;
      for(const part of word.split('-')){
        const parts=nameBoundaries.get(part.toLocaleLowerCase('de-DE'));
        if(parts){let length=0;for(const segment of parts.slice(0,-1)){length+=segment.length;breaks.add(offset+length);}}
        offset+=part.length;
        if(offset<word.length){offset++;breaks.add(offset);}
      }
      breaks.add(word.length);let start=0;
      while(start<word.length){
        const end=[...breaks].filter(end=>end>start&&doc.getTextWidth(word.slice(start,end)+(end<word.length&&word[end-1]!=='-'?'-':''))<=width).sort((a,b)=>b-a)[0];
        if(end===undefined){current=word.slice(start);break;}
        const piece=word.slice(start,end)+(end<word.length&&word[end-1]!=='-'?'-':'');
        if(end===word.length)current=piece;else result.push(piece);
        start=end;
      }
    }
    if(current)result.push(current);return result.length?result:[''];
  }
  const compact=(value,width,size=9,maxLines=1,style='normal')=>{
    const all=lines(value,width,size,style),result=all.slice(0,maxLines);
    if(all.length>maxLines){let tail=result.at(-1)||'';font(size,style);while(tail&&doc.getTextWidth(tail+' ...')>width)tail=tail.slice(0,-1);result[result.length-1]=tail+' ...';}
    return result;
  };
  const rect=(x,top,width,height,fill)=>{doc.setFillColor(...rgb(fill));doc.rect(x,top,width,height,'F');};
  const rule=(x1,top,x2,color=C.line,width=.25)=>{doc.setDrawColor(...rgb(color));doc.setLineWidth(width);doc.setLineDashPattern([],0);doc.line(x1,top,x2,top);};
  const thresholdLine=(x1,top,x2)=>{
    rule(x1,top,x2,C.white,1.35);doc.setDrawColor(...rgb(C.deep));doc.setLineWidth(.5);doc.setLineDashPattern([1.8,1.1],0);doc.line(x1,top,x2,top);doc.setLineDashPattern([],0);
  };
  function hatch(x,top,width,height,color){
    rect(x,top,width,height,C.white);doc.setDrawColor(...rgb(color));doc.setLineWidth(.18);
    for(let k=-height;k<width;k+=3){const a=Math.max(0,-k),b=Math.min(height,width-k);if(a<=b)doc.line(x+k+a,top+height-a,x+k+b,top+height-b);}
    doc.setDrawColor(...rgb(color));doc.setLineWidth(.25);doc.rect(x,top,width,height,'S');
  }
  function cell(x,top,width,height,n,unit,color){
    const achieved=displayed(unit)!==null&&n<=displayed(unit);
    if(achieved&&unit.provisional)hatch(x,top,width,height,color);else rect(x,top,width,height,achieved?color:C.line);
    text(n,x+width/2,top+height/2+1.5,13,'bold',achieved&&!unit.provisional?C.white:achieved?color:'#A5A5A4',{align:'center'});
  }
  function brandHeader(first=false){
    rect(0,0,W,H,C.white);
    if(first){
      text('Service Value System',M,18,18,'bold',C.deep);
      text('Ergebnisbericht',M,24,9,'normal',C.gray);
      let hasLogo=false;
      if(logoDataUrl){try{const image=doc.getImageProperties(logoDataUrl),width=34,height=Math.min(17,width*image.height/image.width);doc.addImage(logoDataUrl,'PNG',W-M-width,9,width,height);hasLogo=true;}catch{ /* The text brand remains available if the optional image is invalid. */ }}
      if(!hasLogo)text('GÖK CONSULTING',W-M,18,11,'bold',C.red,{align:'right'});
      const project=compact(model.projectName||'Neue Bewertung',CW,11,2,'bold');
      project.forEach((line,index)=>text(line,M,32+index*4.5,11,'bold'));
      const organization=compact(model.organization||'Organisation noch nicht festgelegt',128,8.5);
      text(organization[0]||'',M,44,8.5,'normal',C.gray);
      text(model.date||'Datum noch offen',W-M,44,8.5,'normal',C.gray,{align:'right'});
      rule(M,48,W-M);y=52;
    }else{
      text('GÖK CONSULTING',M,16,10,'bold',C.red);
      text(compact(model.projectName||'SVS Assessment',113,8)[0]||'',W-M,16,8,'normal',C.gray,{align:'right'});
      rule(M,23,W-M);y=30;
    }
  }
  function newPage(){doc.addPage('a4','portrait');brandHeader();}
  function ensure(height){if(y+height>BOTTOM)newPage();}
  function paragraph(value,{size=9.5,style='normal',color=C.ink,leading=4.6,x=M,width=CW,gap=3}={}){
    for(const line of lines(value,width,size,style)){ensure(leading);text(line,x,y+size*.27,size,style,color);y+=leading;}
    y+=gap;
  }
  function heading(value,size=13){ensure(13);text(value,M,y+4,size,'bold',C.deep);y+=10;}

  function firstPage(){
    brandHeader(true);
    const gap=4,cardWidth=(CW-gap*2)/3;
    const cards=[
      ['Finale SVS-Stufe',validStage(model.svs?.stage)?string(model.svs.stage):'Offen',`Durchschnitt: ${exact(model.svs?.exact)}`],
      ['Kategorien eingestuft',`${model.counts?.categoriesWithStage??0} / 5`,'Gemeinsames Service Value System'],
      ['Practices eingestuft',`${model.counts?.practicesWithStage??0} / ${model.counts?.selectedPractices??0}`,'Im ausgewählten Bewertungsumfang'],
    ];
    cards.forEach(([label,value,note],index)=>{
      const x=M+index*(cardWidth+gap),dark=index===0;rect(x,y,cardWidth,28,dark?C.deep:C.soft);
      text(label,x+3,y+5,8,'normal',dark?C.white:C.gray);
      if(dark)lines('(Basierend auf niedrigster erreichter Bewertung SVS-Kategorie)',cardWidth-6,6.2).forEach((line,j)=>text(line,x+3,y+9+j*2.4,6.2,'normal',C.white));
      text(value,x+3,y+20,17,'bold',dark?C.white:C.deep);
      text(note,x+3,y+25,7.1,'normal',dark?C.white:C.gray);
    });
    text('Reifegradprofil des SVS',M,87,12,'bold',C.deep);
    const chartX=43,chartW=124,roofY=93,top=101,pitch=13.2,columnW=chartW/5;
    doc.setFillColor(...rgb(C.line));doc.triangle(chartX,roofY+7,chartX+chartW/2,roofY,chartX+chartW,roofY+7,'F');
    for(let n=5;n>=1;n--)text(`Stufe ${n}`,M,top+(5-n)*pitch+7.6,8.2,'normal',C.gray);
    model.components.forEach((unit,index)=>{
      const x=chartX+index*columnW,color=unit.color||C.red;
      for(let n=5;n>=1;n--)cell(x+.45,top+(5-n)*pitch,columnW-.9,pitch-.8,n,unit,color);
      const captionTop=top+5*pitch+1.5;rect(x+.45,captionTop,columnW-.9,17,color);
      const caption=lines(unit.label,columnW-2.5,7.7,'bold');
      caption.forEach((line,j)=>text(line,x+columnW/2,captionTop+4+j*3.5,7.7,'bold',C.white,{align:'center'}));
      text(validStage(unit.stage)?`Stufe ${unit.stage}`:unit.provisional?`Mindestens ${unit.displayLevel}`:'Noch offen',x+columnW/2,captionTop+22,7.1,'normal',C.gray,{align:'center'});
    });
    if(validStage(model.svs?.stage)){
      const lineY=top+(5-model.svs.stage)*pitch;thresholdLine(chartX,lineY,chartX+chartW);
      rect(171,lineY-5.5,24,11,C.red);text('Finale SVS-Stufe',183,lineY-1.4,6.6,'normal',C.white,{align:'center'});text(model.svs.stage,183,lineY+3.2,11,'bold',C.white,{align:'center'});
    }
    text('Bewertung der Kategorien',M,197,11,'bold',C.deep);
    const widths=[100,45,35],xs=[M,M+100,M+145];let tableY=202;
    rect(M,tableY,CW,7,C.soft);
    ['Kategorie','Durchschnitt','Stufe'].forEach((label,index)=>text(label,index===1?xs[index]+widths[index]/2:xs[index]+2,tableY+4.8,8,'bold',C.gray,index===1?{align:'center'}:{}));tableY+=7;
    model.components.forEach((unit,index)=>{
      if(index%2===1)rect(M,tableY,CW,6.8,C.soft);
      rect(M,tableY,1,6.8,unit.color||C.red);
      text(unit.label,M+3,tableY+4.5,8.7);
      text(finite(unit.exact)?exact(unit.exact):'Offen',xs[1]+widths[1]/2,tableY+4.5,8.5,'normal',C.ink,{align:'center'});
      text(validStage(unit.stage)?unit.stage:unit.provisional&&validStage(unit.displayLevel)?`mind. ${unit.displayLevel}`:'Offen',xs[2]+2,tableY+4.5,8.5);
      rule(M,tableY+6.8,W-M);tableY+=6.8;
    });
    rect(M,tableY,CW,8,C.deep);text('Service Value System',M+3,tableY+5.3,9,'bold',C.white);
    text(finite(model.svs?.exact)?exact(model.svs.exact):'Offen',xs[1]+widths[1]/2,tableY+5.3,9,'bold',C.white,{align:'center'});
    text(validStage(model.svs?.stage)?model.svs.stage:'Offen',xs[2]+2,tableY+5.3,9,'bold',C.white);
    y=tableY+14;
    paragraph(`Begrenzende Kategorien: ${(model.svs?.limitingLabels||[]).join(', ')||'Noch offen'}`,{size:8,leading:3.8,gap:1});
    paragraph('Durchschnitt: Mittelwert der Kategorie-Werte. Finale SVS-Stufe: niedrigste Kategorie-Stufe.',{size:8,leading:3.8,gap:1});
    if(model.isDemo)paragraph('Synthetische Beispieldaten - keine Unternehmensbewertung.',{size:8,color:C.red,leading:3.8,gap:0});
  }

  function improvementLayout(item,index,width,size){
    const compactSpacing=size<9.5;
    const innerWidth=width-9,titleSize=Math.max(11,Math.min(12,size+1.2)),titleLeading=titleSize*.352778*1.12;
    const metadataSize=Math.max(8.5,Math.min(9.2,size-.4)),metadataLeading=metadataSize*.352778*1.18;
    const title=lines(item.title,innerWidth,titleSize,'bold');
    const context=[item.componentLabel||''];
    for(const value of [item.practiceLabel,item.psfLabel])if(value&&!string(item.title).includes(value))context.push(value);
    const stageType=item.psfId?'PSF-Stufe ':'Kategorie-Stufe ';
    if(validStage(item.currentLevel)&&validStage(item.targetLevel))context.push(stageType+item.currentLevel+' auf '+item.targetLevel);
    else if(validStage(item.targetLevel))context.push('Ziel: '+stageType+item.targetLevel);
    const metadata=lines(context.filter(Boolean).join(' · '),innerWidth,metadataSize);
    const labelSize=Math.max(8.5,Math.min(9.4,size-.4)),labelLeading=labelSize*.352778*1.18;
    const blocks=[['action','Maßnahme',item.actionText],['reason','Begründung',item.reason],['effect','Wirkung',item.effectText],
      ['requirements','Weitere Voraussetzungen',item.otherRequirements]]
      .filter(([, ,value])=>string(value).trim()).map(([kind,label,value])=>{
        const action=kind==='action',padding=action?(compactSpacing?2:2.7):0,bodySize=action?Math.max(9,size+.3):size;
        const style=action?'bold':'normal',leading=bodySize*.352778*(compactSpacing?1.15:1.2);
        const body=lines(value,innerWidth-padding*2,bodySize,style);
        const height=padding*2+labelLeading+.7+body.length*leading;
        return {kind,label,lines:body,size:bodySize,style,leading,padding,height};
      });
    const blockGap=compactSpacing?2.4:3.5,bodyGap=compactSpacing?2:3,bottomGap=compactSpacing?3:4;
    return {item,index,width,size,titleSize,titleLeading,title,metadata,metadataSize,metadataLeading,labelSize,labelLeading,blocks,blockGap,bodyGap,bottomGap};
  }
  function alignedImprovementRow(cards){
    const first=cards[0],titleHeight=Math.max(...cards.map(card=>card.title.length*card.titleLeading));
    const metadataHeight=Math.max(...cards.map(card=>card.metadata.length*card.metadataLeading));
    let cursor=11+titleHeight+metadataHeight+first.bodyGap;
    const slots=['action','reason','effect','requirements'].filter(kind=>cards.some(card=>card.blocks.some(block=>block.kind===kind))).map(kind=>{
      const height=Math.max(...cards.map(card=>card.blocks.find(block=>block.kind===kind)?.height||0));
      const slot={kind,top:cursor,height};cursor+=height+first.blockGap;return slot;
    });
    return {titleHeight,metadataHeight,slots,height:cursor-(slots.length?first.blockGap:0)+first.bottomGap};
  }
  function improvements(){
    const section=model.improvements,items=(section?.items||[]).slice(0,4);
    if(!items.length)return;
    newPage();heading('Wichtigste Verbesserungen',15);
    if(section.summary)paragraph(section.summary,{size:9,leading:3.9,gap:1.5});
    const top=y,gap=6,columnWidth=(CW-gap)/2;
    const rows=items.length===1?[[0]]:items.length===2?[[0,1]]:items.length===3?[[0,1],[2]]:[[0,1],[2,3]];
    let layout,rowLayouts,rowHeights;
    for(const size of [10.5,10,9.5,9,8.5]){
      layout=items.map((item,index)=>improvementLayout(item,index,rows.find(row=>row.includes(index)).length===1?CW:columnWidth,size));
      rowLayouts=rows.map(row=>alignedImprovementRow(row.map(index=>layout[index])));
      rowHeights=rowLayouts.map(row=>row.height);
      if(top+rowHeights.reduce((sum,height)=>sum+height,0)+gap*(rows.length-1)<=BOTTOM)break;
    }
    if(top+rowHeights.reduce((sum,height)=>sum+height,0)+gap*(rows.length-1)>BOTTOM)
      throw new Error('Die vollständigen Verbesserungsvorschläge passen bei lesbarer Schrift nicht auf eine A4-Seite.');
    if(items.length===4){
      const extra=(BOTTOM-top-gap-rowHeights.reduce((sum,height)=>sum+height,0))/2;
      rowHeights=rowHeights.map(height=>height+extra);
    }
    rows.forEach((row,rowIndex)=>{
      const start=y,height=rowHeights[rowIndex],rowLayout=rowLayouts[rowIndex];
      row.forEach((index,column)=>{
        const card=layout[index],x=M+column*(columnWidth+gap),left=x+4.5;
        rect(x,start,card.width,height,C.white);
        doc.setDrawColor(...rgb('#D7D7D5'));doc.setLineWidth(.3);doc.rect(x,start,card.width,height,'S');
        rect(x,start,card.width,7.5,'#F4F4F3');
        text(String(index+1).padStart(2,'0'),left,start+5.1,9,'bold',C.red);
        if(card.item.isPracticeFocus){
          const focus='Practice-Fokus'+(validStage(card.item.practiceStage)?` · Practice-Stufe ${card.item.practiceStage}`:'');
          text(focus,x+card.width-4.5,start+5.1,8.5,'bold',C.gray,{align:'right'});
        }
        let baseline=start+11;
        card.title.forEach(line=>{text(line,left,baseline+card.titleSize*.27,card.titleSize,'bold',C.deep);baseline+=card.titleLeading;});
        baseline=start+11+rowLayout.titleHeight;
        card.metadata.forEach(line=>{text(line,left,baseline+card.metadataSize*.27,card.metadataSize,'normal',C.gray);baseline+=card.metadataLeading;});
        rowLayout.slots.forEach((slot,index)=>{
          const block=card.blocks.find(block=>block.kind===slot.kind);if(!block)return;
          baseline=start+slot.top;
          if(index&&rowLayout.slots.slice(0,index).some(previous=>card.blocks.some(block=>block.kind===previous.kind)))
            rule(left,baseline-card.blockGap+1.2,x+card.width-4.5,C.line,.2);
          if(block.kind==='action'){
            rect(left,baseline,card.width-9,slot.height,'#F5F5F4');
            doc.setDrawColor(...rgb('#D7B4BF'));doc.setLineWidth(.2);doc.rect(left,baseline,card.width-9,slot.height,'S');
          }
          const inset=left+block.padding;
          baseline+=block.padding;
          text(block.label,inset,baseline+card.labelSize*.27,card.labelSize,'bold',block.kind==='action'?C.red:block.kind==='reason'?C.gray:C.ink);
          baseline+=card.labelLeading+.7;
          block.lines.forEach(line=>{text(line,inset,baseline+block.size*.27,block.size,block.style,block.kind==='reason'?C.gray:C.ink);baseline+=block.leading;});
          baseline+=block.padding;
        });
      });
      y=start+height+gap;
    });
  }

  function practiceChunk(group,offset){
      let count=Math.min(6,group.entries.length-offset),chunk,geometry;
      do{
        chunk=group.entries.slice(offset,offset+count);
        const columnW=(CW-12)/count;
        const names=chunk.map(entry=>practiceNameLines(entry.label,columnW-3));
        const states=chunk.map(entry=>lines(stageLabel(entry),columnW-3,8));
        const nameHeight=Math.max(...names.map(n=>n.length))*3.8,stateHeight=Math.max(...states.map(n=>n.length))*3.7;
        geometry={columnW,names,states,nameHeight,stateHeight,height:1+5*PRACTICE_PITCH+10.4+nameHeight+stateHeight};
        font(8.5,'bold');const namesFit=names.every(name=>name.every(line=>doc.getTextWidth(line)<=columnW-3+.01));
        if((geometry.height<=224&&namesFit)||count===1)break;
        count--;
      }while(count>0);
      return {chunk,geometry,count};
  }
  function practiceChunks(group){
    let offset=0;
    while(offset<group.entries.length){
      const {chunk,geometry,count}=practiceChunk(group,offset);
      if(y+geometry.height+4.5>BOTTOM)newPage();
      drawPracticeChunk(group,chunk,geometry);
      offset+=count;y+=4.5;
    }
  }
  const practiceTitle=group=>({primary:'Schlüsselpractices',supporting:'Unterstützende Practices',unassigned:'Rolle noch offen'}[group.role]||'Rolle noch offen');
  function drawPracticeChunk(group,entries,g){
    const color=group.color||C.gray,chartX=M+12,top=y+1,pitch=PRACTICE_PITCH,bottom=top+5*pitch;

    for(let n=5;n>=1;n--)text(n,M+4,top+(5-n)*pitch+pitch/2+1.3,8,'normal',C.gray,{align:'center'});
    entries.forEach((entry,index)=>{
      const x=chartX+index*g.columnW;
      for(let n=5;n>=1;n--)cell(x+.45,top+(5-n)*pitch,g.columnW-.9,pitch-.8,n,entry,color);
    });
    if(g.height>224&&entries.length===1){
      y=bottom+5;for(const line of practiceNameLines(entries[0].label,CW,9.5)){ensure(4.6);text(line,M,y+3,9.5,'bold');y+=4.6;}paragraph(`${entries[0].id} - ${stageLabel(entries[0])} - Durchschnitt: ${exact(entries[0].exact)}`,{size:9});return;
    }
    entries.forEach((entry,index)=>{
      const center=chartX+(index+.5)*g.columnW;
      g.names[index].forEach((line,j)=>text(line,center,bottom+4+j*3.8,8.5,'bold',C.ink,{align:'center'}));
      const idTop=bottom+4+g.nameHeight+.2;text(entry.id,center,idTop,7.5,'normal',C.gray,{align:'center'});
      g.states[index].forEach((line,j)=>text(line,center,idTop+4+j*3.7,8,'normal',entry.provisional?C.gray:C.ink,{align:'center'}));
      text(`Durchschnitt: ${finite(entry.exact)?exact(entry.exact):'offen'}`,center,idTop+4.7+g.stateHeight,7.4,'normal',C.gray,{align:'center'});
    });
    y+=g.height;
  }
  function practices(){
    const groups=(model.practiceGroups||[]).filter(group=>Array.isArray(group.entries)&&group.entries.length);
    if(!groups.length)return;
    groups.forEach((group,index)=>{
      const firstHeight=practiceChunk(group,0).geometry.height;
      if(index===0||y+10+firstHeight+4.5>BOTTOM)newPage();
      heading(practiceTitle(group),12);practiceChunks(group);
    });
  }

  firstPage();improvements();practices();
  const pageCount=doc.getNumberOfPages();
  for(let page=1;page<=pageCount;page++){
    doc.setPage(page);rule(M,282,W-M);text('GÖK CONSULTING',M,288,7.5,'bold',C.red);text(`SVS Assessment - ${page} / ${pageCount}`,W-M,288,7.5,'normal',C.gray,{align:'right'});
  }
  return doc;
}
