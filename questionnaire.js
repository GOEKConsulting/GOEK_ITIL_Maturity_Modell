import {getAssessmentQuestions,selectedPracticeIds,makePendingResponse,invalidateResponse,
  answerFinding,questionAnswerIsSelected,markQuestionAnswerSelection} from './catalogs.js';
import {resubmitSimpleAnswer} from './answer-reconfirmation.js';

const ANSWERS = ['yes','partial','no','unknown'];
const ANSWER_OPTIONS = [{id:'yes',label:'Ja'},{id:'partial',label:'Teilweise'},{id:'no',label:'Nein'},{id:'unknown',label:'Unklar'}];
const esc = value => String(value ?? '').replace(/[&<>"']/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const optionsHtml = (items,value) => items.map(item => `<option value="${esc(item.id)}"${item.id === value ? ' selected' : ''}>${esc(item.label)}</option>`).join('');
const responseFor = (record,id) => record?.responses?.find(row => row.question_id === id);
const questionOrder = (a,b) => (a.level || 0)-(b.level || 0) || (a.source_row ?? a.order ?? 0)-(b.source_row ?? b.order ?? 0);
const plainGroupTitle = (question,index) => String(question.psfTitle || question.psf_title || question.groupTitle || question.criterionTitle || '')
  .replace(/^PSF\s*\d+\s*[:.\-–]?\s*/i,'').trim() || `Thema ${index + 1}`;

/** A deliberate answer, including "Unklar", permits the next navigation step. */
export function isQuestionAnswered(record,questionId,ui = {}) {
  const row = responseFor(record,questionId);
  return Boolean(questionAnswerIsSelected(row,ui) && row.review_status === 'approved' && ANSWERS.includes(row.answer));
}

/** Retain canonical fields without inventing an evidence review. */
export function updateResponse(record,questionId,changes) {
  record.responses ||= [];
  let row = responseFor(record,questionId);
  if (!row) { row = makePendingResponse(questionId); record.responses.push(row); }
  const allowed = new Set(['answer','finding','evidence_status','evidence_ids','check_results','assessor_rationale','reviewer_id']);
  for (const [key,value] of Object.entries(changes)) {
    if (!allowed.has(key)) throw new Error(`Nicht erlaubtes Antwortfeld: ${key}.`);
    row[key] = key === 'check_results' ? value.map(check => ({...check,rationale:check.rationale ?? ''})) : value;
  }
  if (Object.hasOwn(changes,'answer')) {
    row.finding = answerFinding(row.answer); row.review_status = 'approved';
    row.evidence_status = 'not_checked'; row.reviewer_id = null; row.reviewed_at = null;
  }
  return row;
}

export function submitSimpleAnswer(record,questionId,answer,ui = {}) {
  const selected = ANSWERS.includes(answer);
  markQuestionAnswerSelection(ui,questionId,selected);
  const row = updateResponse(record,questionId,{answer:selected ? answer : 'unknown',check_results:[]});
  if (!selected) invalidateResponse(row);
  return row;
}

export function canResubmitAnswer(row,ui = {}) {
  return Boolean(row?.review_status === 'pending' && questionAnswerIsSelected(row,ui) && ANSWERS.includes(row.answer));
}

export function reviewResponse(record,question) {
  const row = responseFor(record,question.id);
  if (!row) return {ok:false,errors:['Bitte eine Antwort auswählen.']};
  updateResponse(record,question.id,{answer:row.answer});
  return {ok:true,errors:[]};
}

export function questionContextKey(componentId,practiceId,groupId) {
  return componentId === 'practices' ? `practices:${practiceId}:${groupId}` : componentId;
}
const introductionSeen = (ui,record,componentId) => Boolean(Array.isArray(ui.introductionsSeen)
  ? ui.introductionsSeen.includes(componentId) : ui.introductionsSeen?.[componentId]) || record?.extensions?.introduction_seen === true;
const savedQuestionId = (ui,key) => typeof ui.questionProgress?.[key] === 'string' ? ui.questionProgress[key] : ui.questionProgress?.[key]?.questionId;

/** Pure state: visiting never creates responses or confirms an assessment scope. */
export function buildQuestionnaireState({catalogs,payload,ui = {},result = null}) {
  const component = catalogs.components.find(item => item.id === ui.componentId) || catalogs.components[0];
  const componentId = component.id,record = payload.assessments?.[componentId];
  const practices = catalogs.practices.filter(practice => selectedPracticeIds(payload).includes(practice.id));
  const practice = componentId === 'practices' ? practices.find(item => item.id === ui.practiceId) || practices[0] || null : null;
  const scopeQuestions = getAssessmentQuestions(catalogs,payload,{...ui,componentId,practiceId:practice?.id || null},result);
  const groups = [];
  for (const question of scopeQuestions) {
    const id = question.groupId || question.psfId || componentId;
    if (!groups.some(group => group.id === id)) groups.push({id,title:plainGroupTitle(question,groups.length)});
  }
  const requestedGroup = scopeQuestions.find(question => question.id === ui.questionId)?.groupId;
  const group = [requestedGroup,ui.groupId,ui.psfId,ui.practiceGroupIds?.[practice?.id]].map(id => groups.find(item => item.id === id)).find(Boolean) || groups[0] || null;
  const questions = scopeQuestions.filter(question => componentId !== 'practices' || (question.groupId || question.psfId) === group?.id).slice().sort(questionOrder);
  const contextKey = questionContextKey(componentId,practice?.id || null,group?.id || componentId);
  const firstUnanswered = questions.findIndex(question => !isQuestionAnswered(record,question.id,ui));
  const lastUnlockedIndex = firstUnanswered < 0 ? questions.length - 1 : firstUnanswered;
  const allowed = id => {const index = questions.findIndex(question => question.id === id);return index >= 0 && index <= lastUnlockedIndex;};
  const remembered = savedQuestionId(ui,contextKey);
  const questionId = allowed(ui.questionId) ? ui.questionId : allowed(remembered) ? remembered : questions[Math.max(0,lastUnlockedIndex)]?.id || null;
  const index = questions.findIndex(question => question.id === questionId),question = questions[index] || null;
  const introduction = componentId === 'practices' ? '' : String(component.catalog.introduction || '');
  const introductionRequired = Boolean(introduction && !introductionSeen(ui,record,componentId));
  const showIntroduction = Boolean(introduction && (introductionRequired || ui.introductionView === componentId));
  return {component,componentId,record,practices,practice,scopeQuestions,groups,group,questions,contextKey,
    firstUnanswered,lastUnlockedIndex,question,index,introduction,introductionRequired,showIntroduction,
    answered:scopeQuestions.filter(item => isQuestionAnswered(record,item.id,ui)).length,
    answeredInGroup:questions.filter(item => isQuestionAnswered(record,item.id,ui)).length,
    stages:componentId === 'practices' ? [2,3,4,5] : [1,2,3,4,5],
    canVisit:id => !showIntroduction && allowed(id),
    canContinue:Boolean(!showIntroduction && question && isQuestionAnswered(record,question.id,ui))};
}

/** One saved question per category, or per selected Practice and theme. */
export function questionNavigationChanges(state,ui,questionId) {
  if (!state.canVisit(questionId)) return null;
  return {componentId:state.componentId,practiceId:state.practice?.id || null,groupId:state.group?.id || null,
    psfId:state.componentId === 'practices' ? state.group?.id || null : null,questionId,introductionView:null,
    questionProgress:{...ui.questionProgress,[state.contextKey]:questionId},
    ...(state.practice ? {practiceGroupIds:{...ui.practiceGroupIds,[state.practice.id]:state.group.id}} : {})};
}

export function introductionNavigationChanges(state,ui = {}) {
  const seen = Array.isArray(ui.introductionsSeen) ? Object.fromEntries(ui.introductionsSeen.map(id => [id,true])) : {...ui.introductionsSeen};
  seen[state.componentId] = true;
  const id = state.introductionRequired ? state.questions[0]?.id : state.question?.id;
  return {componentId:state.componentId,practiceId:null,groupId:state.group?.id || null,psfId:null,
    introductionsSeen:seen,introductionView:null,questionId:id || null,
    questionProgress:{...ui.questionProgress,...(id ? {[state.contextKey]:id} : {})}};
}

function stageButtons(state) {
  return `<div class="question-stage-nav" role="group" aria-label="Stufen">${state.stages.map(level => {
    const first = state.questions.find(question => question.level === level);
    return `<button type="button" class="stage-button${state.question?.level === level && !state.showIntroduction ? ' active' : ''}" data-level="${level}" aria-pressed="${state.question?.level === level && !state.showIntroduction}"${!first || !state.canVisit(first.id) ? ' disabled' : ''}>Stufe ${level}</button>`;
  }).join('')}</div>`;
}

function nextStep(state,catalogs,ui) {
  if (!state.question) return null;
  if (state.index + 1 < state.questions.length) return {kind:'question',id:state.questions[state.index + 1].id,label:'Weiter →'};
  if (state.practice) {
    const groupIndex = state.groups.findIndex(group => group.id === state.group.id);
    const nextGroup = state.groups[groupIndex + 1] || state.groups.find(group => group.id !== state.group.id && state.scopeQuestions.some(question => question.groupId === group.id && !isQuestionAnswered(state.record,question.id,ui)));
    if (nextGroup) return {kind:'group',id:nextGroup.id,label:'Nächstes Thema →'};
    const nextPractice = state.practices[state.practices.findIndex(practice => practice.id === state.practice.id) + 1];
    return nextPractice ? {kind:'practice',id:nextPractice.id,label:'Nächste Practice →'} : {kind:'results',label:'Ergebnisse ansehen →'};
  }
  const nextComponent = catalogs.components[catalogs.components.findIndex(item => item.id === state.componentId) + 1];
  return nextComponent ? {kind:'component',id:nextComponent.id,label:'Nächste Kategorie →'} : {kind:'results',label:'Ergebnisse ansehen →'};
}

function answerStatus(row,ui) {
  if (!questionAnswerIsSelected(row,ui)) return 'Noch keine Antwort gewählt.';
  if (row.review_status !== 'approved') return 'Die bisherige Antwort muss für den aktuellen Umfang bestätigt werden.';
  return {yes:'Ja gespeichert.',partial:'Teilweise gespeichert.',no:'Nein gespeichert.',unknown:'Unklar gespeichert. Sie können mit der nächsten Frage fortfahren.'}[row.answer] || 'Noch keine Antwort gewählt.';
}

function cardHtml(state,ui,step) {
  const question = state.question,row = responseFor(state.record,question.id),criteria = state.practice ? question.criteriaText || question.criterion_text || '' : '';
  const choices = question.answerOptions?.length ? question.answerOptions : ANSWER_OPTIONS;
  const selected = questionAnswerIsSelected(row,ui) ? row.answer : '',evidence = state.record?.evidence_register || [];
  const canGoBack = state.index > 0 || state.componentId !== 'practices' && Boolean(state.introduction) || state.groups.indexOf(state.group) > 0;
  return `<article class="card question-card" data-question-id="${esc(question.id)}"><div class="question-card-meta"><span>Frage ${state.index + 1} von ${state.questions.length}</span><span class="badge">Stufe ${question.level}</span></div>
    <h2><span class="question-prompt">${esc(question.text)}</span></h2>
    ${criteria ? `<details class="question-criterion"><summary>Kriterium anzeigen</summary><p>${esc(criteria)}</p></details>` : ''}
    <label class="field simple-answer">Ihre Antwort<select id="question-answer"><option value=""${selected ? '' : ' selected'}>Bitte auswählen</option>${optionsHtml(choices,selected)}</select></label>
    <p class="simple-answer-status" role="status">${esc(answerStatus(row,ui))}</p>
    ${canResubmitAnswer(row,ui) ? '<button type="button" class="btn btn-secondary" id="resubmit-current-answer">Antwort für aktuellen Umfang übernehmen</button>' : ''}
    <details class="optional-evidence"><summary>Notiz & Nachweise (optional)</summary><label class="field">Notiz<textarea id="question-rationale" rows="3">${esc(row?.assessor_rationale)}</textarea></label>
      ${evidence.length ? `<fieldset class="evidence-picker"><legend>Nachweise zuordnen</legend>${evidence.map(item => `<label class="evidence-option"><input type="checkbox" data-evidence-id="${esc(item.evidence_id)}"${row?.evidence_ids?.includes(item.evidence_id) ? ' checked' : ''}><span>${esc(item.title)}</span></label>`).join('')}</fieldset>` : ''}
      <button type="button" class="btn btn-secondary btn-small" id="go-evidence">Nachweisregister öffnen</button></details>
    <div class="question-nav"><button type="button" class="btn btn-secondary" id="previous-question"${canGoBack ? '' : ' disabled'}>← Zurück</button><span class="muted">${state.answeredInGroup} von ${state.questions.length} beantwortet</span><button type="button" class="btn btn-primary" id="next-question"${state.canContinue ? '' : ' disabled'}${step?.kind === 'results' && state.canContinue ? ' data-route="results"' : ''}>${esc(step?.label || 'Weiter →')}</button></div></article>`;
}

export function questionnaireHtml(options) {
  const {catalogs,payload,ui = {},result = null} = options,state = buildQuestionnaireState({catalogs,payload,ui,result});
  const {component,componentId,practice,practices,group,groups,question,showIntroduction} = state,step = nextStep(state,catalogs,ui);
  return `<section class="source-questionnaire"><div class="page-head assessment-heading"><div><span class="eyebrow">Bewertung</span><h1>${esc(component.label)}</h1></div><div class="assessment-heading-score"><strong>${state.answered} / ${state.scopeQuestions.length}</strong><span>Fragen beantwortet</span></div></div>
    <div class="component-tabs" role="group" aria-label="SVS-Bereich">${catalogs.components.map(item => `<button type="button" class="btn ${item.id === componentId ? 'btn-primary active' : 'btn-secondary'}" data-component="${item.id}" aria-pressed="${item.id === componentId}">${esc(item.label)}</button>`).join('')}</div>
    ${componentId === 'practices' && practices.length ? `<div class="card practice-selector"><label class="field">Practice<select id="assessment-practice">${optionsHtml(practices.map(item => ({id:item.id,label:item.name_de || item.label || item.name_en})),practice.id)}</select></label><label class="field">Erfolgsfaktor der Practice (PSF)<select id="assessment-group">${optionsHtml(groups.map(item => ({id:item.id,label:item.title})),group?.id)}</select></label></div>` : ''}
    <div class="question-toolbar"><p class="muted">${practice ? esc(group?.title) : showIntroduction ? 'Einführung' : 'Beantworten Sie die Fragen der Reihe nach.'}</p><button type="button" class="btn btn-secondary" id="conversation-toggle" aria-pressed="${Boolean(ui.conversation)}">${ui.conversation ? 'Detailansicht' : 'Gesprächsansicht'}</button></div>
    ${!question ? '<div class="card empty-state"><h2>Practices auswählen</h2><p class="muted">Wählen Sie die Practices aus, die Sie untersuchen möchten.</p><button type="button" class="btn btn-primary" data-route="practices">Zur Practice-Auswahl</button></div>' : `<div class="question-layout${ui.conversation ? ' conversation-mode' : ''}"${ui.conversation ? ' style="grid-template-columns:minmax(0,1fr)"' : ''}>
      ${ui.conversation ? '' : `<aside class="card question-index"><span class="eyebrow">Stufen & Fragen</span>${state.introduction ? `<button type="button" class="${showIntroduction ? 'active' : ''}" id="show-introduction">Einführung</button>` : ''}${stageButtons(state)}<ol class="question-list">${state.questions.map((item,index) => `<li><button type="button" data-question="${esc(item.id)}" class="question-list-item${question.id === item.id && !showIntroduction ? ' active' : ''}" aria-current="${question.id === item.id && !showIntroduction ? 'step' : 'false'}"${state.canVisit(item.id) ? '' : ' disabled'}><span class="question-list-id">Frage ${index + 1} · Stufe ${item.level}</span><span>${isQuestionAnswered(state.record,item.id,ui) ? esc(ANSWER_OPTIONS.find(option => option.id === responseFor(state.record,item.id)?.answer)?.label || 'Beantwortet') : 'Noch nicht beantwortet'}</span></button></li>`).join('')}</ol></aside>`}
      <div>${ui.conversation ? stageButtons(state) : ''}${showIntroduction ? `<article class="card question-card introduction-card"><span class="badge">Einführung</span><h2>${esc(component.label)}</h2><div class="question-intro-text">${esc(state.introduction)}</div><div class="question-nav"><button type="button" class="btn btn-primary" id="introduction-continue">${state.introductionRequired ? 'Weiter zu Frage 1 →' : 'Zurück zu den Fragen →'}</button></div></article>` : cardHtml(state,ui,step)}</div></div>`}</section>`;
}

export function renderQuestionnaire(container,options) {
  const {catalogs,payload,ui = {},result = null,onChange = () => {},onNavigate = () => {},onEvidence} = options;
  const state = buildQuestionnaireState({catalogs,payload,ui,result}),step = nextStep(state,catalogs,ui);
  container.innerHTML = questionnaireHtml(options);
  const navigate = changes => {if (!changes) return;Object.assign(ui,changes);onNavigate(changes);};
  const visit = id => navigate(questionNavigationChanges(state,ui,id));
  const change = reason => onChange({reason,componentId:state.componentId,questionId:state.question?.id});
  const remember = () => {const patch = questionNavigationChanges(state,ui,state.question?.id);if (patch) Object.assign(ui,patch);};
  const switchGroup = id => navigate({groupId:id,psfId:id,questionId:null,introductionView:null,practiceGroupIds:{...ui.practiceGroupIds,[state.practice.id]:id}});
  const switchPractice = id => navigate({componentId:'practices',practiceId:id,groupId:ui.practiceGroupIds?.[id] || null,psfId:null,questionId:null,introductionView:null});
  container.querySelectorAll('[data-component]').forEach(button => button.onclick = () => navigate({componentId:button.dataset.component,groupId:null,psfId:null,questionId:null,introductionView:null}));
  const practiceSelect = container.querySelector('#assessment-practice');
  if (practiceSelect) practiceSelect.onchange = event => switchPractice(event.target.value);
  const groupSelect = container.querySelector('#assessment-group');
  if (groupSelect) groupSelect.onchange = event => switchGroup(event.target.value);
  container.querySelector('#conversation-toggle').onclick = () => navigate({conversation:!ui.conversation});
  const introButton = container.querySelector('#introduction-continue');
  if (introButton) introButton.onclick = () => navigate(introductionNavigationChanges(state,ui));
  const showIntro = container.querySelector('#show-introduction');
  if (showIntro) showIntro.onclick = () => navigate({introductionView:state.componentId});
  container.querySelectorAll('[data-question]').forEach(button => button.onclick = () => visit(button.dataset.question));
  container.querySelectorAll('[data-level]').forEach(button => button.onclick = () => visit(state.questions.find(question => question.level === Number(button.dataset.level))?.id));
  if (state.showIntroduction || !state.question || !state.record) return;
  const current = () => responseFor(state.record,state.question.id);
  container.querySelector('#question-answer').onchange = event => {remember();submitSimpleAnswer(state.record,state.question.id,event.target.value,ui);change(event.target.value ? 'answer' : 'answer-cleared');};
  const resubmit = container.querySelector('#resubmit-current-answer');
  if (resubmit) resubmit.onclick = () => {if (!canResubmitAnswer(current(),ui)) return;remember();resubmitSimpleAnswer(state.record,state.question.id,ui);change('answer');};
  const auxiliary = (changes,reason) => {remember();if (!current()) markQuestionAnswerSelection(ui,state.question.id,false);updateResponse(state.record,state.question.id,changes);change(reason);};
  container.querySelector('#question-rationale').oninput = event => auxiliary({assessor_rationale:event.target.value},'rationale');
  container.querySelectorAll('[data-evidence-id]').forEach(input => input.onchange = () => auxiliary({evidence_ids:[...container.querySelectorAll('[data-evidence-id]:checked')].map(item => item.dataset.evidenceId)},'evidence-link'));
  container.querySelector('#go-evidence').onclick = () => onEvidence?.({questionId:state.question.id,componentId:state.componentId});
  container.querySelector('#previous-question').onclick = () => {
    if (state.index > 0) visit(state.questions[state.index - 1].id);
    else if (state.introduction) navigate({introductionView:state.componentId});
    else {const previousGroup = state.groups[state.groups.indexOf(state.group) - 1];if (previousGroup) switchGroup(previousGroup.id);}
  };
  container.querySelector('#next-question').onclick = () => {
    if (!isQuestionAnswered(state.record,state.question.id,ui)) return;
    if (step?.kind === 'question') visit(step.id);
    else if (step?.kind === 'group') switchGroup(step.id);
    else if (step?.kind === 'practice') switchPractice(step.id);
    else if (step?.kind === 'component') navigate({componentId:step.id,questionId:null,groupId:null,psfId:null,introductionView:null});
  };
}
