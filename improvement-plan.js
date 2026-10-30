/** Conditional improvement suggestions; never changes answers, scores or actions. */
import {COMPONENTS} from './model.js';
import {selectedPracticeIds} from './catalogs.js';
import {ladder} from './scoring.js';
import {improvementStage} from './improvement-selection.js';

const ranks={svs:0,next_level:1,development:2};
const isLevel=n=>Number.isInteger(n)&&n>=0&&n<=5;
const unique=values=>[...new Set(values)];
const state=response=>response?.review_status!=='approved'?'open':response.answer==='yes'?'fulfilled'
  :['no','partial'].includes(response.answer)?'not_fulfilled':'open';
const labelOf=id=>COMPONENTS.find(c=>c.id===id)?.label||id;
const join=labels=>labels.length>1?labels.slice(0,-1).join(', ')+' und '+labels.at(-1):labels[0]||'';
const compareIds=(a,b)=>a.localeCompare(b,'de-DE',{numeric:true});
const questionData=(q,response)=>({id:q.id,text:q.text,helpText:q.helpText??q.help_text??'',criteriaText:q.criteriaText||q.criterion_text||'',answer:response?.answer??null});
const descriptorKey=d=>[d.componentId,d.practiceId||'category',d.psfId||'ladder'].join(':');
// Short action summaries of the four unchanged SVS source ladders. Exact findings
// remain in questions; these summaries do not add new assessment requirements.
const categoryActions={
  guiding_principles:[null,
    ['Leitprinzipien für Entscheidungen kennen','Die für Entscheidungen maßgeblichen Leitprinzipien gemeinsam klären.'],
    ['Einheitliche Leitprinzipien mit der Führung abstimmen','Einheitliche Leitprinzipien festlegen und ein gemeinsames Verständnis ihrer Anwendung in der Führung herstellen.'],
    ['Leitprinzipien bekanntgeben und Verständnis sichern','Leitprinzipien schriftlich festhalten und offiziell bekanntgeben. Verständnis und Zustimmung bei den meisten Beteiligten prüfen.'],
    ['Leitprinzipien im Arbeitsalltag verankern','Die Anwendung bei Entscheidungen und Leistungen klären, in den Bereichen erklären, Mitarbeitende unterstützen und die Einhaltung prüfen.'],
    ['Leitprinzipien dauerhaft anwenden und weiter prüfen','Die dauerhafte Anwendung sichern und bei neuen Zielen oder Erfahrungen prüfen, ob die Leitprinzipien weiterhin passen.']],
  governance:[null,
    ['Führungsentscheidungen bei Problemen sicherstellen','Einzelne Probleme durch die Führung bewerten und überwachen lassen sowie bei Bedarf Entscheidungen herbeiführen.'],
    ['Aktuelle IT-Vorgaben mit Ressourcen und Kontrolle absichern','IT-Vorgaben regelmäßig entwickeln, ihre Einhaltung kontrollieren und die nötigen Ressourcen bereitstellen.'],
    ['IT-Vorgaben und Messgrößen an Unternehmenszielen ausrichten','Vorgaben auf Unternehmensziele ausrichten und mit passenden Zahlen prüfen, ob diese Ziele erreicht werden.'],
    ['Leitungsentscheidungen mit verlässlichen Daten steuern','Entscheidungen auf verlässliche Daten stützen, ihre Wirkung regelmäßig messen und Abweichungen vom vereinbarten Vorgehen beheben.'],
    ['Führung und Kontrollen an langfristige Ziele anpassen','Zuständigkeiten, Entscheidungswege und Kontrollen regelmäßig überprüfen und an langfristige Ziele sowie Anforderungen der Beteiligten anpassen.']],
  service_value_chain:[null,
    ['Eine IT-Anfrage bis zur nutzbaren Lösung bearbeiten','Eine IT-Anfrage von der Aufnahme bis zu einer nutzbaren Lösung vollständig bearbeiten.'],
    ['Eingespielte Abläufe von der Anfrage bis zur Lösung anwenden','Wiederholbare Abläufe für verschiedene IT-Aufgaben von der Anfrage bis zur nutzbaren Lösung anwenden.'],
    ['Durchgängige Abläufe mit Zuständigkeiten und Übergaben klären','Wichtige Abläufe schriftlich festhalten, bei allen Beteiligten bekanntmachen und anwenden. Aufgaben, Übergaben und Regeln für Sonderfälle klären.'],
    ['Ergebnisse durchgängiger Abläufe messen und Entscheidungen abstimmen','Ergebnisse der gesamten Abläufe regelmäßig messen und bewerten. Entscheidungen zwischen Aufgabenverantwortlichen und Verantwortlichen der gesamten Abläufe abstimmen.'],
    ['Abläufe gemeinsam verbessern und dauerhaften Nutzen prüfen','Benannte Verantwortliche die Abläufe von Anfang bis Ende überprüfen und verbessern lassen. Den dauerhaften Nutzen der Verbesserungen prüfen.']],
  continual_improvement:[null,
    ['Erste Verbesserungen umsetzen und Ergebnisse prüfen','Gelegentliche Änderungen umsetzen und prüfen, ob sie Verbesserungen bewirken.'],
    ['Verbesserungen regelmäßig umsetzen und überprüfen','Regelmäßig Verbesserungen umsetzen und ihre Ergebnisse wiederholt prüfen.'],
    ['Verbesserungsziele und gemeinsames Vorgehen festlegen','IT-Leistungsziele schriftlich festhalten und auf Unternehmensziele ausrichten. Ein gemeinsames Vorgehen zur Ergebnismessung und Verbesserung festlegen.'],
    ['Verbesserungswirkung messen und frühzeitig handeln','Die Wirkung von Verbesserungen anhand von Zahlen und im Zeitverlauf bewerten. Verbesserungen auch vor dem Auftreten von Problemen anstoßen.'],
    ['Verbesserungen an veränderten Unternehmenszielen ausrichten','IT-Leistungsziele bei veränderten Unternehmenszielen anpassen und das gemeinsame Verbesserungsvorgehen für langfristige Ziele weiterentwickeln.']],
};

