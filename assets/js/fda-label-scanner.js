const OPENFDA_ENDPOINT = 'https://api.fda.gov/drug/label.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LABEL_SECTIONS = [
  'drug_interactions','drug_interactions_table','drug_and_or_laboratory_test_interactions','drug_and_or_laboratory_test_interactions_table','warnings','warnings_and_cautions','precautions','contraindications','dosage_and_administration','dosage_and_administration_table','clinical_pharmacology','pharmacokinetics','information_for_patients','patient_medication_information','spl_medguide','spl_patient_package_insert','food_safety_warning','food_safety_warning_table'
];
const FOOD_CONTEXT_TERMS = ['food','meal','meals','fat','fatty','fed','fasted','fasting','breakfast','diet','calorie','calories'];
const BROAD_TERMS = new Set(['food','meal','calories','absorption','bioavailability','auc','cmax']);
const TERM_CATEGORIES = [
  {name:'Fat / meal absorption effects', relevance:'Fat/meal absorption effect', priority:1, terms:['high-fat meal','high fat meal','high-fat high-calorie meal','high fat high calorie meal','high-calorie meal','high calorie meal','fatty meal','fat-containing meal','fat containing meal','fat content','meal high in fat','fed state','fed conditions','fasted state','fasted conditions','fasting conditions','effect of food','food effect','food-effect','with a high-fat meal','following a high-fat meal','meal increased','meal decreased','food increased','food decreased','absorption','absorbed','bioavailability','systemic exposure','exposure','AUC','Cmax','Tmax','plasma concentration','peak concentration','pharmacokinetics','delayed absorption','increased absorption','decreased absorption','reduced absorption','enhanced absorption']},
  {name:'Grapefruit and CYP food interaction terms', relevance:'Food/diet interaction language', priority:2, terms:['grapefruit','grapefruit juice','grapefruit products','Seville orange','Seville oranges','pomelo','pomelos','star fruit','starfruit']},
  {name:'Alcohol', relevance:'Diet-related warning', priority:3, terms:['alcohol','ethanol','alcoholic beverages','avoid alcohol','do not drink alcohol','alcohol-containing','alcohol containing']},
  {name:'Dairy, calcium, and mineral/cation interactions', relevance:'Food/diet interaction language', priority:4, terms:['milk','dairy','dairy products','calcium','calcium-containing','calcium containing','calcium-fortified','calcium fortified','iron','ferrous','magnesium','aluminum','zinc','multivalent cations','polyvalent cations','divalent cations','trivalent cations','mineral supplements','mineral-containing','antacids']},
  {name:'Vitamin K / diet consistency', relevance:'Diet-related warning', priority:5, terms:['vitamin K','vitamin k','leafy greens','leafy green vegetables','green leafy vegetables','spinach','kale','broccoli','brussels sprouts','collard greens','diet consistency','consistent diet']},
  {name:'Tyramine / MAOI-type food concerns', relevance:'Diet-related warning', priority:6, terms:['tyramine','aged cheese','aged cheeses','cured meats','fermented foods','fermented food','sauerkraut','soy sauce','tap beer','draft beer','red wine']},
  {name:'Enteral nutrition / tube feeds', relevance:'Food/diet interaction language', priority:7, terms:['enteral nutrition','enteral feeding','tube feeding','tube feeds','feeding tube','nutritional supplement','nutritional supplements']},
  {name:'Food timing / administration', relevance:'Food administration instruction', priority:8, terms:['take with food','taken with food','administer with food','administered with food','give with food','should be taken with food','must be taken with food','take with meals','taken with meals','administer with meals','take after meals','take before meals','take without food','taken without food','administer without food','empty stomach','take on an empty stomach','at least 1 hour before food','at least 2 hours after food','before breakfast','with breakfast','with evening meal','with the largest meal','calories','calorie meal']},
  {name:'Caffeine', relevance:'Food/diet interaction language', priority:9, terms:['caffeine','coffee','tea','cola','energy drinks','caffeinated beverages']},
  {name:'Fruit juice / transporter-related food language', relevance:'Food/diet interaction language', priority:10, terms:['fruit juice','apple juice','orange juice','grapefruit juice','juice']},
  {name:'Potassium / salt substitutes', relevance:'Diet-related warning', priority:11, terms:['potassium','potassium supplements','salt substitute','salt substitutes','potassium-containing salt substitutes']},
  {name:'Protein meal interactions', relevance:'Food/diet interaction language', priority:12, terms:['high-protein meal','high protein meal','protein-rich meal','protein rich meal','dietary protein','protein intake']}
];
const examples = ['Xarelto','isotretinoin','griseofulvin','levothyroxine','ciprofloxacin','doxycycline','linezolid','warfarin','fexofenadine','lurasidone','ziprasidone','posaconazole'];
const form = document.getElementById('fda-label-form');
const input = document.getElementById('medication');
const results = document.getElementById('interaction-results');
const submitButton = form.querySelector('button[type="submit"]');
const exampleWrap = document.getElementById('example-buttons');

