/** Excel question-catalog policy, replacing the former V5 reference model. */
export const VERSION='2026.10.22';
export const POLICY_ID='GOEK-XLSX-PSF-CUMULATIVE-2026-10-22';
export const SIMPLIFIED_MODE='simplified_self_assessment';
export const SIMPLIFIED_POLICY_ID=POLICY_ID;
export const AGGREGATION_POLICY_ID='GOEK-XLSX-PSF-MEAN-ROLES-SVS-MEAN-MIN-2026-10-22';
export const FILES=Object.freeze({guiding_principles:'GP_Fragenkatalog_V5.json',governance:'SVS_Governance_Fragenkatalog_V5.json',service_value_chain:'SVS_Service_Value_Chain_Fragenkatalog_V5.json',practices:'SVS_Practices_Fragenkatalog_V5.json',continual_improvement:'CI_Fragenkatalog_V5.json'});
export class InputError extends Error { constructor(message){super(message);this.name='InputError';} }
const fail=message=>{throw new InputError(message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const has=(o,k)=>Object.hasOwn(o,k), unique=a=>[...new Set(a)], clone=v=>structuredClone(v);
const ids=Object.keys(FILES);
const componentId=catalog=>catalog.component_id??catalog.metadata?.component_id;
const fields=['question_id','answer','finding','review_status','evidence_status','evidence_ids','check_results','assessor_rationale','reviewer_id','reviewed_at'];
const answerStates={yes:'fulfilled',no:'not_fulfilled',partial:'not_fulfilled',unknown:'open'};
const findings=['fulfilled','not_fulfilled','partial','open','not_applicable'];
const joined=(units,field)=>unique(units.flatMap(u=>u[field]||[]));
// Fractions remain internal. No binary intermediate rounding, exported BigInt,
// synthetic evidence, or mutation of source data is needed.
const fractions=new WeakMap();
function gcd(a,b){while(b)[a,b]=[b,a%b];return a;}
function fraction(n,d=1n){const g=gcd(n,d);return {n:n/g,d:d/g};}
const valueOf=f=>Number(f.n)/Number(f.d), floorOf=f=>Number(f.n/f.d);
function meanFraction(units){
 if(!units.length||units.some(u=>!fractions.has(u)))return null;
 let sum={n:0n,d:1n};
 for(const unit of units){const f=fractions.get(unit);sum=fraction(sum.n*f.d+f.n*sum.d,sum.d*f.d);}
 return fraction(sum.n,sum.d*BigInt(units.length));
}
function index(rows,key,label){
 if(!Array.isArray(rows))fail(label+' muss eine Liste sein.');
 const result=Object.create(null);
 for(const row of rows){if(!object(row)||typeof row[key]!=='string'||!row[key].trim()||has(result,row[key]))fail(label+': fehlende oder doppelte ID.');result[row[key]]=row;}
 return result;
}
export function allQuestions(catalog){
 if(!object(catalog))fail('Bewertungskatalog fehlt.');
 return componentId(catalog)==='practices'?(catalog.assessment_modules||[]).flatMap(m=>m.questions||[]):catalog.questions||[];
}
function meta(method){return {
 policy_id:POLICY_ID,aggregation_policy_id:AGGREGATION_POLICY_ID,policy_revision:1,catalog_version:VERSION,
 assessment_mode:SIMPLIFIED_MODE,assurance_level:'self_assessment',scoring_method:method,mode_label:'Fragenkatalog',
 model_validation_completed:false,result_is_draft:true,is_final:false,release_status:'draft',
 score_semantics:'Neuer Fragenkatalog mit kumulativen positiven Fragenstufen. PSF-Stufe 1 bezeichnet nur eine ausdrückliche Einordnung unter die erste erfasste Stufe 2, keinen erfüllten Stufe-1-Nachweis. Practice-Werte mitteln vollständige PSF-Stufen; Practice-Stufen werden abgerundet. Die Practices-Kategoriestufe folgt den Rollenschwellen. Der SVS-Wert mittelt die fünf vollständigen Kategorie-Werte; die SVS-Stufe ist deren niedrigste Stufe.',
 status_semantics:'confirmed bedeutet rechnerisch bestimmte Selbsteinschätzung. Provisorische Untergrenzen und Teilmittel sind keine vollständigen Werte. Nachweise sind freiwillig.'
};}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));if(y<100)date.setUTCFullYear(y);
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function validate(catalog,record){
 if(!object(record))fail('Bewertungsdatensatz fehlt.');
 if(record.catalog_id!==catalog.catalog_id||record.catalog_version!==catalog.catalog_version||catalog.catalog_version!==VERSION)fail('Katalog oder Version passt nicht zum neuen Fragenkatalog.');
 if(!record.assessment_id||!record.assessment_unit_id)fail('Bewertungs-ID oder Organisationseinheit fehlt.');
 if(!['draft_preview','pilot','regular'].includes(record.assessment_execution_mode))fail('Ungültiger Ausführungsmodus.');
 if(!object(record.context)||!object(record.extensions))fail('Kontext oder Erweiterungen fehlen.');
 const c=record.context,p=c.assessment_period;
 if(!object(p)||!has(p,'start')||!has(p,'end'))fail('Bewertungszeitraum benötigt start und end.');
 for(const date of [p.start,p.end,c.assessment_date])if(date!==null&&date!==undefined&&!validDate(date))fail('Ungültiges Bewertungsdatum.');
 if(p.start&&p.end&&p.start>p.end)fail('Der Bewertungszeitraum ist umgekehrt.');
 if(typeof c.scope_id!=='string'||typeof c.scope_description!=='string'||!Array.isArray(c.services_in_scope)||typeof c.scope_reviewed!=='boolean')fail('Ungültiger Bewertungsumfang.');
 const register=index(record.evidence_register,'evidence_id','Quellenverzeichnis');
 const questions=index(allQuestions(catalog),'id','Katalogfragen');
 for(const q of Object.values(questions))if(!Number.isInteger(q.level)||q.level<1||q.level>5)fail('Ungültige Fragenstufe: '+q.id);
 const responses=index(record.responses,'question_id','Antworten'),states={};
 for(const [qid,r] of Object.entries(responses)){
  if(!has(questions,qid))fail('Unbekannte Frage-ID: '+qid);
  if(fields.some(k=>!has(r,k))||Object.keys(r).some(k=>!fields.includes(k)))fail(qid+': unvollständige oder unbekannte Antwortfelder.');
  if(!has(answerStates,r.answer)||!findings.includes(r.finding))fail(qid+': ungültige Antwort.');
  if(!['pending','approved'].includes(r.review_status)||!['not_checked','sufficient','insufficient','conflicting'].includes(r.evidence_status))fail(qid+': ungültiger Bestätigungsstatus.');
  if(!Array.isArray(r.evidence_ids)||!Array.isArray(r.check_results)||typeof r.assessor_rationale!=='string')fail(qid+': ungültige Antwortdetails.');
  if(r.evidence_ids.some(id=>!has(register,id)))fail(qid+': unbekannte Quellen-ID.');
  const checks=index(r.check_results,'check_id','Prüfpunkte'),known=new Set((questions[qid].checks||[]).map(check=>check.id));
  if(Object.keys(checks).some(id=>!known.has(id)))fail(qid+': unbekannter Prüfpunkt.');
  states[qid]=r.review_status==='approved'?answerStates[r.answer]:'open';
 }
 for(const qid of Object.keys(questions))states[qid]??='open';
 if((record.extensions.criterion_ratings||[]).length)fail('Direktnoten gehören nicht zum neuen Fragenkatalog; bitte die neuen Fragen beantworten.');
 if((record.extensions.excluded_question_ids||[]).length||(record.extensions.criterion_applicability||[]).length)fail('Fragen oder PSFs dürfen ohne Katalogregel nicht ausgeschlossen werden.');
 return {questions,responses,states};
}
function qCompletion(qids,states){return {total:qids.length,completed:qids.filter(id=>states[id]!=='open').length};}
function requirementsFor(criterion,questions,start){
 const grouped={};
 for(const row of criterion.level_requirements||criterion.stages||[]){
  if(!Number.isInteger(row.level)||row.level<start||row.level>5||!Array.isArray(row.question_ids))fail('Ungültige Stufenzuordnung: '+criterion.id);
  grouped[row.level]=[...(grouped[row.level]||[]),...row.question_ids];
 }
 for(let n=start;n<=5;n++){
  if(!grouped[n]?.length)fail(criterion.id+': Anforderungen für Stufe '+n+' fehlen.');
  for(const qid of grouped[n])if(!has(questions,qid)||questions[qid].criterion_id!==criterion.id||questions[qid].level!==n)fail(criterion.id+': ungültiger Fragenbezug '+qid);
 }
 const used=Object.values(grouped).flat();if(new Set(used).size!==used.length)fail(criterion.id+': doppelte Stufenzuordnung.');
 return grouped;
}
/** No automatic filtering or isolated high-level bypass. All questions remain available. */
export function ladder(unitId,requirements,states,questions={},startLevel=1){
 const cumulative=[],rows=[];let lower=null,upper=startLevel-1,firstBlocked=null;
 for(let n=startLevel;n<=5;n++){
  const added=requirements[n]||[];if(!added.length)fail(unitId+': leere Fragenstufe '+n);
  cumulative.push(...added);
  const requirementStates=Object.fromEntries(cumulative.map(id=>[id,states[id]??'open']));
  const current=Object.values(requirementStates),fulfilled=current.every(s=>s==='fulfilled'),possible=current.every(s=>s!=='not_fulfilled');
  if(fulfilled)lower=n;if(possible)upper=n;
  if(firstBlocked===null&&added.some(id=>states[id]==='not_fulfilled'))firstBlocked=n;
  rows.push({level:n,fulfilled,possible,required_question_ids:[...cumulative],requirement_states:requirementStates,dependency_requirements:[]});
 }
 const below=firstBlocked===startLevel;if(below)lower=upper=startLevel-1;
 const complete=lower!==null&&lower===upper,used=unique(cumulative),state=id=>states[id]??'open';
 const result={...meta('highest_fully_fulfilled_cumulative_question_level'),unit_id:unitId,
  assessed_level:lower,possible_upper_level:upper,exact_value:complete?lower:null,partial_exact_value:!complete?lower:null,
  status:complete?(lower===0?'below_baseline':'confirmed'):lower===null?'open':'provisional',
  stage_complete:complete,value_complete:complete,scoring_complete:complete,scope_complete:true,
  completion:{total:1,completed:Number(complete)},question_completion:qCompletion(used,Object.fromEntries(used.map(id=>[id,state(id)]))),
  unrounded_mean:null,unrounded_upper_mean:null,component_level_evaluations:rows,required_question_ids:used,
  question_states:Object.fromEntries(used.map(id=>[id,state(id)])),
  blocking_question_ids:used.filter(id=>state(id)==='not_fulfilled'),
  open_question_ids:complete?[]:used.filter(id=>state(id)==='open'&&(firstBlocked===null||(questions[id]?.level??5)<=firstBlocked)),
  unanswered_question_ids:used.filter(id=>state(id)==='open'),
  higher_level_strength_question_ids:used.filter(id=>state(id)==='fulfilled'&&(questions[id]?.level??0)>(lower??0)),
  fulfilled_question_levels:Object.fromEntries(used.filter(id=>state(id)==='fulfilled').map(id=>[id,questions[id]?.level??null])),
  first_observed_level:startLevel,below_first_observed_level:below,level_1_source_question_exists:startLevel===1,
  classification_basis:below&&startLevel===2?'explicit_nonfulfilment_below_first_observed_level_2':'source_question_ladder',
  level_classification_note:below&&startLevel===2?'Unter der ersten erfassten Stufe 2 eingeordnet. Keine Stufe-1-Frage und kein behaupteter Stufe-1-Erfüllungsnachweis.':below?'Die Anforderungen der Ausgangsstufe 1 sind ausdrücklich nicht erfüllt.':null,
  aggregation_method:'highest_fully_fulfilled_cumulative_question_level',level_aggregation_method:'highest_fully_fulfilled_cumulative_question_level',
  value_incomplete_unit_ids:complete?[]:[unitId],stage_incomplete_unit_ids:complete?[]:[unitId],
  limiting_unit_ids:[],unit_results:[],limitations:[],consistency_notes:[]
 };
 if(complete)fractions.set(result,fraction(BigInt(lower)));return result;
}
function contextComplete(record){
 const c=record.context,p=c.assessment_period,periodComplete=(!p.start&&!p.end)||Boolean(p.start&&p.end);
 return Boolean(c.scope_id.trim()&&c.scope_description.trim()&&c.services_in_scope.some(v=>typeof v==='string'&&v.trim())&&c.scope_reviewed&&periodComplete);
}
const periodEqual=(a,b)=>a?.start===b?.start&&a?.end===b?.end;
const sameScope=(a,b)=>a.assessment_unit_id===b.assessment_unit_id&&a.scope_id===b.scope_id&&periodEqual(a.assessment_period,b.assessment_period);
function finalize(result,catalog,record,pid=null){
 const qids=pid?new Set(allQuestions(catalog).filter(q=>q.criterion_id?.startsWith(pid+'-')).map(q=>q.id)):null;
 Object.assign(result,{component_id:componentId(catalog),level_type:pid?'capability':'maturity',
  assessment_id:record.assessment_id,assessment_unit_id:record.assessment_unit_id,catalog_id:catalog.catalog_id,catalog_version:catalog.catalog_version,
  scope_id:record.context.scope_id,scope_description:record.context.scope_description,assessment_period:clone(record.context.assessment_period),
  context_status:contextComplete(record)?'complete':'scope_pending',
  scope_qualification:'Selbsteinschätzung für den angegebenen Umfang; keine externe Nachweisprüfung.',
  evidence_ids:unique(record.responses.filter(r=>!qids||qids.has(r.question_id)).flatMap(r=>r.evidence_ids))});
 return result;
}
function suspend(result,status,message){
 result.partial_exact_value??=result.exact_value??result.assessed_level;
 result.exact_value=result.unrounded_mean=result.unrounded_upper_mean=null;
 result.assessed_level=result.possible_upper_level=null;
 result.stage_complete=result.value_complete=result.scoring_complete=false;result.scope_complete=false;result.status=status;
 if(message)result.limitations.push(message);fractions.delete(result);return result;
}
function meanUnits(unitId,units){
 const complete=units.length>0&&units.every(u=>u.value_complete),completed=units.filter(u=>u.value_complete);
 const rational=complete?meanFraction(units):null,partial=completed.length?meanFraction(completed):null;
 const allLower=units.length&&units.every(u=>numeric(u.assessed_level));
 const lower=allLower?Math.floor(units.reduce((n,u)=>n+u.assessed_level,0)/units.length):null;
 const upper=units.length?Math.floor(units.reduce((n,u)=>n+(u.possible_upper_level??5),0)/units.length):5;
 const result={...meta('arithmetic_mean_of_complete_psf_stages'),unit_id:unitId,
  assessed_level:complete?floorOf(rational):lower,possible_upper_level:complete?floorOf(rational):upper,
  exact_value:complete?valueOf(rational):null,unrounded_mean:complete?valueOf(rational):null,unrounded_upper_mean:complete?valueOf(rational):null,
  partial_exact_value:!complete&&partial?valueOf(partial):null,status:complete?'confirmed':lower!==null?'provisional':'open',
  stage_complete:complete,value_complete:complete,scoring_complete:complete,scope_complete:true,
  completion:{total:units.length,completed:completed.length},
  question_completion:{total:units.reduce((n,u)=>n+u.question_completion.total,0),completed:units.reduce((n,u)=>n+u.question_completion.completed,0)},
  aggregation_method:'arithmetic_mean_floor',value_aggregation_method:'arithmetic_mean_of_complete_psf_stages',level_aggregation_method:'floor_of_complete_psf_mean',
  unit_results:units,blocking_question_ids:joined(units,'blocking_question_ids'),open_question_ids:joined(units,'open_question_ids'),
  unanswered_question_ids:joined(units,'unanswered_question_ids'),higher_level_strength_question_ids:joined(units,'higher_level_strength_question_ids'),
  fulfilled_question_levels:Object.assign({},...units.map(u=>u.fulfilled_question_levels)),question_states:Object.assign({},...units.map(u=>u.question_states)),
  limiting_unit_ids:[],weaker_criterion_ids:complete?units.filter(u=>u.exact_value<valueOf(rational)).map(u=>u.unit_id):[],
  value_incomplete_unit_ids:units.filter(u=>!u.value_complete).map(u=>u.unit_id),stage_incomplete_unit_ids:units.filter(u=>!u.stage_complete).map(u=>u.unit_id),
  partial_value_semantics:'Teilmittel nur aus vollständig bestimmten PSFs; kein vollständiger Practice-Wert.',limitations:[],consistency_notes:[]
 };
 if(complete)fractions.set(result,rational);return result;
}
function practiceScope(catalog,record){
 const ext=record.extensions,registry=catalog.practice_registry.map(p=>p.id),decisions=index(ext.scope_decisions||[],'practice_id','Practice-Auswahl');
 if(Object.keys(decisions).some(pid=>!registry.includes(pid)))fail('Unbekannte Practice in der Auswahl.');
 const selected=Object.keys(decisions).filter(pid=>decisions[pid].selection_status==='included');
 let valid=Boolean(ext.scope_review_complete===true&&Object.keys(decisions).length===registry.length&&selected.length);
 const mode=ext.assessment_mode||'svs_maturity';if(!['svs_maturity','practice_capability_only'].includes(mode))fail('Unbekannter Practice-Bewertungsmodus.');
 for(const row of Object.values(decisions)){
  if(!['included','not_selected','not_applicable','pending'].includes(row.selection_status))fail('Ungültige Practice-Auswahl.');
  if(row.selection_status==='pending')valid=false;
  if(row.reviewed!==true)valid=false;
  if(row.selection_status==='included'&&!['primary','supporting'].includes(row.scope_role))valid=false;
 }
 const required=ext.confirmed_required_practice_ids||[];
 if(!Array.isArray(required)||required.some(pid=>!registry.includes(pid)))fail('Unbekannte verpflichtende Practice.');
 if(required.some(pid=>!selected.includes(pid)))valid=false;
 if(mode==='svs_maturity'&&!selected.includes('PR02'))valid=false;
 const edges=index(catalog.dependency_hints||[],'id','Practice-Abhängigkeiten');
 for(const edge of ext.custom_dependency_edges||[]){
  if(!object(edge)||!edge.id||has(edges,edge.id)||!registry.includes(edge.from_practice_id)||!registry.includes(edge.to_practice_id))fail('Ungültige zusätzliche Practice-Abhängigkeit.');
  edges[edge.id]=edge;
 }
 const dependencies=index(ext.dependency_decisions||[],'dependency_id','Abhängigkeitsentscheidungen');
 for(const [id,decision] of Object.entries(dependencies)){
  if(!has(edges,id)||!['needed','not_needed'].includes(decision.decision))fail('Unbekannte oder ungültige Abhängigkeitsentscheidung.');
  if(decision.reviewed!==true)valid=false;const edge=edges[id];
  if(decision.decision==='needed'&&selected.includes(edge.from_practice_id)&&!selected.includes(edge.to_practice_id))valid=false;
 }
 return {selected,valid,mode,decisions};
}
function threshold(unit,target){
 if(!unit)return 'open';
 if(numeric(unit.assessed_level)&&unit.assessed_level>=target)return 'fulfilled';
 if(numeric(unit.possible_upper_level)&&unit.possible_upper_level<target)return 'not_fulfilled';
 return 'open';
}
export function practiceComponentEligibility(results,primary,supporting){
 let lower=null,upper=0;const rows=[];
 for(let n=1;n<=5;n++){
  const supportMinimum=n>=3?n-2:null;
  const requirements=primary.map(pid=>({practice_id:pid,scope_role:'primary',minimum_level:n,state:threshold(results[pid],n)}));
  if(supportMinimum!==null)requirements.push(...supporting.map(pid=>({practice_id:pid,scope_role:'supporting',minimum_level:supportMinimum,state:threshold(results[pid],supportMinimum)})));
  const fulfilled=primary.length>0&&requirements.every(r=>r.state==='fulfilled'),possible=primary.length>0&&requirements.every(r=>r.state!=='not_fulfilled');
  if(fulfilled)lower=n;if(possible)upper=n;
  rows.push({level:n,fulfilled,possible,key_minimum:n,supporting_minimum:supportMinimum,practice_requirements:requirements,requirement_states:{},dependency_requirements:[]});
 }
 const complete=primary.length>0&&lower!==null&&lower===upper;
 const limiting=rows.find(r=>r.level===(lower??0)+1)?.practice_requirements.filter(r=>r.state!=='fulfilled').map(r=>r.practice_id)||[];
 return {unit_id:'practices',assessed_level:lower,possible_upper_level:primary.length?upper:null,status:!primary.length?'partial_scope':complete?'confirmed':lower===null?'open':'provisional',stage_complete:complete,component_level_evaluations:rows,limiting_unit_ids:unique(limiting),aggregation_method:'explicit_role_thresholds'};
}
function practices(catalog,record,validated){
 const {selected,valid,mode,decisions}=practiceScope(catalog,record),results={},modules=index(catalog.assessment_modules,'practice_id','Practice-Module');
 for(const pid of selected){
  const m=modules[pid];if(!m)fail('Practice-Modul fehlt: '+pid);
  const units=m.criteria.map(c=>ladder(c.id,requirementsFor(c,validated.questions,2),validated.states,validated.questions,2));
  const result=meanUnits(pid,units);
  Object.assign(result,{practice_id:pid,module_id:m.module_id,module_version:m.module_version,scope_review_complete:valid,baseline_complete:null,baseline_source:'no_level_1_source_question'});
  results[pid]=finalize(result,catalog,record,pid);
 }
 const primary=selected.filter(pid=>decisions[pid].scope_role==='primary'),supporting=selected.filter(pid=>decisions[pid].scope_role==='supporting');
 const means=meanUnits('practices',Object.values(results)),role=practiceComponentEligibility(results,primary,supporting);
 Object.assign(means,{...role,...meta('practice_role_stage_with_equal_practice_mean'),scoring_complete:means.value_complete&&role.stage_complete,
  primary_practice_ids:primary,supporting_practice_ids:supporting,scope_review_complete:valid,scope_complete:valid,
  value_aggregation_method:'arithmetic_mean_of_selected_practice_exact_values',level_aggregation_method:'explicit_role_thresholds',category_level_source:'practice_role_thresholds',
  role_stage_result:clone(role),aspect_completion:{total:Object.values(results).reduce((n,r)=>n+r.completion.total,0),completed:Object.values(results).reduce((n,r)=>n+r.completion.completed,0)},
  partial_value_semantics:'Teilmittel nur aus vollständig bestimmten Practices; kein vollständiger Practices-Kategoriewert.'});
 if(!primary.length||!valid||mode==='practice_capability_only')suspend(means,'partial_scope',!primary.length?'Mindestens eine bestätigte Schlüssel-Practice ist erforderlich.':'Practice-Auswahl oder erforderliche Beiträge sind noch nicht vollständig bestätigt.');
 return [finalize(means,catalog,record),results];
}
function svcScope(record,result){
 const ext=record.extensions,rows=ext.value_stream_inventory||[];index(rows,'id','Abläufe vom Bedarf bis zum Ergebnis');
 const selected=rows.filter(r=>r.assessed===true);
 const complete=ext.inventory_reviewed===true&&ext.coverage_mode==='all_major_streams_in_scope'&&selected.length>0&&rows.every(r=>typeof r.is_major==='boolean')&&rows.filter(r=>r.is_major).every(r=>r.assessed===true);
 result.assessed_value_stream_ids=selected.map(r=>r.id);
 if(!complete)suspend(result,'partial_scope','Übersicht und vollständige Abdeckung der wesentlichen Abläufe sind noch nicht bestätigt.');
}
function category(catalog,record,validated,pr02){
 const id=componentId(catalog);if(catalog.criteria?.length!==1)fail('Der neue SVS-Katalog erwartet eine gemeinsame Fragenleiter je Kategorie.');
 const c=catalog.criteria[0],unit=ladder(c.id,requirementsFor(c,validated.questions,1),validated.states,validated.questions,1);
 const result={...unit,unit_id:id,unit_results:[unit],question_ladder_result:unit,category_level_source:'cumulative_source_questions'};
 if(unit.value_complete)fractions.set(result,fractions.get(unit));
 if(id==='service_value_chain')svcScope(record,result);
 if(id==='continual_improvement'){
  const same=pr02&&pr02.practice_id==='PR02'&&pr02.catalog_version===VERSION&&pr02.policy_id===POLICY_ID&&sameScope(pr02,{assessment_unit_id:record.assessment_unit_id,scope_id:record.context.scope_id,assessment_period:record.context.assessment_period});
  const usable=Boolean(same&&pr02.scope_review_complete&&pr02.stage_complete&&pr02.value_complete);
  result.dependency_status=usable?'compatible':'pending';result.dependency_policy='compatible_complete_PR02_confirmation_only_no_level_cap';
  result.dependency_requirements=[{source_id:'PR02',state:usable?'fulfilled':'open',minimum_level:null,compatibility_only:true}];
  result.component_level_evaluations=result.component_level_evaluations.map(row=>({...row,fulfilled:row.fulfilled&&usable,dependency_requirements:clone(result.dependency_requirements)}));
  if(!usable)suspend(result,'open','Eine passende vollständige PR02-Bewertung und bestätigte Practice-Auswahl fehlen. Die eigene CI-Fragenleiter bleibt sichtbar.');
 }
 return finalize(result,catalog,record);
}
function missing(id,catalog){return {...meta('missing_assessment'),unit_id:id,component_id:id,assessed_level:null,possible_upper_level:5,exact_value:null,partial_exact_value:null,
 status:'open',stage_complete:false,value_complete:false,scoring_complete:false,scope_complete:false,completion:{total:1,completed:0},
 question_completion:{total:catalog?allQuestions(catalog).length:0,completed:0},unit_results:[],component_level_evaluations:[],limiting_unit_ids:[],blocking_question_ids:[],open_question_ids:[],
 fulfilled_question_levels:{},question_states:{},limitations:['Bewertungsdatensatz fehlt.'],consistency_notes:[],missing_record:true,context_status:'scope_pending'};}
