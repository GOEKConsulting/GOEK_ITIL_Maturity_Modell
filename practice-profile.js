/** Read-only practice capability profile. Thresholds come from the evaluated role rows. */
import {selectedPracticeIds} from './catalogs.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const level=value=>Number.isInteger(value)&&value>=1&&value<=5;
const levels=[5,4,3,2,1];

function practiceState(unit){
  if(level(unit?.assessed_level)&&unit.stage_complete===true)
    return {level:unit.assessed_level,status:'confirmed',text:`Stufe ${unit.assessed_level}`};
  if(level(unit?.assessed_level)&&unit.status==='provisional')
    return {level:unit.assessed_level,status:'provisional',text:`Mindestens ${unit.assessed_level} (vorläufig)`};
  return {level:null,status:'open',text:'Noch offen'};
}

function columnHtml(entry,hasThreshold){
  const state=practiceState(entry.result);
  return `<div class="practice-profile-column${hasThreshold?' has-profile-threshold':''}" role="listitem" data-profile-practice="${esc(entry.id)}" data-profile-level="${state.level??'open'}" data-profile-status="${state.status}">
    <button type="button" class="practice-profile-link" data-practice="${esc(entry.id)}" aria-label="${esc(`${entry.label} · ${entry.id} · ${state.text} · Bewertungsfragen öffnen`)}" title="${esc(`Bewertungsfragen für ${entry.label} öffnen`)}">
    <span class="practice-profile-cells" aria-hidden="true">${levels.map(n=>`<span class="practice-profile-cell${state.level!==null&&n<=state.level?` practice-profile-cell--${state.status}`:''}" data-profile-level="${n}">${n}</span>`).join('')}</span>
    <span class="practice-profile-name">${esc(entry.label)}</span><span class="practice-profile-id">${esc(entry.id)}</span><span class="practice-profile-value${state.status==='provisional'?' practice-profile-value--provisional':''}">${esc(state.text)}</span>
    </button>
  </div>`;
}

function groupHtml(role,title,entries,category,row){
  const trusted=category?.stage_complete===true&&category?.scope_complete===true&&row;
  const minimum=trusted?(role==='primary'?row.key_minimum:role==='supporting'?row.supporting_minimum:null):null;
  const threshold=level(minimum)?minimum:null;
  const thresholdTop=threshold!==null?(5-threshold)*44:null;
  let explanation;
  if(threshold!==null)explanation=`Die gestrichelte Linie zeigt die Anforderung für Kategorie-Stufe ${category.assessed_level}: mindestens Stufe ${threshold}.`;
  else if(trusted&&role==='supporting'&&minimum===null)
    explanation=`Für unterstützende Practices gilt bei Kategorie-Stufe ${category.assessed_level} keine Mindeststufe. Daher erscheint keine Schwellenlinie.`;
  else if(role==='unassigned')explanation='Die Rolle dieser einbezogenen Practices ist noch offen. Es wird keine Rollenschwelle zugeordnet.';
  else explanation='Eine Schwellenlinie erscheint, sobald die Kategorie-Stufe und der Bewertungsumfang feststehen.';
  return `<figure class="practice-profile-group practice-profile-group--${role}" data-profile-group="${role}" aria-label="${esc(title)}">
    <figcaption class="practice-profile-group-title">${esc(title)}</figcaption>
    ${entries.length?`<p class="practice-profile-explanation">${esc(explanation)}</p>
    <div class="practice-profile-scroll" tabindex="0" role="region" aria-label="${esc(`${title}: Practice-Spalten, bei Bedarf seitlich scrollen`)}">
      <div class="practice-profile-chart" style="--profile-columns:${entries.length};${thresholdTop!==null?`--profile-threshold-top:${thresholdTop}px;`:''}">
        <div class="practice-profile-axis" aria-hidden="true">${levels.map(n=>`<span>${n}</span>`).join('')}</div>
        <div class="practice-profile-plot">
          ${threshold!==null?`<div class="practice-profile-threshold" data-profile-threshold="${threshold}" style="top:${thresholdTop}px" aria-hidden="true"></div>`:''}
          <div class="practice-profile-columns" role="list">${entries.map(entry=>columnHtml(entry,threshold!==null)).join('')}</div>
        </div>
      </div>
    </div>`:`<p class="practice-profile-empty">Keine ${role==='primary'?'Schlüssel-Practices':role==='supporting'?'unterstützenden Practices':'Practices ohne festgelegte Rolle'} ausgewählt.</p>`}
  </figure>`;
}

/** Rendering never changes answers, scope decisions, result objects or browser storage. */
export function practiceProfileHtml({result,catalogs,project}={}){
  const category=result?.component_results?.practices;
  const decisions=project?.payload?.assessments?.practices?.extensions?.scope_decisions||[];
  const registry=catalogs?.practices||[];
  const entries=[...new Set(selectedPracticeIds(project?.payload||{}))].map(id=>{
    const practice=registry.find(item=>item.id===id),decision=decisions.find(item=>item.practice_id===id);
    return {id,label:practice?.name_de||practice?.label||id,role:decision?.scope_role,
      result:result?.practice_results?.[id]};
  });
  const primary=entries.filter(entry=>entry.role==='primary');
  const supporting=entries.filter(entry=>entry.role==='supporting');
  const unassigned=entries.filter(entry=>!['primary','supporting'].includes(entry.role));
  const compact=entries.length<=6&&primary.length>0&&supporting.length>0;
  const row=(category?.component_level_evaluations||[]).find(item=>item.level===category.assessed_level);
  const categoryText=category?.stage_complete===true&&Number.isInteger(category.assessed_level)
    ?`Kategorie-Stufe ${category.assessed_level}`
    :category?.status==='provisional'&&level(category.assessed_level)
      ?`Kategorie: mindestens ${category.assessed_level} (vorläufig)`:'Kategorie-Stufe noch offen';
  return `<section class="practice-profile" data-practice-profile aria-label="Practice-Profil">
    <div class="practice-profile-heading"><h3>Practice-Profil</h3><span>${esc(categoryText)}</span></div>
    <div class="practice-profile-groups${compact?' practice-profile-groups--compact':''}">
    ${groupHtml('primary','Primary Practices · Schlüssel-Practices',primary,category,row)}
    ${groupHtml('supporting','Supporting Practices · Unterstützende Practices',supporting,category,row)}
    ${unassigned.length?groupHtml('unassigned','Rolle noch offen',unassigned,category,null):''}
    </div>
    <p class="practice-profile-footer">Vollfarbe: bestimmte Stufe. Schraffiert: vorläufige Untergrenze. Offen bedeutet keinen Wert von 0. Stufe 1 wird bei ausdrücklicher Nichterfüllung unterhalb Stufe 2 abgeleitet; eine eigene Stufe-1-Frage ist nicht hinterlegt.</p>
  </section>`;
}
