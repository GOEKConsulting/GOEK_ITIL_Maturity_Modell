/** One question catalog and one calculation, independent of legacy depth labels. */
import {evaluateSimplifiedAssessment,InputError,POLICY_ID} from './scoring.js';
export const ASSESSMENT_DEPTHS=Object.freeze({
 quick:Object.freeze({id:'quick',label:'Fragenkatalog'}),
 detailed:Object.freeze({id:'detailed',label:'Fragenkatalog'}),
});
export const ASSESSMENT_POLICY_REVISION=1;
export const QUICK_POLICY_ID=POLICY_ID,DETAILED_POLICY_ID=POLICY_ID;
export const SVS_VALUE_AGGREGATION_METHOD='arithmetic_mean_of_five_component_exact_values';
export const SVS_LEVEL_AGGREGATION_METHOD='minimum_of_five_component_stages';
export const PRACTICES_VALUE_AGGREGATION_METHOD='arithmetic_mean_of_selected_practice_exact_values';
export const PRACTICES_LEVEL_AGGREGATION_METHOD='explicit_role_thresholds';
export function getAssessmentDepth(payload){
 const depth=payload?.assessment_depth??'quick';
 if(!Object.hasOwn(ASSESSMENT_DEPTHS,depth))throw new InputError('Unbekannte Bewertungstiefe; zulässig sind quick und detailed.');
 return depth;
}
export function evaluateModeAssessment(input,catalogs){
 const depth=getAssessmentDepth(input),result=evaluateSimplifiedAssessment(input,catalogs?.raw||catalogs);
 const visited=new Set();
 const annotate=unit=>{if(visited.has(unit))return;visited.add(unit);unit.assessment_depth=depth;unit.mode_label='Fragenkatalog';for(const child of unit.unit_results||[])annotate(child);};
 annotate(result.svs_result);for(const unit of Object.values(result.practice_results))annotate(unit);
 result.assessment_depth=depth;result.mode_label='Fragenkatalog';return result;
}

