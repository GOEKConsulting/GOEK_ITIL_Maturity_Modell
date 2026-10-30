/** Read-only projection of the current assessment and saved results for a PDF. */
import {COMPONENTS} from './model.js';
import {selectedPracticeIds} from './catalogs.js';
import {stageValue,completionText} from './mode-view.js';
import {buildImprovementPlan} from './improvement-plan.js';

const statusLabels={confirmed:'Rechnerisch eingestuft',provisional:'Vorläufige Untergrenze',open:'Noch offen',below_baseline:'Unter Ausgangsstufe',partial_scope:'Teilumfang',needs_reconciliation:'Klärung erforderlich',not_classifiable:'Nicht einstufbar'};
const roles=[
  {role:'primary',title:'Primary Practices · Schlüssel-Practices',color:'#951E38'},
  {role:'supporting',title:'Supporting Practices · Unterstützende Practices',color:'#AF3147'},
  {role:'unassigned',title:'Rolle noch offen',color:'#606060'},
];
const isLevel=value=>Number.isInteger(value)&&value>=0&&value<=5;
const text=value=>typeof value==='string'?value:'';
const finite=value=>Number.isFinite(value)?value:null;
const finalStage=unit=>{const value=stageValue(unit);return isLevel(value)?value:null;};
const statusLabel=unit=>unit?.stage_complete===true&&unit?.value_complete===false
  ?'Stufe bestimmt; zusätzlicher Durchschnitt noch offen':statusLabels[unit?.status]||'Noch offen';
function dateLabel(value){
  if(!value)return 'Noch nicht festgelegt';
  const date=new Date(value);
  return Number.isNaN(+date)?text(value):date.toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'});
}
function values(unit){
  const stage=finalStage(unit),provisional=stage===null&&unit?.status==='provisional'&&isLevel(unit.assessed_level);
  return {stage,displayLevel:stage??(provisional?unit.assessed_level:null),provisional,
    exact:finite(unit?.exact_value),statusLabel:statusLabel(unit)};
}
function compareEntries(left,right){
  if(left.displayLevel===null&&right.displayLevel!==null)return 1;
  if(right.displayLevel===null&&left.displayLevel!==null)return -1;
  if(left.displayLevel!==null&&right.displayLevel!==null&&left.displayLevel!==right.displayLevel)
    return left.displayLevel-right.displayLevel;
  return left.id.localeCompare(right.id,'de-DE',{numeric:true});
}
function roleGroup(definition,entries,category){
  const row=(category?.component_level_evaluations||[]).find(item=>item.level===category.assessed_level);
  const trusted=category?.stage_complete===true&&category?.scope_complete===true&&finalStage(category)!==null&&row;
  const minimum=trusted?(definition.role==='primary'?row.key_minimum:definition.role==='supporting'?row.supporting_minimum:null):null;
  const threshold=isLevel(minimum)&&minimum>=1?minimum:null;
  let explanation;
  if(threshold!==null)explanation=`Die gestrichelte Linie zeigt die Anforderung für Kategorie-Stufe ${category.assessed_level}: mindestens Stufe ${threshold}.`;
  else if(trusted&&definition.role==='supporting'&&minimum===null)
    explanation=`Für unterstützende Practices gilt bei Kategorie-Stufe ${category.assessed_level} keine Mindeststufe. Daher erscheint keine Schwellenlinie.`;
  else if(definition.role==='unassigned')explanation='Die Rolle dieser einbezogenen Practices ist noch offen. Es wird keine Rollenschwelle zugeordnet.';
  else explanation='Eine Schwellenlinie erscheint, sobald die Kategorie-Stufe und der Bewertungsumfang feststehen.';
  return {...definition,threshold,explanation,entries:entries.filter(entry=>entry.role===definition.role)
    .sort(compareEntries).map(({role,...entry})=>entry)};
}

