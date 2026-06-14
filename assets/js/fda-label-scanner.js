const WORKER_ENDPOINT = 'https://fda-food-fat-ai-scanner.curly-lake-5061.workers.dev/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'fda-food-fat-worker-scan:';
const EXAMPLES = ['Xarelto','isotretinoin','griseofulvin','levothyroxine','ciprofloxacin','doxycycline','linezolid','warfarin','fexofenadine','lurasidone','ziprasidone','posaconazole'];
const PERMANENT_DISCLAIMER = 'This tool only checks FDA drug labeling for possible interactions or considerations between medications and MCT oil, including Tricaprin. It is not a complete clinical interaction checker and should not be used as a substitute for medical advice. Do not start, stop, or change a medication, supplement, or diet plan without checking with a qualified healthcare provider or pharmacist.';
const NO_FINDINGS_MESSAGE = 'No food, fat, or diet-related language was found in the FDA labeling searched by this tool.';
const NO_FINDINGS_LIMITATION = 'This does not guarantee that no interaction exists. It only means this tool did not find food, fat, or diet-related language in the FDA labeling records searched.';
const CATEGORY_LABELS = {fat_meal_absorption:'Fat / meal absorption effect',food_timing:'Food administration instruction',grapefruit:'Grapefruit / citrus',alcohol:'Alcohol',dairy_minerals:'Dairy / calcium / minerals',vitamin_k:'Vitamin K / diet consistency',tyramine:'Tyramine foods',caffeine:'Caffeine',fruit_juice:'Fruit juice',potassium_salt_substitute:'Potassium / salt substitutes',tube_feeds:'Tube feeds / enteral nutrition',protein_meal:'Protein meal',other_food_diet:'Other food/diet language'};
const SEVERITY_LABELS = {avoid:'Avoid',caution:'Caution',administration_instruction:'Administration instruction',absorption_effect:'Absorption effect',unclear:'Unclear / label mention'};

const form = document.getElementById('fda-label-form');
const input = document.getElementById('medication');
const results = document.getElementById('interaction-results');
const submitButton = form?.querySelector('button[type="submit"]');
const refreshButton = document.getElementById('refresh-scan');
const exampleWrap = document.getElementById('example-buttons');
let lastResponse = null;

