/** Static guidance for the existing workspaces; no project or browser state. */
const workflow=[
  {route:'context',title:'Projekt & Umfang',text:'Beschreiben Sie Umfang und Services und bestätigen Sie den gemeinsamen Umfang aller fünf Kategorien. Erfassen Sie für die Service Value Chain die untersuchten Wertströme, ihre Abdeckung und die Beteiligung Dritter. Organisation und Zeitraum können Sie ergänzen.'},
  {route:'practices',title:'Practice-Auswahl',text:'Legen Sie Auswahl und Rollen fest und bestätigen Sie diese. Für eine Vollbewertung können Sie alle 34 Practices als Schlüsselpractices auswählen. Für die SVS-Bewertung benötigen Sie PR02 „Kontinuierliche Verbesserung“ und mindestens eine Schlüssel-Practice. Continual Improvement setzt die vollständige PR02-Bewertung im gleichen Umfang voraus.'},
  {route:'evidence',title:'Nachweise (optional)',text:'Bei Bedarf erfassen Sie Dokumente, konkrete Fälle oder Gesprächsnotizen mit ihrer Fundstelle und verknüpfen sie mit passenden Fragen. Nachweise sind freiwillig; Sie können die Bewertung auch ohne Nachweise durchführen.'},
  {route:'assessment',title:'Fragenkatalog',text:'Lesen Sie die Einführung und beantworten Sie die Fragen der SVS-Kategorien von Stufe 1 bis 5. Bei Practices wählen Sie einen Erfolgsfaktor und folgen den Stufen 2 bis 5. Antworten Sie mit Ja, Teilweise, Nein oder Unklar. Bei Practice-Fragen können Sie das zugehörige Kriterium aufklappen.'},
  {route:'tasks',title:'Offene Punkte (bei Bedarf)',text:'Falls Angaben fehlen oder unklar sind, finden Sie hier die Klärungspunkte. Halten Sie bei Bedarf die benötigte Information, Zuständigkeit und einen Termin fest und öffnen Sie die betroffene Frage.'},
  {route:'results',title:'Ergebnisse & Maßnahmen',text:'Prüfen Sie SVS-Grafik, Kategorie-Stufen und Practice-Profile. Übernehmen Sie passende Verbesserungsvorschläge als Maßnahmen oder legen Sie eigene an. Ihre Ergebnisse können Sie präsentieren und als PDF herunterladen.'},
];

const glossary=[
  ['Service Value System (SVS)','Das Zusammenspiel von Grundsätzen, Führung, Abläufen, Practices und kontinuierlicher Verbesserung, durch das eine Organisation wertvolle Leistungen schafft.'],
  ['Fünf SVS-Kategorien','Guiding Principles (Leitprinzipien), Governance (Führung und Steuerung), Service Value Chain (Service-Wertschöpfungskette), Practices und Continual Improvement (kontinuierliche Verbesserung).'],
  ['Practice','Ein Aufgabenbereich des IT-Service-Managements, etwa Störungsmanagement. Dazu gehören Menschen, Arbeitsweisen, Informationen und Hilfsmittel. Im Tool wählen Sie die zu untersuchenden Practices aus.'],
  ['Erfolgsfaktor einer Practice (PSF)','Ein wesentlicher Teilbereich, der zum Erfolg einer Practice beiträgt. Im Fragenkatalog besitzt jeder Erfolgsfaktor eine eigene Stufenleiter.'],
  ['Kriterium','Die inhaltliche Anforderung hinter einer Frage. Bei Practice-Fragen können Sie das Kriterium unter der Frage aufklappen und damit prüfen, ob die Anforderung vollständig erfüllt ist.'],
  ['Bewertungsumfang','Die festgelegten Services, Organisationsteile und gegebenenfalls Standorte und Zeiträume, auf die sich Ihre Antworten beziehen. Alle fünf Kategorien müssen denselben Umfang betreffen.'],
  ['Wertstrom','Der zusammenhängende Weg vom Bedarf bis zum Ergebnis einer Leistung. Die Abdeckung beschreibt, ob alle wesentlichen oder nur ausgewählte Wertströme untersucht wurden.'],
  ['Schlüssel-Practice und unterstützende Practice','Die Rolle einer einbezogenen Practice im Bewertungsumfang. Sie bestimmt, welche Mindeststufe die Practice für die angestrebte Practices-Kategorie erreichen muss.'],
  ['Stufe','Die im Tool erreichte Einstufung anhand der erfüllten Anforderungen. Höhere Stufen setzen die darunterliegenden Anforderungen voraus. Die finale SVS-Stufe entspricht der niedrigsten Kategorie-Stufe.'],
  ['Durchschnitt','Ein zusätzlicher Mittelwert der zugrunde liegenden Bewertungen im Tool. Er wird ohne Zwischenrundung berechnet und mit zwei Nachkommastellen angezeigt. Durchschnitt und finale Stufe können voneinander abweichen.'],
  ['Nachweis','Eine freiwillige Quelle zu einer Antwort, zum Beispiel ein konkreter Fall, eine Kennzahlenreihe oder eine Gesprächsnotiz. Die Quelle allein bestätigt die Antwort nicht automatisch.'],
  ['Maßnahme','Ein geplanter Schritt zur Verbesserung mit Zielbeitrag, Priorität, Zuständigkeit und Termin. Sie können Vorschläge übernehmen, individuell bearbeiten oder eigene Maßnahmen anlegen.'],
];

const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function homeWorkflowHtml(){
  return `<section class="card home-workflow" aria-labelledby="home-workflow-title"><div class="section-title"><h2 id="home-workflow-title">Ihr Weg zur Bewertung</h2></div><ol class="home-workflow-list">${workflow.map(step=>`<li class="home-workflow-step"><div class="home-workflow-copy"><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div><button type="button" class="btn btn-quiet home-workflow-open" data-route="${step.route}" aria-label="${esc(step.title)} öffnen">Öffnen</button></li>`).join('')}</ol><p class="home-workflow-help">Weitere Erläuterungen zur Berechnung finden Sie in den <button type="button" class="btn btn-quiet" data-route="help">FAQ</button>.</p></section>`;
}

export function homeGlossaryHtml(){
  return `<section class="card home-glossary" aria-labelledby="home-glossary-title"><div class="section-title"><h2 id="home-glossary-title">Begriffslexikon</h2></div><div class="home-glossary-list">${glossary.map(([term,definition])=>`<details class="home-glossary-entry"><summary>${esc(term)}</summary><p>${esc(definition)}</p></details>`).join('')}</div></section>`;
}