function normalizeDrugName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120); }
function normalizeLabelText(value) { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function formatSectionName(section) { return section.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }
function formatFdaDate(value) { if (!value || !/^\d{8}$/.test(value)) return value || 'Not available'; return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`; }
function getFirst(value) { return Array.isArray(value) ? value.filter(Boolean).join(', ') : (value || 'Not available'); }
function buildOpenFdaLabelSearchUrl(drugName, exact = true) {
  const clean = normalizeDrugName(drugName);
  const encoded = exact ? `"${clean.replace(/"/g, '')}"` : clean;
  const fields = ['openfda.brand_name','openfda.generic_name','openfda.substance_name'];
  const search = fields.map(field => `${field}:${encoded}`).join(' OR ');
  return `${OPENFDA_ENDPOINT}?search=${encodeURIComponent(search)}&sort=effective_time:desc&limit=20`;
}
function cacheKey(name) { return `fda-label-food-fat:${normalizeDrugName(name).toLowerCase()}`; }
function getCachedLabels(name) { try { const cached = JSON.parse(localStorage.getItem(cacheKey(name)) || 'null'); return cached && Date.now() - cached.timestamp < CACHE_TTL_MS ? cached : null; } catch { return null; } }
function setCachedLabels(name, labels) { try { localStorage.setItem(cacheKey(name), JSON.stringify({timestamp:Date.now(), labels})); } catch {} }
async function fetchFdaLabels(name) {
  const cached = getCachedLabels(name);
  if (cached) return {...cached, fromCache:true};
  for (const exact of [true, false]) {
    const response = await fetch(buildOpenFdaLabelSearchUrl(name, exact), {headers:{Accept:'application/json'}});
    if (response.status === 404) continue;
    if (response.status === 429) throw new Error('RATE_LIMIT');
    if (!response.ok) throw new Error('NETWORK');
    const data = await response.json();
    const labels = data.results || [];
    if (labels.length) { setCachedLabels(name, labels); return {labels, timestamp:Date.now(), fromCache:false}; }
  }
  return {labels:[], timestamp:Date.now(), fromCache:false};
}
function labelMetadata(label) {
  const openfda = label.openfda || {};
  return {productName:getFirst(openfda.brand_name) !== 'Not available' ? getFirst(openfda.brand_name) : getFirst(openfda.generic_name), genericName:getFirst(openfda.generic_name), brandName:getFirst(openfda.brand_name), manufacturer:getFirst(openfda.manufacturer_name), effectiveDate:formatFdaDate(label.effective_time), setId:label.set_id || 'Not available', id:label.id || 'Not available'};
}
function extractLabelTextSections(label) { return LABEL_SECTIONS.flatMap(section => (label[section] || []).map(text => ({section, text:normalizeLabelText(text)}))).filter(item => item.text); }
function hasNearbyFoodContext(text, index) { const start = Math.max(0, index - 150); const end = Math.min(text.length, index + 150); const windowText = text.slice(start, end).toLowerCase(); return FOOD_CONTEXT_TERMS.some(term => windowText.includes(term)); }
function extractExcerpt(text, index, term) {
  const sentenceRe = /[^.!?]*(?:[.!?]|$)/g; let match; const sentences = [];
  while ((match = sentenceRe.exec(text)) !== null) { if (match[0].trim()) sentences.push({start:match.index, end:sentenceRe.lastIndex, text:match[0].trim()}); if (match[0] === '') sentenceRe.lastIndex += 1; }
  const hit = sentences.findIndex(s => index >= s.start && index <= s.end);
  let excerpt = hit >= 0 ? sentences.slice(Math.max(0, hit - 1), hit + 2).map(s => s.text).join(' ') : text.slice(Math.max(0,index-250), Math.min(text.length,index+term.length+250));
  if (excerpt.length > 650) excerpt = `${excerpt.slice(0, 647)}...`;
  return excerpt;
}
function highlightTerm(excerpt, term) { return escapeHtml(excerpt).replace(new RegExp(`(${escapeRegExp(term)})`, 'ig'), '<mark>$1</mark>'); }
function dedupeFindings(findings) { const seen = new Set(); return findings.filter(f => { const key = `${f.section}|${f.term.toLowerCase()}|${f.excerpt.slice(0,180).toLowerCase()}|${f.meta.setId}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function rankFindings(findings) { return findings.sort((a,b) => a.priority - b.priority || (b.excerpt.length - a.excerpt.length)); }
function scanForFoodFatTerms(labels) {
  const findings = [];
  labels.forEach(label => { const meta = labelMetadata(label); extractLabelTextSections(label).forEach(({section,text}) => { TERM_CATEGORIES.forEach(category => { category.terms.forEach(term => { const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'ig'); let match; while ((match = re.exec(text)) !== null) { const lower = term.toLowerCase(); if (BROAD_TERMS.has(lower) && !hasNearbyFoodContext(text, match.index)) continue; const excerpt = extractExcerpt(text, match.index, term); findings.push({category:category.name, relevance:category.relevance, priority:category.priority, term:match[0], section:formatSectionName(section), excerpt, meta}); } }); }); }); });
  return rankFindings(dedupeFindings(findings)).slice(0, 80);
}
function renderEmpty() { results.innerHTML = `<div class="interaction-empty-state"><span>Ready</span><h2>Scan FDA label language.</h2><p>Enter one medication name to search openFDA labels for food, fat, meal, alcohol, grapefruit, dairy, mineral, vitamin K, caffeine, tyramine, fruit juice, tube feed, and diet-related language.</p></div>${renderDisclaimer()}`; }
function renderDisclaimer() { return `<div class="interaction-disclaimer"><strong>Important disclaimer</strong><p>This tool searches FDA drug labeling for food, fat, meal, alcohol, grapefruit, dairy, mineral, vitamin K, caffeine, tyramine, fruit juice, tube feed, and diet-related language. It is not a complete clinical interaction checker and should not be used as a substitute for medical advice. Do not start, stop, or change a medication, supplement, or diet plan without checking with a qualified healthcare provider or pharmacist.</p></div>`; }
function renderError(message) { results.innerHTML = `<div class="interaction-alert"><strong>Unable to scan FDA label language</strong><p>${escapeHtml(message)}</p></div>${renderDisclaimer()}`; }
function renderNoFindings(timestamp, fromCache) { results.innerHTML = `${fromCache ? `<p class="interaction-note"><strong>Last checked:</strong> ${new Date(timestamp).toLocaleString()}</p>` : ''}<div class="interaction-empty-state"><span>No FDA label mention found</span><h2>No food, fat, or diet-related language was found in the FDA labeling searched by this tool.</h2><p>This does not guarantee that no interaction exists. It only means this tool did not find food, fat, or diet-related language in the FDA labeling records searched.</p></div>${renderDisclaimer()}`; }
function renderFindings(findings, timestamp, fromCache) {
  const cacheNote = fromCache ? `<p class="interaction-note"><strong>Last checked:</strong> ${new Date(timestamp).toLocaleString()}</p>` : '';
  const cards = findings.map(f => `<article class="interaction-result-card"><div class="interaction-card-top"><span class="finding-pill">${escapeHtml(f.relevance)}</span><span class="finding-category">${escapeHtml(f.category)}</span></div><h2>FDA label language found: ${escapeHtml(f.term)}</h2><p class="interaction-description">${highlightTerm(f.excerpt, f.term)}</p><div class="interaction-field"><span>Product</span><p>${escapeHtml(f.meta.productName)}</p></div><div class="interaction-field"><span>Generic</span><p>${escapeHtml(f.meta.genericName)}</p></div><div class="interaction-field"><span>Brand</span><p>${escapeHtml(f.meta.brandName)}</p></div><div class="interaction-field"><span>Manufacturer</span><p>${escapeHtml(f.meta.manufacturer)}</p></div><div class="interaction-field"><span>Effective date</span><p>${escapeHtml(f.meta.effectiveDate)}</p></div><div class="interaction-field"><span>Label section</span><p>${escapeHtml(f.section)}</p></div><div class="interaction-field"><span>FDA IDs</span><p>set_id: ${escapeHtml(f.meta.setId)}<br>id: ${escapeHtml(f.meta.id)}</p></div></article>`).join('');
  results.innerHTML = `${cacheNote}<p class="interaction-note"><strong>${findings.length}</strong> FDA label mention${findings.length === 1 ? '' : 's'} found. Results are source excerpts from FDA labeling, not a complete clinical interaction check.</p>${cards}${renderDisclaimer()}`;
}
examples.forEach(example => { const button = document.createElement('button'); button.type = 'button'; button.className = 'example-chip'; button.textContent = example; button.addEventListener('click', () => { input.value = example; input.focus(); }); exampleWrap.appendChild(button); });
form.addEventListener('submit', async event => { event.preventDefault(); const medication = normalizeDrugName(input.value); if (!medication) { renderError('Enter one medication name.'); return; } submitButton.disabled = true; submitButton.textContent = 'Scanning…'; results.innerHTML = '<div class="interaction-loading">Scanning FDA labeling with openFDA…</div>'; try { const data = await fetchFdaLabels(medication); if (!data.labels.length) { renderError('No FDA labeling records were found for this medication name. Try a brand or generic name.'); return; } const findings = scanForFoodFatTerms(data.labels); if (!findings.length) renderNoFindings(data.timestamp, data.fromCache); else renderFindings(findings, data.timestamp, data.fromCache); } catch (error) { if (error.message === 'RATE_LIMIT') renderError('The FDA label service is temporarily limiting requests. Please try again later.'); else renderError('Could not reach the FDA label service. Please try again.'); } finally { submitButton.disabled = false; submitButton.textContent = 'Scan FDA Label'; } });
renderEmpty();
