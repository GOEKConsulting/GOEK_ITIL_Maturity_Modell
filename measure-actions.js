/** Reversible measure removal. Storage and UI updates belong to the caller. */
export function deleteMeasure(project,id,{deletedAt=new Date().toISOString()}={}){
  if(!Array.isArray(project?.actions)||id==null||id==='')return false;
  if(project.deletedActions!=null&&!Array.isArray(project.deletedActions))return false;
  const index=project.actions.findIndex(action=>action?.id===id);
  if(index<0)return false;
  const action=project.actions[index];
  if(!project.deletedActions)project.deletedActions=[];
  project.deletedActions.push({action,index,deletedAt});
  project.actions.splice(index,1);
  return true;
}

export function restoreLastDeletedMeasure(project){
  const history=project?.deletedActions;
  if(!Array.isArray(history)||!history.length)return {status:'empty'};
  const entry=history[history.length-1],action=entry?.action;
  if(!action||action.id==null||project.actions!=null&&!Array.isArray(project.actions))return {status:'conflict'};
  const actions=project.actions||[];
  const hasSource=action.sourceSuggestionId!=null&&action.sourceSuggestionId!=='';
  if(actions.some(active=>active?.id===action.id||hasSource&&active?.sourceSuggestionId===action.sourceSuggestionId))return {status:'conflict'};
  const index=Number.isInteger(entry.index)?Math.min(Math.max(0,entry.index),actions.length):actions.length;
  if(!project.actions)project.actions=actions;
  actions.splice(index,0,action);
  history.pop();
  return {status:'restored',action};
}