function pdfImprovementSelection(plan,payload,result){
  const top=plan.items.slice(0,3),topIds=new Set(top.map(item=>item.id)),selected=new Set(selectedPracticeIds(payload));
  const responses=new Map((payload.assessments?.practices?.responses||[]).map(response=>[response.question_id,response]));
  const practiceStage=item=>finalStage(result?.practice_results?.[item.practiceId]);
  const knownLevel=value=>isLevel(value)?value:null;
  const compareLevels=(left,right)=>left===null?(right===null?0:1):right===null?-1:left-right;
  const candidates=plan.items.filter(item=>item.practiceId&&selected.has(item.practiceId)&&!topIds.has(item.id)&&item.questions?.length&&
    item.questions.every(question=>{
      const response=responses.get(question.id);
      return response?.review_status==='approved'&&['no','partial'].includes(response.answer)&&response.answer===question.answer;
    })).sort((left,right)=>compareLevels(practiceStage(left),practiceStage(right))||
      compareLevels(knownLevel(left.currentLevel),knownLevel(right.currentLevel))||
      compareLevels(knownLevel(left.targetLevel),knownLevel(right.targetLevel))||
      left.practiceId.localeCompare(right.practiceId,'de-DE',{numeric:true})||
      String(left.psfId||'').localeCompare(String(right.psfId||''),'de-DE',{numeric:true})||
      left.id.localeCompare(right.id,'de-DE',{numeric:true}));
  return [...top,...(candidates.length?[candidates[0]]:[])].map((item,index)=>({
    ...structuredClone(item),isPracticeFocus:index===top.length,practiceStage:item.practiceId?practiceStage(item):null,
  }));
}

/** No calculation, browser access, writes to input objects, or history migration. */
export function buildPdfReportModel({project={},catalogs={},result=null}={}){
  const payload=project.payload||{},context=Object.values(payload.assessments||{})[0]?.context||{};
  const components=COMPONENTS.map(component=>{
    const unit=result?.component_results?.[component.id];
    return {id:component.id,label:component.label,color:component.color,...values(unit),completion:completionText(unit)};
  });
  const decisions=payload.assessments?.practices?.extensions?.scope_decisions||[];
  const entries=[...new Set(selectedPracticeIds(payload))].map(id=>{
    const practice=(catalogs.practices||[]).find(item=>item.id===id),decision=decisions.find(item=>item.practice_id===id);
    const role=['primary','supporting'].includes(decision?.scope_role)?decision.scope_role:'unassigned';
    return {id,label:practice?.name_de||practice?.label||id,role,...values(result?.practice_results?.[id])};
  });
  const svs=result?.svs_result,category=result?.component_results?.practices;
  const notes=result?.component_results?.guiding_principles?.consistency_notes||[];
  const limitations=[...new Set([
    ...notes,...(svs?.limitations||[]),
    ...COMPONENTS.flatMap(component=>result?.component_results?.[component.id]?.limitations||[]),
  ].filter(item=>typeof item==='string'&&item.trim()))];
  const actions=(project.actions||[]).map(action=>({title:text(action.title),effect:text(action.effect),
    requirement:text(action.requirement),priority:action.priority??null,owner:text(action.owner),due:text(action.due)}))
    .sort((left,right)=>{
      const priority=action=>action.priority!==null&&Number.isFinite(Number(action.priority))?Number(action.priority):Infinity;
      const a=priority(left),b=priority(right);return a===b?0:a-b;
    });
  const plan=buildImprovementPlan({project,catalogs,result});
  const improvements={status:plan.status,summary:plan.summary,
    items:pdfImprovementSelection(plan,payload,result).map(item=>{
      const practice=(catalogs.practices||[]).find(practice=>practice.id===item.practiceId);
      const psf=practice?.module?.psfs?.find(psf=>psf.id===item.psfId);
      return {...item,componentLabel:COMPONENTS.find(component=>component.id===item.componentId)?.label||item.componentId,
        practiceLabel:practice?.name_de||practice?.label||item.practiceId||'',psfLabel:psf?.title||''};
    })};
  return {
    projectName:text(project.name)||'Neue Bewertung',organization:text(context.organization)||'Noch nicht erfasst',
    scope:text(context.scope_description)||'Noch nicht festgelegt',
    services:(context.services_in_scope||[]).filter(service=>typeof service==='string'&&service.trim()).map(service=>service),
    date:dateLabel(project.updatedAt),isDemo:project.isDemo===true,
    svs:{stage:finalStage(svs),exact:finite(svs?.exact_value),
      limitingLabels:(svs?.limiting_unit_ids||[]).map(id=>COMPONENTS.find(component=>component.id===id)?.label||id),
      statusLabel:statusLabel(svs)},
    components,counts:{categoriesWithStage:components.filter(component=>component.stage!==null).length,
      practicesWithStage:entries.filter(entry=>entry.stage!==null).length,selectedPractices:entries.length},
    practiceGroups:roles.map(role=>roleGroup(role,entries,category)),improvements,actions,limitations,
    snapshots:(project.snapshots||[]).map(snapshot=>({createdAt:dateLabel(snapshot.createdAt),
      stage:finalStage(snapshot.result?.svs_result),modeLabel:text(snapshot.mode_label)||'Gespeicherte Bewertung'})),
  };
}
