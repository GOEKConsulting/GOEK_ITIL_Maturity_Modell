/** Read-only improvement-plan presentation. Adoption/editing belongs to main.js. */
import {selectImprovementGroups} from './improvement-selection.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const components={guiding_principles:'Guiding Principles',governance:'Governance',service_value_chain:'Service Value Chain',practices:'Practices',continual_improvement:'Continual Improvement'};
const answers={yes:'Ja',partial:'Teilweise',no:'Nein',unknown:'Unklar'};
const answerLabel=value=>Object.hasOwn(answers,value)?answers[value]:'Noch nicht beantwortet';
const stage=value=>Number.isInteger(value)&&value>=0&&value<=5;
const list=value=>Array.isArray(value)?value:[];
export const IMPROVEMENT_SORT_VALUES=Object.freeze(['practice','level']);
export const getImprovementSort=project=>project?.ui?.improvementSort==='level'?'level':'practice';

function levelOrder(left,right){
  const leftUnknown=!stage(left.practiceStage),rightUnknown=!stage(right.practiceStage);
  if(leftUnknown!==rightUnknown)return leftUnknown?1:-1;
  for(const key of ['practiceStage','currentLevel','targetLevel']){
    const a=stage(left[key])?left[key]:Infinity,b=stage(right[key])?right[key]:Infinity;
    if(a!==b)return a-b;
  }
  if(left.practiceId&&right.practiceId){
    const practice=String(left.practiceId).localeCompare(String(right.practiceId),'de-DE',{numeric:true});
    if(practice)return practice;
    return String(left.psfId??'').localeCompare(String(right.psfId??''),'de-DE',{numeric:true});
  }
  if(Boolean(left.practiceId)!==Boolean(right.practiceId))return left.practiceId?-1:1;
  return 0;
}
const practiceOrder=(left,right)=>String(left.practiceId??'').localeCompare(String(right.practiceId??''),'de-DE',{numeric:true})||
  String(left.psfId??'').localeCompare(String(right.psfId??''),'de-DE',{numeric:true})||left.targetLevel-right.targetLevel||String(left.id).localeCompare(String(right.id));

function contextText(item,catalogs){
  const component=list(catalogs?.components).find(row=>row.id===item.componentId);
  const practice=list(catalogs?.practices).find(row=>row.id===item.practiceId);
  const module=practice?.module||list(catalogs?.raw?.practices?.assessment_modules).find(row=>row.practice_id===item.practiceId);
  const psf=list(module?.psfs).find(row=>row.id===item.psfId);
  return [component?.label||(Object.hasOwn(components,item.componentId)?components[item.componentId]:item.componentId),
    practice?.name_de||practice?.label||item.practiceId,psf?.title||item.psfId].filter(Boolean).join(' · ');
}

function questionsFor(item,catalogs){
  const supplied=list(item.questions);
  const ids=[...new Set([...list(item.questionIds),...supplied.map(row=>row.id)].filter(id=>typeof id==='string'&&id))];
  return ids.map(id=>{
    const source=catalogs?.questionsById?.get?.(id),question=supplied.find(row=>row.id===id)||{};
    return {id,text:question.text??source?.text??id,
      helpText:question.helpText??question.help_text??source?.helpText??source?.help_text??'',
      criteriaText:question.criteriaText??source?.criteriaText??source?.criterion_text??'',answer:question.answer??null};
  });
}

function questionButton(question,componentId,label='Frage öffnen'){
  return `<button type="button" class="btn btn-small" data-question="${esc(question.id)}" data-component="${esc(componentId)}">${esc(label)}</button>`;
}

function questionDetails(questions,componentId){
  if(!questions.length)return '';
  return `<details class="improvement-questions"><summary>Betroffene Fragen ansehen (${questions.length})</summary><ol>${questions.map(question=>`<li data-improvement-question="${esc(question.id)}"><p class="improvement-question-text">${esc(question.text)}</p>${String(question.helpText).trim()?`<p class="improvement-question-help">${esc(question.helpText)}</p>`:''}<p class="improvement-answer">Ihre Antwort: ${esc(answerLabel(question.answer))}</p>${question.criteriaText&&question.criteriaText.trim()!==question.text.trim()?`<details class="improvement-criterion"><summary>Zugehöriges Kriterium</summary><p>${esc(question.criteriaText)}</p></details>`:''}${questionButton(question,componentId)}</li>`).join('')}</ol></details>`;
}