function normalizeDrugName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120); }
function normalizedCacheName(value) { return normalizeDrugName(value).toLowerCase(); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function toArray(value) { return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []; }
function cacheKey(name) { return `${CACHE_PREFIX}${normalizedCacheName(name)}`; }
function getCachedScanResult(name) { try { const cached = JSON.parse(localStorage.getItem(cacheKey(name)) || 'null'); return cached && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL_MS ? cached : null; } catch { return null; } }
function setCachedScanResult(name, result) { try { localStorage.setItem(cacheKey(name), JSON.stringify({timestamp:Date.now(), result})); } catch {} }
function formatCategoryLabel(category) { return CATEGORY_LABELS[category] || String(category || 'Other food/diet language').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function formatSeverityLabel(severity) { return SEVERITY_LABELS[severity] || formatCategoryLabel(severity || 'unclear'); }
function formatFdaDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const day = Number(text.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toLocaleDateString('en-US', {timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric'});
    }
  }
  return text;
}
function field(label, value) { const clean = Array.isArray(value) ? value.filter(Boolean).join(', ') : value; return clean ? `<div class="interaction-field"><span>${escapeHtml(label)}</span><p>${escapeHtml(clean)}</p></div>` : ''; }

async function scanFoodFatLabel(drug) {
  const clean = normalizeDrugName(drug);
  console.info('FDA food/fat scanner request', {drug: clean, endpoint: WORKER_ENDPOINT});
  let response;
  try {
    response = await fetch(WORKER_ENDPOINT, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({drug: clean})});
  } catch (error) {
    console.warn('FDA food/fat scanner network failure', {message: error?.message});
    throw new Error('Could not complete the scan. Please try again.');
  }
  const data = await response.json().catch(() => ({}));
  console.info('FDA food/fat scanner response', {status: response.status, ok: data?.ok, resultStatus: data?.status});
  if (!response.ok) throw new Error(data?.error || 'Could not complete the scan. Please try again.');
  if (data && data.ok === false) throw new Error(data.error || 'The scanner returned an error. Please try again.');
  return normalizeResponse(data);
}

function normalizeResponse(data) {
  const aiSummary = data.aiSummary || {};
  return {...data, aiSummary:{...aiSummary, mainCategories:toArray(aiSummary.mainCategories), findings:toArray(aiSummary.findings)}, rawExcerpts:toArray(data.rawExcerpts), findings:toArray(data.findings)};
}

function renderDisclaimer(responseDisclaimer) {
  return `<div class="interaction-disclaimer"><strong>Limitations / Disclaimer</strong><p>${escapeHtml(PERMANENT_DISCLAIMER)}</p>${responseDisclaimer ? `<p class="mt-3">${escapeHtml(responseDisclaimer)}</p>` : ''}</div>`;
}
function renderEmpty() { results.innerHTML = `<div class="interaction-empty-state"><span>Ready</span><h2>Check MCT oil / Tricaprin considerations.</h2><p>Enter one medication name. We send only that medication name to the Cloudflare Worker, then display FDA label language and MCT oil / Tricaprin context returned by the backend.</p></div>${renderDisclaimer()}`; }
function renderError(message) { results.innerHTML = `<div class="interaction-alert"><strong>Unable to scan FDA labeling</strong><p>${escapeHtml(message)}</p></div>${renderDisclaimer()}`; }

function renderLoading(medication) {
  return `<div class="interaction-loading interaction-loading-card">
    <div class="loading-orb" aria-hidden="true"></div>
    <span class="loading-kicker">Real-time MCT oil interaction scan</span>
    <h2>Checking ${escapeHtml(medication)} against FDA labeling</h2>
    <p>We are now conducting a <strong>real-time scan</strong> of FDA labeling to get you the most up-to-date and accurate answer about MCT oil / Tricaprin considerations.</p>
    <div class="scan-progress" aria-hidden="true"><span></span></div>
    <ol class="scan-steps">
      <li>Searching FDA-approved prescription and OTC drug labels</li>
      <li>Reviewing food, fat, meal, absorption, and caution language</li>
      <li>Building a patient-friendly MCT oil / Tricaprin answer</li>
    </ol>
  </div>`;
}
function renderSearchedDrug(data) { return data.drugSearched ? `<article class="interaction-result-card interaction-searched-drug">${field('Searched drug', data.drugSearched)}</article>` : ''; }
function renderMctSafetyQuestion(data) {
  const drug = normalizeDrugName(data.drugSearched || input?.value);
  return drug ? `<h2 class="mct-safety-question">Can you take MCT oil (tricaprin) with ${escapeHtml(drug)}?</h2>` : '';
}
function renderMctSafety(data) {
  const badge = data.aiSummary?.mctSafetyBadge;
  const reason = data.aiSummary?.mctSafetyReason;
  if (!badge && !reason) return '';
  const isCaution = String(badge || '').toLowerCase() === 'use caution';
  const badgeClass = isCaution ? 'mct-badge-caution' : 'mct-badge-safe';
  return `<div class="mct-result-badge-wrap">${renderMctSafetyQuestion(data)}${badge ? `<span class="mct-result-badge ${badgeClass}">${escapeHtml(badge)}</span>` : ''}${reason ? `<p class="mct-badge-reason">${escapeHtml(reason)}</p>` : ''}</div>`;
}
function renderMctContext(data) { return data.aiSummary?.mctOilContext ? `<article class="interaction-result-card"><h2>MCT Oil / Tricaprin Context</h2><p class="interaction-description">${escapeHtml(data.aiSummary.mctOilContext)}</p></article>` : ''; }
function renderSummary(data) {
  const summary = data.aiSummary?.plainEnglishSummary || data.message || (data.status === 'no_food_fat_language_found' ? NO_FINDINGS_MESSAGE : 'FDA label scan complete.');
  return `<article class="interaction-result-card"><div class="interaction-card-top"><span class="finding-pill">${escapeHtml(data.status === 'food_fat_language_found' ? 'FDA label language found' : 'FDA label scan')}</span>${data.labelsReviewed ? `<span class="finding-category">${escapeHtml(data.labelsReviewed)} labels reviewed</span>` : ''}${data.excerptsFound != null ? `<span class="finding-category">${escapeHtml(data.excerptsFound)} relevant excerpts found</span>` : ''}</div><h2>Summary</h2><p class="interaction-description">${escapeHtml(summary)}</p></article>`;
}
function renderTakeaway(data) { return data.aiSummary?.practicalTakeaway ? `<article class="interaction-result-card"><h2>Practical Takeaway</h2><p class="interaction-description">${escapeHtml(data.aiSummary.practicalTakeaway)}</p></article>` : ''; }
function renderCaution(data) { return data.aiSummary?.patientFriendlyCaution ? `<article class="interaction-result-card"><h2>Patient-Friendly Caution</h2><p class="interaction-description">${escapeHtml(data.aiSummary.patientFriendlyCaution)}</p></article>` : ''; }
function renderCategories(data) { const cats = data.aiSummary?.mainCategories || []; return cats.length ? `<article class="interaction-result-card"><h2>Main Categories</h2><div class="interaction-chip-row">${cats.map(c => `<span class="finding-category">${escapeHtml(formatCategoryLabel(c))}</span>`).join('')}</div></article>` : ''; }
function renderFindings(data) { const findings = data.aiSummary?.findings || []; if (!findings.length) return ''; return `<article class="interaction-result-card"><h2>FDA Label Findings</h2>${findings.map(f => `<div class="finding-subcard"><div class="interaction-card-top"><span class="finding-pill">${escapeHtml(formatSeverityLabel(f.severityLanguage))}</span><span class="finding-category">${escapeHtml(formatCategoryLabel(f.category))}</span></div>${field('What the label says', f.whatTheLabelSays)}${field('Why it matters', f.whyItMatters)}${field('Matched terms', toArray(f.matchedTerms))}${field('Source section', f.sourceSection)}${field('Label effective date', formatFdaDate(f.labelEffectiveDate))}${field('Set ID', f.setId)}</div>`).join('')}</article>`; }
function excerptFromFinding(f, i) { return {productName:'FDA label finding',section:f.sourceSection,matchedTerm:toArray(f.matchedTerms).join(', '),effectiveTime:f.labelEffectiveDate,setId:f.setId,excerpt:f.supportingExcerpt,labelId:`finding-${i + 1}`}; }
function renderExcerpts(data) { const raw = data.rawExcerpts?.length ? data.rawExcerpts : (data.aiSummary?.findings || []).filter(f => f.supportingExcerpt).map(excerptFromFinding); if (!raw.length) return ''; return `<article class="interaction-result-card"><h2>Supporting FDA Excerpts</h2>${raw.map((e,i) => `<details class="excerpt-card"><summary>${escapeHtml(e.productName || e.brandName || e.genericName || `FDA excerpt ${i + 1}`)}</summary>${field('Product name', e.productName)}${field('Brand name', e.brandName)}${field('Generic name', e.genericName)}${field('Manufacturer', e.manufacturerName)}${field('Label section', e.section)}${field('Matched term', e.matchedTerm)}${field('Effective date', formatFdaDate(e.effectiveTime))}${field('Set ID', e.setId)}${field('Excerpt text', e.excerpt)}</details>`).join('')}</article>`; }
function renderNoFindings(data) { return `${renderSummary(data)}<div class="interaction-empty-state"><span>No FDA label mention found</span><h2>${NO_FINDINGS_MESSAGE}</h2><p>${NO_FINDINGS_LIMITATION}</p></div>`; }
function renderNoLabels(data) { return `${renderSummary(data)}<div class="interaction-empty-state"><span>No FDA labels found</span><h2>No FDA labeling records were found for this medication name.</h2><p>Try a brand or generic name.</p></div>`; }
function renderResults(data, meta = {}) {
  lastResponse = data;
  const cacheNote = meta.fromCache ? '<p class="interaction-note"><strong>Loaded from recent scan.</strong> Use Refresh scan to bypass the 24-hour browser cache.</p>' : '';
  let body = '';
  const leadingSections = [renderSearchedDrug(data), renderMctSafety(data), renderMctContext(data)].join('');
  if (data.status === 'no_fda_labels') body = `${leadingSections}${renderNoLabels(data)}`;
  else if (data.status === 'no_food_fat_language_found') body = `${leadingSections}${renderNoFindings(data)}`;
  else body = `${leadingSections}${[renderSummary(data), renderTakeaway(data), renderCaution(data), renderCategories(data), renderFindings(data), renderExcerpts(data)].join('')}`;
  results.innerHTML = `${cacheNote}${body}${renderDisclaimer(data.disclaimer)}`;
  refreshButton.hidden = false;
}

async function runScan(options = {}) {
  const medication = normalizeDrugName(input.value); if (!medication) { renderError('Enter one medication name.'); return; }
  submitButton.disabled = true; refreshButton.disabled = true; submitButton.textContent = 'Checking…'; results.innerHTML = renderLoading(medication);
  try { const cached = !options.bypassCache && getCachedScanResult(medication); if (cached) { renderResults(cached.result, {fromCache:true}); return; } const data = await scanFoodFatLabel(medication); setCachedScanResult(medication, data); renderResults(data); }
  catch (error) { renderError(error.message || 'Could not complete the scan. Please try again.'); }
  finally { submitButton.disabled = false; refreshButton.disabled = false; submitButton.textContent = 'Check MCT Oil Interaction'; }
}

EXAMPLES.forEach(example => { const button = document.createElement('button'); button.type = 'button'; button.className = 'example-chip'; button.textContent = example; button.addEventListener('click', () => { input.value = example; input.focus(); runScan(); }); exampleWrap.appendChild(button); });
form.addEventListener('submit', event => { event.preventDefault(); runScan(); });
refreshButton?.addEventListener('click', () => runScan({bypassCache:true}));
renderEmpty();
