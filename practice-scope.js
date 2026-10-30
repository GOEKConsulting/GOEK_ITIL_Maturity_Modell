/** Include the catalog Practices without changing answers or scope aggregates. */
export function includeAllPracticesAsPrimary(extension,practices){
  if(!extension||typeof extension!=='object'||Array.isArray(extension))throw new TypeError('Practice-Erweiterungen fehlen.');
  if(!Array.isArray(practices))throw new TypeError('Der Practice-Katalog muss eine Liste sein.');
  const ids=[],catalogIds=new Set();
  for(const practice of practices){
    if(!practice||typeof practice.id!=='string'||!practice.id.trim())throw new TypeError('Eine Practice-ID im Katalog fehlt.');
    if(catalogIds.has(practice.id))throw new Error('Doppelte Practice-ID im Katalog: '+practice.id);
    catalogIds.add(practice.id);ids.push(practice.id);
  }
  const rows=extension.scope_decisions===undefined?[]:extension.scope_decisions;
  if(!Array.isArray(rows))throw new TypeError('Die Practice-Auswahl muss eine Liste sein.');
  const indexed=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object'||typeof row.practice_id!=='string'||!row.practice_id.trim())throw new TypeError('Eine Practice-ID in der Auswahl fehlt.');
    if(indexed.has(row.practice_id))throw new Error('Doppelte Practice-ID in der Auswahl: '+row.practice_id);
    indexed.set(row.practice_id,row);
  }
  // Validate the whole input first; duplicate identifiers must not be hidden by
  // a merge or leave an already partly updated selection behind.
  let changed=false;
  for(const id of ids){
    let row=indexed.get(id);
    if(!row){
      row={practice_id:id,selection_status:'included',scope_role:'primary',implementation_presence:'unknown',
        objective_ids:[],value_stream_ids:[],rationale:'',evidence_ids:[],reviewed:true};
      rows.push(row);indexed.set(id,row);changed=true;
    }else if(row.selection_status!=='included'||row.scope_role!=='primary'||row.reviewed!==true){
      row.selection_status='included';row.scope_role='primary';row.reviewed=true;changed=true;
    }
  }
  if(changed&&extension.scope_decisions===undefined)extension.scope_decisions=rows;
  return {selectedCount:ids.length,changed};
}
