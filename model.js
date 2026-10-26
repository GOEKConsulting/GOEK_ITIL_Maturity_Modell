import {allQuestions,evaluateAssessment} from './scoring.js';

export const COMPONENTS=[
{id:'guiding_principles',label:'Guiding Principles',short:'Leitprinzipien',color:'#606060'},
{id:'governance',label:'Governance',short:'Governance',color:'#601324'},
{id:'service_value_chain',label:'Service Value Chain',short:'Wertschöpfungskette',color:'#AF3147'},
{id:'practices',label:'Practices',short:'Management-Practices',color:'#951E38'},
{id:'continual_improvement',label:'Continual Improvement',short:'Kontinuierliche Verbesserung',color:'#EA4146'}];
export function reopenReviews(payload,evidenceId=null){
 let count=0;
 for(const record of Object.values(payload.assessments||{})){
 const ext=record.extensions||{};
 const affected=row=>evidenceId===null||(row.evidence_ids||[]).includes(evidenceId);
 const reopen=row=>{row.review_status='pending';if('reviewer_id' in row)row.reviewer_id=null;if('reviewed_at' in row)row.reviewed_at=null;if('evidence_status' in row)row.evidence_status='not_checked';};
 for(const response of record.responses||[])if(affected(response)||(response.check_results||[]).some(affected)){
  if(response.review_status==='approved')count++;
  reopen(response);
 }
 for(const rating of ext.criterion_ratings||[])if(affected(rating))reopen(rating);
 let scopeChanged=evidenceId===null;
 for(const key of ['scope_decisions','dependency_decisions'])for(const decision of ext[key]||[])if(affected(decision)){
  decision.reviewed=false;scopeChanged=true;
  if('scope_review_complete' in ext)ext.scope_review_complete=false;
 }
 for(const decision of [...Object.values(ext.scope_flag_decisions||{}),...(ext.criterion_applicability||[])])if(affected(decision)){
  reopen(decision);scopeChanged=true;
 }
 const coverageAffected=evidenceId===null||(ext.coverage_evidence_ids||[]).includes(evidenceId)||
  (ext.value_stream_inventory||[]).some(row=>(row.documentation_evidence_ids||[]).includes(evidenceId));
 if(coverageAffected&&'inventory_reviewed' in ext){ext.inventory_reviewed=false;scopeChanged=true;}
 if(evidenceId===null&&'scope_review_complete' in ext)ext.scope_review_complete=false;
 if(record.context){record.context.evidence_reviewed=false;if(scopeChanged)record.context.scope_reviewed=false;}
 }return count;
}
export function synchronizeEvidence(payload,register){for(const record of Object.values(payload.assessments||{}))record.evidence_register=structuredClone(register);}
export function applyContext(payload,context){
 const records=Object.values(payload.assessments||{});
 const relevant=['organization','scope_description','scope_id','services_in_scope','assessment_period'];
 const changed=records.some(record=>relevant.some(key=>JSON.stringify(record.context?.[key])!==JSON.stringify(context[key])));
 if(changed)reopenReviews(payload);
 for(const record of records){record.context=structuredClone(context);if(changed){record.context.scope_reviewed=false;record.context.evidence_reviewed=false;}}
 return changed;
}
export function chartProfile(result){return COMPONENTS.map(c=>{const r=result?.component_results?.[c.id];return {...c,level:r?.assessed_level??null,upper:r?.possible_upper_level??null,status:r?.status??'open',limiting:(result?.svs_result?.limiting_unit_ids||[]).includes(c.id)};});}
export function safeImport(data,catalogs){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Die Datei enthält keinen gültigen Bewertungsdatensatz.');
 const state=data.project||null,payload=structuredClone(state?.payload||data.payload||data);
 if(!payload.assessments||typeof payload.assessments!=='object'||Array.isArray(payload.assessments))throw new Error('Es fehlen die Bewertungsdatensätze unter „assessments“.');
 const expected=catalogs.components.map(c=>c.id);
 if(expected.some(id=>!payload.assessments[id])||Object.keys(payload.assessments).some(id=>!expected.includes(id)))throw new Error('Die Datei muss die fünf SVS-Bereiche dieses Fragenkatalogs enthalten.');
 for(const [id,record] of Object.entries(payload.assessments)){
  const catalog=catalogs.raw[id];
  if(!record||!Array.isArray(record.responses)||!Array.isArray(record.evidence_register)||!record.context||!record.extensions)throw new Error('Unvollständiger Datensatz in '+id+'.');
  if(record.catalog_id!==catalog.catalog_id||record.catalog_version!==catalog.catalog_version)throw new Error('Dieser Arbeitsstand gehört zu einem anderen Fragenkatalog. Bitte öffnen Sie ihn in der bisherigen Webseitenversion. Antworten auf frühere Fragen werden nicht automatisch auf neue Fragen übertragen.');
  const known=new Set(allQuestions(catalog).map(q=>q.id)),seen=new Set();
  for(const row of record.responses){
   if(!row||!known.has(row.question_id)||seen.has(row.question_id))throw new Error('Unbekannte oder doppelte Frage-ID in '+id+'.');
   seen.add(row.question_id);
   if(!['yes','partial','no','unknown'].includes(row.answer))throw new Error('Ungültige Antwort für '+row.question_id+'.');
  }
  record.assessment_execution_mode='draft_preview';
 }
 try{evaluateAssessment(payload,catalogs.raw,{mode:'simplified_self_assessment'});}catch(error){throw new Error('Import konnte nicht übernommen werden: '+error.message);}
 return {payload,state,migrated:false,migrationArchive:{}};
}
