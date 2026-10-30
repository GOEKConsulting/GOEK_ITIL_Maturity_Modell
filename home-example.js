/** Fresh, synthetic chart data for the public landing page only. */
export function homeExampleResult(){
  const profile=[['guiding_principles',3],['governance',4],['service_value_chain',3],['practices',2],['continual_improvement',3]];
  const levels=profile.map(([,level])=>level),minimum=Math.min(...levels);
  const complete=level=>({assessed_level:level,possible_upper_level:level,exact_value:level,
    status:'confirmed',stage_complete:true,value_complete:true,scoring_complete:true,scope_complete:true});
  return {
    is_example:true,
    counts:{categoriesWithStage:5,practicesWithStage:34,selectedPractices:34},
    component_results:Object.fromEntries(profile.map(([id,level])=>[id,{unit_id:id,...complete(level)}])),
    svs_result:{unit_id:'svs',...complete(minimum),exact_value:levels.reduce((sum,level)=>sum+level,0)/levels.length,
      limiting_unit_ids:profile.filter(([,level])=>level===minimum).map(([id])=>id),
      completion:{total:profile.length,completed:profile.length}},
  };
}