function targetData(descriptor,target){
  const required=descriptor.questions.filter(q=>q.level<=target);
  return {required,deficits:required.filter(q=>descriptor.states[q.id]==='not_fulfilled'),
    open:required.filter(q=>descriptor.states[q.id]==='open')};
}
function nextLevel(descriptor){
  const current=descriptor.unit?.assessed_level;
  return isLevel(current)?current<5?Math.max(descriptor.start,current+1):null:descriptor.start;
}
function hypothetical(descriptor,target){
  const states={...descriptor.states};
  for(const q of descriptor.questions)if(q.level<=target)states[q.id]='fulfilled';
  return ladder(descriptor.id,descriptor.requirements,states,descriptor.byId,descriptor.start);
}
function compareChoices(a,b){
  for(const key of ['openCount','deficitCount','gain','changed'])if(a[key]!==b[key])return a[key]-b[key];
  return compareIds(a.signature,b.signature);
}

/** A bounded stage-sum search, not an estimate of business value or effort. */
function practicePath(descriptors,target){
  if(!descriptors.length||descriptors.some(d=>!isLevel(d.unit?.assessed_level)))return null;
  const sum=descriptors.reduce((total,d)=>total+d.unit.assessed_level,0),needed=target*descriptors.length-sum;
  if(needed<=0)return [];
  let paths=new Map([[0,{options:[],openCount:0,deficitCount:0,gain:0,changed:0,signature:''}]]);
  for(const d of descriptors){
    const options=[{descriptor:d,target:d.unit.assessed_level,gain:0,open:[],deficits:[]}];
    for(let n=Math.max(2,d.unit.assessed_level+1);n<=5;n++){
      const data=targetData(d,n),after=hypothetical(d,n);
      options.push({descriptor:d,target:n,gain:after.assessed_level-d.unit.assessed_level,...data});
      // Resolve the first uncertain stage before recommending negative answers above it.
      if(data.open.length)break;
    }
    const next=new Map();
    for(const previous of paths.values())for(const option of options){
      const candidate={options:[...previous.options,option],openCount:previous.openCount+option.open.length,
        deficitCount:previous.deficitCount+option.deficits.length,gain:previous.gain+option.gain,
        changed:previous.changed+Number(option.gain>0),signature:previous.signature+'|'+d.id+'='+option.target};
      const retained=next.get(candidate.gain);
      if(!retained||compareChoices(candidate,retained)<0)next.set(candidate.gain,candidate);
    }
    paths=next;
  }
  const best=[...paths.values()].filter(path=>path.gain>=needed).sort(compareChoices)[0];
  return best?.options.filter(option=>option.gain>0)||null;
}