function itemHtml(item,index,catalogs,project){
  const questions=questionsFor(item,catalogs),adopted=list(project?.actions).some(action=>action?.sourceSuggestionId===item.id);
  const priority=['svs','next_level','development'].includes(item.priority)?item.priority:'development';
  const priorityText={svs:'SVS-Priorität',next_level:'Nächste Stufe',development:'Weiterentwicklung'}[priority];
  return `<li><article class="improvement-entry" data-improvement-id="${esc(item.id)}"><span class="improvement-index" aria-hidden="true">${index+1}</span><div class="improvement-entry-body">
    <div class="improvement-context">${esc(contextText(item,catalogs))}</div><div class="improvement-item-heading"><h4>${esc(item.title)}</h4><span class="improvement-priority improvement-priority--${priority}">${priorityText}</span></div>
    ${item.improvementGroup==='practice'&&stage(item.practiceStage)?`<p class="improvement-practice-stage">Practice-Stufe ${item.practiceStage}</p>`:''}
    ${stage(item.currentLevel)&&stage(item.targetLevel)?`<p class="improvement-level">${item.improvementGroup==='practice'?'Erfolgsfaktor: ':''}Stufe ${item.currentLevel} auf ${item.targetLevel}</p>`:''}
    ${item.reason?`<p class="improvement-reason">${esc(item.reason)}</p>`:''}
    <dl class="improvement-proposal"><div><dt>Maßnahme</dt><dd>${esc(item.actionText)}</dd></div><div><dt>Erwartete Wirkung</dt><dd>${esc(item.effectText)}</dd></div></dl>
    ${questionDetails(questions,item.componentId)}
    <div class="improvement-row-actions">${questions.length?questionButton(questions[0],item.componentId,'Erste betroffene Frage öffnen'):''}<button type="button" class="btn btn-primary btn-small" data-improvement-adopt="${esc(item.id)}">${adopted?'Maßnahme bearbeiten':'Als Maßnahme übernehmen'}</button></div>
  </div></article></li>`;
}

function featuredGroup(items,kind,start,catalogs,project){
  const title=kind==='category'?'SVS-Kategorien':'Einzelne Practices';
  return `<section class="improvement-featured-group" data-improvement-group="${kind}" aria-label="${title}"><h3 class="improvement-group-title">${title}</h3>${items.length?`<ol class="improvement-items" start="${start}" data-improvement-primary="${kind}">${items.map((item,index)=>itemHtml(item,start+index-1,catalogs,project)).join('')}</ol>`:`<p class="improvement-empty">Für die bewerteten ${kind==='category'?'SVS-Kategorien':'Practices'} liegen keine weiteren automatischen Verbesserungsvorschläge vor.</p>`}</section>`;
}

export function improvementPlanHtml({plan,catalogs,project,result}={}){
  const groups=selectImprovementGroups({plan,result,catalogs,project});
  const items=[...groups.categories,...groups.practices];
  const sortOrder=getImprovementSort(project),tail=[...groups.otherPractices];
  tail.sort(sortOrder==='level'?levelOrder:practiceOrder);
  const status=['ready','incomplete','complete'].includes(plan?.status)?plan.status:'incomplete';
  const summary=typeof plan?.summary==='string'?plan.summary:'';
  let empty='';
  if(!items.length)empty=status==='complete'
    ?'<p class="improvement-empty" data-improvement-complete>Für dieses Bewertungsprofil liegen keine weiteren automatischen Verbesserungsvorschläge vor.</p>'
    :'<p class="improvement-empty" data-improvement-empty>Für die bisher bewerteten Anforderungen liegen keine automatischen Verbesserungsvorschläge vor.</p>';
  return `<section class="card improvement-plan" data-improvement-plan data-plan-status="${status}" aria-label="Ihre wichtigsten Verbesserungsmöglichkeiten"><h2>Ihre wichtigsten Verbesserungsmöglichkeiten</h2>
    ${summary?`<p class="improvement-summary">${esc(summary)}</p>`:''}
    ${empty}${items.length?featuredGroup(groups.featuredCategories,'category',1,catalogs,project)+featuredGroup(groups.featuredPractices,'practice',3,catalogs,project):''}
    ${groups.otherCategories.length?`<details class="improvement-more" data-improvement-categories-more><summary>Weitere SVS-Kategorien (${groups.otherCategories.length})</summary><ol class="improvement-items">${groups.otherCategories.map((item,index)=>itemHtml(item,index,catalogs,project)).join('')}</ol></details>`:''}
    ${tail.length?`<details class="improvement-more" data-improvement-more><summary>Practice Vorschläge (${tail.length})</summary><div class="improvement-sort-toolbar"><label class="improvement-sort" for="improvement-sort">Sortierung<select id="improvement-sort" data-improvement-sort>${[['practice','Practice-Reihenfolge'],['level','Niedrigste Practice-Stufe zuerst']].map(([value,label])=>`<option value="${value}"${sortOrder===value?' selected':''}>${label}</option>`).join('')}</select></label></div><ol class="improvement-items">${tail.map((item,index)=>itemHtml(item,index,catalogs,project)).join('')}</ol></details>`:''}
  </section>`;
}