export function evaluate(catalog,record,pr02=null,options={}){
 if(options.mode!==undefined&&options.mode!==SIMPLIFIED_MODE)fail('Der neue Fragenkatalog unterstützt ausschließlich die gekennzeichnete Selbsteinschätzung.');
 const validated=validate(catalog,record);
 return componentId(catalog)==='practices'?practices(catalog,record,validated):category(catalog,record,validated,pr02);
}
export function evaluateAssessment(input,catalogs,options={}){
 const raw=catalogs?.raw||catalogs,records=input?.assessments||input;
 if(!object(raw)||!object(records))fail('Kataloge oder Bewertungsdatensätze fehlen.');
 if(Object.keys(records).some(id=>!ids.includes(id)))fail('Unbekannter Bewertungsbereich.');
 for(const id of Object.keys(records))if(!raw[id]||componentId(raw[id])!==id)fail('Falscher Bewertungskatalog für '+id);
 const components={},practiceResults={};
 if(has(records,'practices')){const [component,results]=evaluate(raw.practices,records.practices,null,options);components.practices=component;Object.assign(practiceResults,results);}
 for(const id of ids.filter(id=>id!=='practices'))if(has(records,id))components[id]=evaluate(raw[id],records[id],id==='continual_improvement'?practiceResults.PR02||null:null,options);
 const existing=Object.values(components);
 if(existing.length&&!existing.every(u=>sameScope(u,existing[0])))fail('SVS-Kategorien benötigen dieselbe Organisationseinheit, denselben Umfang und denselben Zeitraum.');
 for(const id of ids)components[id]??=missing(id,raw[id]);
 const units=ids.map(id=>components[id]),shared=existing.length===ids.length&&existing.every(u=>u.context_status==='complete');
 const scope=shared&&units.every(u=>u.scope_complete),stageComplete=scope&&units.every(u=>u.stage_complete),valueComplete=scope&&units.every(u=>u.value_complete);
 const rational=valueComplete?meanFraction(units):null,stage=stageComplete?Math.min(...units.map(u=>u.assessed_level)):null;
 const valueIncomplete=units.filter(u=>!u.value_complete).map(u=>u.unit_id),stageIncomplete=units.filter(u=>!u.stage_complete).map(u=>u.unit_id);
 const total={...meta('exact_component_mean_with_minimum_component_stage'),unit_id:'svs',component_id:'svs',level_type:'maturity',
  exact_value:rational?valueOf(rational):null,assessed_level:stage,
  possible_upper_level:stageComplete?stage:scope&&units.every(u=>numeric(u.possible_upper_level))?Math.min(...units.map(u=>u.possible_upper_level)):null,
  unrounded_mean:rational?valueOf(rational):null,unrounded_upper_mean:rational?valueOf(rational):null,partial_exact_value:null,
  status:stageComplete?(stage===0?'below_baseline':'confirmed'):'open',
  stage_complete:stageComplete,value_complete:valueComplete,scoring_complete:stageComplete&&valueComplete,scope_complete:scope,
  completion:{total:5,completed:units.filter(u=>u.value_complete).length},stage_completion:{total:5,completed:units.filter(u=>u.stage_complete).length},
  question_completion:{total:units.reduce((n,u)=>n+u.question_completion.total,0),completed:units.reduce((n,u)=>n+u.question_completion.completed,0)},
  context_status:shared?'complete':'scope_pending',value_aggregation_method:'arithmetic_mean_of_five_component_exact_values',level_aggregation_method:'minimum_of_five_component_stages',aggregation_method:'separate_mean_value_and_minimum_stage',
  value_incomplete_unit_ids:valueIncomplete,stage_incomplete_unit_ids:stageIncomplete,
  limiting_unit_ids:stageComplete?units.filter(u=>u.assessed_level===stage).map(u=>u.unit_id):stageIncomplete,
  missing_component_ids:ids.filter(id=>!has(records,id)),component_profile:units.map(u=>({component_id:u.component_id,assessed_level:u.assessed_level,possible_upper_level:u.possible_upper_level,exact_value:u.exact_value,status:u.status,stage_complete:u.stage_complete,value_complete:u.value_complete,completion:clone(u.completion)})),
  unit_results:units,blocking_question_ids:joined(units,'blocking_question_ids'),open_question_ids:joined(units,'open_question_ids'),
  fulfilled_question_levels:Object.assign({},...units.map(u=>u.fulfilled_question_levels)),higher_level_strength_question_ids:joined(units,'higher_level_strength_question_ids'),
  limitations:shared?[]:['Ein Gesamt-SVS-Ergebnis benötigt einen gemeinsamen bestätigten Umfang mit mindestens einer IT-Leistung.'],consistency_notes:[],
  graphic_rule:'Kategorieprofile einzeln darstellen. SVS-Durchschnitt und niedrigste Kategorie-Stufe getrennt ausweisen; alle Kategorien mit der niedrigsten Stufe sind begrenzend.'};
 if(rational)fractions.set(total,rational);
 return {...meta(total.scoring_method),component_results:components,practice_results:practiceResults,svs_result:total,exact_value:total.exact_value,assessed_level:stage,
  partial_exact_value:total.partial_exact_value,stage_complete:stageComplete,value_complete:valueComplete,scoring_complete:total.scoring_complete,
  scope_complete:scope,completion:clone(total.completion),stage_completion:clone(total.stage_completion),question_completion:clone(total.question_completion),
  value_aggregation_method:total.value_aggregation_method,level_aggregation_method:total.level_aggregation_method,consistency_notes:[]};
}
export function evaluateSimplifiedAssessment(input,catalogs){return evaluateAssessment(input,catalogs,{mode:SIMPLIFIED_MODE});}
export function collectionPlan(catalog,{selectedPracticeIds=null}={}){
 const qs=componentId(catalog)==='practices'&&selectedPracticeIds?(catalog.assessment_modules||[]).filter(m=>selectedPracticeIds.includes(m.practice_id)).flatMap(m=>m.questions):allQuestions(catalog);
 return {direct_question_ids:qs.map(q=>q.id),category_requirement_question_ids:componentId(catalog)==='practices'?[]:qs.map(q=>q.id),individual_question_ids:qs.map(q=>q.id),derived_views:[],shared_fact_bindings:{}};
}
export const all_questions=allQuestions;
export const evaluateSvs=(catalogs,records,options={})=>evaluateAssessment({assessments:records},catalogs,options);
export const evaluate_svs=evaluateSvs;