function fairOrder(items){
  const ordered=[];
  for(const priority of ['svs','next_level','development']){
    const groups=COMPONENTS.map(component=>items.filter(item=>item.priority===priority&&item.componentId===component.id)
      .sort((a,b)=>compareIds(a.practiceId||'',b.practiceId||'')||compareIds(a.psfId||'',b.psfId||'')||a.targetLevel-b.targetLevel));
    // First show one handlungsfeld per category, including every co-limiter.
    while(groups.some(group=>group.length))for(const group of groups)if(group.length)ordered.push(group.shift());
  }
  return ordered;
}

export function buildImprovementPlan({project={},catalogs={},result=null}={}){
  if(!result)return {status:'incomplete',summary:'',
    items:[],clarifications:[{id:'assessment:unavailable',componentId:'guiding_principles',practiceId:null,psfId:null,
      title:'Bewertung zunächst prüfen',reason:'Ein aktuelles berechenbares Ergebnis wird benötigt, bevor projektspezifische Verbesserungen abgeleitet werden.',
      questionIds:[],questions:[],route:'assessment'}],limitingCategoryIds:[],targetSvsLevel:null};
  project=project||{};catalogs=catalogs||{};
  const payload=project.payload||{},records=payload.assessments||{},raw=catalogs.raw||{};
  const selected=new Set(selectedPracticeIds(payload)),registry=catalogs.practices||raw.practices?.practice_registry||[];
  const practiceName=id=>registry.find(p=>p.id===id)?.name_de||registry.find(p=>p.id===id)?.label||id;
  const svs=result?.svs_result,finalSvs=svs?.stage_complete===true&&svs.scope_complete===true&&isLevel(svs.assessed_level);
  const limitingCategoryIds=finalSvs?COMPONENTS.filter(c=>result.component_results?.[c.id]?.assessed_level===svs.assessed_level).map(c=>c.id):[];
  const targetSvsLevel=finalSvs&&svs.assessed_level<5?svs.assessed_level+1:null;
  const responses=Object.fromEntries(COMPONENTS.map(c=>[c.id,new Map((records[c.id]?.responses||[]).map(r=>[r.question_id,r]))]));
  const descriptors=[],practiceDescriptors=new Map(),configs=new Map(),clarifications=new Map();
  function describe(componentId,criterion,questions,unit,practiceId=null){
    const d={componentId,practiceId,psfId:practiceId?criterion.id:null,id:criterion.id,title:criterion.name||criterion.title||labelOf(componentId),
      start:practiceId?2:1,requirements:Object.fromEntries((criterion.level_requirements||[]).map(r=>[r.level,r.question_ids])),
      questions,byId:Object.fromEntries(questions.map(q=>[q.id,q])),unit,
      states:Object.fromEntries(questions.map(q=>[q.id,state(responses[componentId].get(q.id))]))};
    descriptors.push(d);return d;
  }
  function clarify(d,questions){
    if(!questions.length)return;
    const key='questions:'+descriptorKey(d),existing=clarifications.get(key),ids=unique([...(existing?.questionIds||[]),...questions.map(q=>q.id)]);
    const source=ids.map(id=>d.byId[id]),pending=source.some(q=>responses[d.componentId].get(q.id)?.review_status==='pending');
    clarifications.set(key,{id:key,componentId:d.componentId,practiceId:d.practiceId,psfId:d.psfId,
      title:(d.practiceId?practiceName(d.practiceId)+' · '+d.title:labelOf(d.componentId))+': offene Angaben klären',
      reason:pending?'Fehlende oder unklare Angaben klären und bisherige Antworten für den aktuellen Umfang erneut bestätigen. Dies ist kein bestätigter Verbesserungsmangel.'
        :'Zu diesen Anforderungen fehlt eine eindeutige bestätigte Aussage. Offen bedeutet nicht, dass die Anforderung nicht erfüllt ist.',
      questionIds:ids,questions:source.map(q=>questionData(q,responses[d.componentId].get(q.id))),route:'assessment'});
  }
  function scopeClarification(id,componentId,title,reason,route,practiceId=null){
    clarifications.set(id,{id,componentId,practiceId,psfId:null,title,reason,route,questionIds:[],questions:[]});
  }
  for(const component of COMPONENTS.filter(c=>c.id!=='practices')){
    const catalog=raw[component.id]||catalogs.components?.find(c=>c.id===component.id)?.catalog;
    if(!catalog?.criteria?.[0])continue;
    const questions=catalogs.components?.find(c=>c.id===component.id)?.questions||catalog.questions||[];
    const evaluated=result?.component_results?.[component.id];
    describe(component.id,catalog.criteria[0],questions,evaluated?.question_ladder_result||evaluated?.unit_results?.[0]||evaluated);
  }
  for(const id of selected){
    const practice=registry.find(p=>p.id===id),module=practice?.module||raw.practices?.assessment_modules?.find(m=>m.practice_id===id);
    if(!module)continue;
    const questions=catalogs.components?.find(c=>c.id==='practices')?.questions?.filter(q=>q.practiceId===id)||module.questions;
    const ds=(module.criteria||[]).map(criterion=>describe('practices',criterion,questions.filter(q=>q.criterion_id===criterion.id),
      result?.practice_results?.[id]?.unit_results?.find(unit=>unit.unit_id===criterion.id),id));
    practiceDescriptors.set(id,ds);
  }
  for(const d of descriptors){
    const target=nextLevel(d);if(target===null)continue;
    configs.set(descriptorKey(d),{descriptor:d,target,priority:d.practiceId?'development':targetSvsLevel!==null&&limitingCategoryIds.includes(d.componentId)?'svs':'next_level'});
  }
  const category=result?.component_results?.practices,roleLevel=isLevel(category?.assessed_level)?category.assessed_level:category?.role_stage_result?.assessed_level;
  const categoryTarget=isLevel(roleLevel)?roleLevel<5?roleLevel+1:null:1;
  const roleRow=(category?.component_level_evaluations||[]).find(row=>row.level===categoryTarget);
  const required=(roleRow?.practice_requirements||[]).filter(row=>selected.has(row.practice_id)&&row.state!=='fulfilled');
  const rolePaths=[];
  const assessedRoleCategory=improvementStage(category)!==null&&categoryTarget!==null;
  for(const requirement of required){
    const ds=practiceDescriptors.get(requirement.practice_id)||[],path=practicePath(ds,requirement.minimum_level);
    if(requirement.state==='not_fulfilled'&&improvementStage(result.practice_results?.[requirement.practice_id])!==null){
      // If later cumulative information prevents a complete mean-target search,
      // known first deficits are still a real contribution, never a full path claim.
      const knownSteps=path||ds.map(descriptor=>{
        const target=nextLevel(descriptor);
        return target===null?null:{descriptor,target,...targetData(descriptor,target)};
      }).filter(option=>option?.deficits.length);
      if(knownSteps.some(option=>option.deficits.length))rolePaths.push({requirement,path:knownSteps,
        questionsComplete:Boolean(path)&&path.every(option=>!option.open.length)});
    }
    if(!path)continue;
    for(const option of path){
      const priority=targetSvsLevel!==null&&limitingCategoryIds.includes('practices')?'svs':'next_level';
      const previous=configs.get(descriptorKey(option.descriptor));
      if(previous&&ranks[previous.priority]<ranks[priority])continue;
      configs.set(descriptorKey(option.descriptor),{descriptor:option.descriptor,target:option.target,priority,roleGoal:{
        categoryTarget,practiceTarget:requirement.minimum_level,scopeRole:requirement.scope_role,
        otherPsfs:path.filter(p=>p.descriptor.id!==option.descriptor.id).map(p=>p.descriptor.title),
        otherPractices:required.filter(r=>r.practice_id!==requirement.practice_id).map(r=>practiceName(r.practice_id))}});
    }
  }
  const items=[];
  for(const config of configs.values()){
    const {descriptor:d,target,priority,roleGoal}=config,data=targetData(d,target);
    clarify(d,data.open);if(!data.deficits.length)continue;
    const owner=d.practiceId?result.practice_results?.[d.practiceId]:result.component_results?.[d.componentId];
    if(improvementStage(owner)===null)continue;
    const questions=data.deficits.map(q=>questionData(q,responses[d.componentId].get(q.id))),questionIds=questions.map(q=>q.id);
    const context=d.practiceId?practiceName(d.practiceId)+' · '+d.title:labelOf(d.componentId);
    const short=categoryActions[d.componentId]?.[target];
    const title=d.practiceId?context:short?.[0]||context+': nächste Anforderungen erfüllen';
    const actionText=d.practiceId?'Die Arbeitsweise zu „'+d.title+'“ anhand der betroffenen Kriterien gezielt verbessern.'
      :short?.[1]||'Die Umsetzung der betroffenen Anforderungen gezielt verbessern.';
    const reason=roleGoal?'Ein möglicher rechnerischer Weg zur Practices-Stufe '+roleGoal.categoryTarget+': '+practiceName(d.practiceId)+
      ' benötigt als '+(roleGoal.scopeRole==='primary'?'Schlüssel-Practice':'unterstützende Practice')+' mindestens Stufe '+roleGoal.practiceTarget+
      '. Dafür zählt der abgerundete Durchschnitt aller Erfolgsfaktoren; dieser Erfolgsfaktor trägt zu dem dargestellten Weg bei.'
      :d.practiceId?'Die Maßnahme unterstützt die Entwicklung dieses Erfolgsfaktors und den Practice-Durchschnitt.'
      :questions.length+' '+(questions.length===1?'Anforderung bis Stufe '+target+' wurde':'Anforderungen bis Stufe '+target+' wurden')+' mit '+join(unique(questions.map(q=>q.answer==='partial'?'„Teilweise“':'„Nein“')))+' beantwortet.';
    const effectText=priority==='svs'?'Kann zur Entwicklung in Richtung SVS-Stufe '+targetSvsLevel+' beitragen.'
      :roleGoal?'Kann einen möglichen Weg zur Practices-Stufe '+roleGoal.categoryTarget+' unterstützen.'
      :d.practiceId?'Kann die Entwicklung dieses Erfolgsfaktors und den Practice-Durchschnitt verbessern.'
      :'Kann die Entwicklung zur Kategorie-Stufe '+target+' unterstützen.';
    items.push({id:'improvement:'+descriptorKey(d)+':level:'+target,componentId:d.componentId,practiceId:d.practiceId,psfId:d.psfId,
      currentLevel:isLevel(d.unit?.assessed_level)?d.unit.assessed_level:null,targetLevel:target,title,reason,actionText,effectText,
      questionIds,questions,priority,otherRequirements:'',
      improvementGroup:d.practiceId?'practice':'category',categoryStage:improvementStage(result.component_results?.[d.componentId]),
      practiceStage:d.practiceId?improvementStage(owner):null,
      actionDraft:{title,effect:effectText,requirement:questionIds.join(', '),priority:ranks[priority]+1,owner:'',due:''}});
  }
  // A category suggestion is a real combined role-deficit path, never a copy of
  // the weakest PSF or a made-up average. Its own stable ID supports adoption.
  let practiceCategoryItem=null;
  if(assessedRoleCategory&&rolePaths.length){
    const questionMap=new Map();
    for(const {path} of rolePaths)for(const {descriptor,deficits} of path)for(const q of deficits)
      questionMap.set(q.id,questionData(q,responses.practices.get(q.id)));
    const questions=[...questionMap.values()].sort((a,b)=>compareIds(a.id,b.id)),questionIds=questions.map(q=>q.id);
    if(questionIds.length){
      const priority=targetSvsLevel!==null&&limitingCategoryIds.includes('practices')?'svs':'next_level';
      const title='Practices gezielt auf Kategorie-Stufe '+categoryTarget+' entwickeln';
      const steps=[];
      if(rolePaths.some(({requirement})=>requirement.scope_role==='primary'))steps.push('Die betroffenen Schlüssel-Practices mindestens auf Stufe '+categoryTarget+' bringen.');
      if(rolePaths.some(({requirement})=>requirement.scope_role==='supporting'))steps.push('Die betroffenen unterstützenden Practices mindestens auf Stufe '+(categoryTarget-2)+' bringen.');
      const actionText=steps.join(' ')+' Dafür die verknüpften Anforderungen der Erfolgsfaktoren umsetzen.';
      const rolePathQuestionsComplete=rolePaths.length===required.length&&rolePaths.every(path=>path.questionsComplete);
      const reason='Für Kategorie-Stufe '+categoryTarget+' fehlen bestätigte Anforderungen bei '+rolePaths.length+' '+
        (rolePaths.length===1?'ausgewählten Practice.':'ausgewählten Practices.')+
        (rolePathQuestionsComplete?' Die verknüpften Fragen beschreiben einen möglichen rechnerischen Weg über deren Erfolgsfaktoren.':
          ' Die verknüpften bestätigten Anforderungen tragen zur Entwicklung der dafür benötigten Erfolgsfaktoren bei.');
      const effectText=priority==='svs'?'Kann zur Entwicklung in Richtung SVS-Stufe '+targetSvsLevel+' beitragen.'
        :'Kann die Entwicklung zur Practices-Kategorie-Stufe '+categoryTarget+' unterstützen.';
      practiceCategoryItem={id:'improvement:practices:category:ladder:level:'+categoryTarget,
        componentId:'practices',practiceId:null,psfId:null,isCategorySummary:true,improvementGroup:'category',
        currentLevel:roleLevel,targetLevel:categoryTarget,categoryStage:roleLevel,practiceStage:null,
        title,reason,actionText,effectText,questionIds,questions,priority,otherRequirements:'',rolePathQuestionsComplete,
        roleRequirements:rolePaths.map(({requirement,path})=>({practiceId:requirement.practice_id,scopeRole:requirement.scope_role,
          currentLevel:improvementStage(result.practice_results[requirement.practice_id]),minimumLevel:requirement.minimum_level,
          psfTargets:path.map(option=>({psfId:option.descriptor.psfId,currentLevel:option.descriptor.unit.assessed_level,
            targetLevel:option.target,questionIds:option.deficits.map(q=>q.id)}))})),
        actionDraft:{title,effect:effectText,requirement:questionIds.join(', '),priority:ranks[priority]+1,owner:'',due:''}};
    }
  }
  if(!result||svs?.context_status!=='complete')scopeClarification('scope:context','guiding_principles','Gemeinsamen Bewertungsumfang bestätigen',
    'Organisationseinheit, Umfang und betrachtete IT-Leistungen müssen für das Gesamtergebnis einheitlich festgelegt und bestätigt sein.','context');
  if(category?.scope_complete!==true)scopeClarification('scope:practices','practices','Practice-Auswahl und Rollen klären',
    category?.limitations?.join(' ')||'Auswahlentscheidungen, erforderliche Practices und mindestens eine Schlüssel-Practice bestätigen.','practices');
  const svc=result?.component_results?.service_value_chain;
  if(svc?.scope_complete!==true)scopeClarification('scope:svc','service_value_chain','Abdeckung der wesentlichen Abläufe bestätigen',
    svc?.limitations?.join(' ')||'Die Übersicht und vollständige Abdeckung der wesentlichen Abläufe sind noch zu bestätigen.','context');
  const ci=result?.component_results?.continual_improvement;
  if(ci?.dependency_status!=='compatible')scopeClarification('dependency:PR02','continual_improvement','PR02-Bewertung für Continual Improvement vervollständigen',
    'Eine vollständige passende PR02-Bewertung und bestätigte Practice-Auswahl sind erforderlich. Die PR02-Stufe begrenzt die eigene CI-Fragenstufe nicht numerisch.',
    selected.has('PR02')?'assessment':'practices','PR02');
  const ordered=fairOrder(items),clarificationRows=[...clarifications.values()];
  if(practiceCategoryItem)ordered.push(practiceCategoryItem);
  const status=!ordered.length&&!clarificationRows.length?'complete':finalSvs?'ready':'incomplete';
  const summary=targetSvsLevel!==null?'Verbesserungen mit Bezug auf SVS-Stufe '+targetSvsLevel+'.'
    :finalSvs?'SVS-Stufe 5 ist erreicht.':'';
  return {status,summary,items:ordered,clarifications:clarificationRows,limitingCategoryIds,targetSvsLevel};
}
