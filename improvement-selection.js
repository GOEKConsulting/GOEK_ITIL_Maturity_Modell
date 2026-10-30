/** Shared read-only grouping for the results workspace and its PDF report. */
import {COMPONENTS} from './model.js';

const isLevel=value=>Number.isInteger(value)&&value>=0&&value<=5;
const compareIds=(left,right)=>String(left||'').localeCompare(String(right||''),'de-DE',{numeric:true});
const compareLevels=(left,right)=>left===null?(right===null?0:1):right===null?-1:left-right;
const knownLevel=value=>isLevel(value)?value:null;
const empty=()=>({categories:[],practices:[],featuredCategories:[],featuredPractices:[],otherCategories:[],otherPractices:[]});

/** A provisional lower bound is never treated as an assessed category/Practice. */
export function improvementStage(unit){
  if(!unit||unit.scope_complete===false||unit.scope_review_complete===false)return null;
  if(unit.stage_complete!==true)return null;
  if(['open','provisional','partial_scope','needs_reconciliation','not_classifiable'].includes(unit.status))return null;
  return knownLevel(unit.assessed_level);
}

/** Native item copies retain their IDs, complete sources and adoption drafts. */
export function selectImprovementGroups({plan,result,catalogs,project,payload}={}){
  if(!plan||!result)return empty();
  payload=payload||project?.payload||{};
  const decisions=payload.assessments?.practices?.extensions?.scope_decisions||[];
  const selected=new Set(decisions.filter(row=>row.selection_status==='included').map(row=>row.practice_id));
  const registry=Array.isArray(catalogs?.practices)?catalogs.practices:
    catalogs?.raw?.practices?.practice_registry||catalogs?.practices?.practice_registry||[];
  const knownPractices=registry.length?new Set(registry.map(row=>row.id)):null;
  const responses=new Map(COMPONENTS.map(component=>[component.id,
    new Map((payload.assessments?.[component.id]?.responses||[]).map(row=>[row.question_id,row]))]));
  const componentOrder=new Map(COMPONENTS.map((component,index)=>[component.id,index]));
  const sourceItems=[],seen=new Set();
  const sourcePractice=q=>catalogs?.questionsById?.get?.(q.id)?.practiceId||
    /^XLS423-(PR\d{2})-R\d{3}$/.exec(q.id)?.[1]||null;
  for(const item of plan.items||[]){
    if(!item||typeof item.id!=='string'||seen.has(item.id)||!componentOrder.has(item.componentId))continue;
    seen.add(item.id);
    const questions=item.questions||[],questionIds=item.questionIds||[],ids=new Set(questions.map(q=>q.id));
    if(!questions.length||ids.size!==questions.length||questionIds.length!==ids.size||questionIds.some(id=>!ids.has(id)))continue;
    const record=responses.get(item.componentId);
    if(!questions.every(q=>{
      const actual=record.get(q.id);
      return actual?.review_status==='approved'&&['no','partial'].includes(actual.answer)&&actual.answer===q.answer;
    }))continue;
    if(item.componentId==='practices'&&questions.some(q=>{
      const id=sourcePractice(q);
      return id&&(!selected.has(id)||improvementStage(result.practice_results?.[id])===null||
        (item.practiceId&&item.practiceId!==id));
    }))continue;
    if(!isLevel(item.targetLevel))continue;
    sourceItems.push(item);
  }
  const categories=[],practiceItems=[];
  for(const component of COMPONENTS){
    const stage=improvementStage(result.component_results?.[component.id]);
    if(stage===null||stage>=5)continue;
    const candidate=sourceItems.filter(item=>item.componentId===component.id&&!item.practiceId&&
      item.targetLevel>stage&&(component.id!=='practices'||item.isCategorySummary===true))
      .sort((a,b)=>a.targetLevel-b.targetLevel||compareIds(a.id,b.id))[0];
    if(candidate)categories.push({...structuredClone(candidate),improvementGroup:'category',categoryStage:stage,practiceStage:null});
  }
  for(const item of sourceItems){
    if(item.componentId!=='practices'||!item.practiceId||!item.psfId||!selected.has(item.practiceId)||
       (knownPractices&&!knownPractices.has(item.practiceId)))continue;
    const stage=improvementStage(result.practice_results?.[item.practiceId]);
    if(stage===null||stage>=5||!isLevel(item.currentLevel)||item.targetLevel<=item.currentLevel)continue;
    practiceItems.push({...structuredClone(item),improvementGroup:'practice',practiceStage:stage,
      categoryStage:improvementStage(result.component_results?.practices)});
  }
  categories.sort((a,b)=>a.categoryStage-b.categoryStage||componentOrder.get(a.componentId)-componentOrder.get(b.componentId));
  const comparePracticeItems=(a,b)=>a.practiceStage-b.practiceStage||compareIds(a.practiceId,b.practiceId)||
    compareLevels(knownLevel(a.currentLevel),knownLevel(b.currentLevel))||a.targetLevel-b.targetLevel||
    compareIds(a.psfId,b.psfId)||compareIds(a.id,b.id);
  practiceItems.sort(comparePracticeItems);
  const practices=[],practiceIds=new Set();
  for(const item of practiceItems)if(!practiceIds.has(item.practiceId)){
    practiceIds.add(item.practiceId);practices.push(item);
  }
  const featuredCategories=categories.slice(0,2),featuredPractices=practices.slice(0,2);
  const featuredPracticeIds=new Set(featuredPractices.map(item=>item.id));
  return {categories,practices,featuredCategories,featuredPractices,
    otherCategories:categories.slice(2),otherPractices:practiceItems.filter(item=>!featuredPracticeIds.has(item.id))};
}
