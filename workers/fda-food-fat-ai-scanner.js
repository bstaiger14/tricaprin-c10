const ALLOWED_ORIGINS = new Set([
  'https://tricaprin-c10.com',
  'https://www.tricaprin-c10.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8000',
]);

const GENERIC_ERROR = 'Could not complete the FDA food/fat scan.';
const OPENFDA_ENDPOINT = 'https://api.fda.gov/drug/label.json';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const FOOD_FAT_TERMS = [
  'food', 'meal', 'meals', 'fed', 'fasted', 'fasting', 'fat', 'high-fat', 'high fat',
  'low-fat', 'low fat', 'grapefruit', 'citrus', 'orange juice', 'apple juice', 'fruit juice',
  'alcohol', 'ethanol', 'dairy', 'milk', 'calcium', 'magnesium', 'aluminum', 'iron', 'zinc',
  'mineral', 'antacid', 'vitamin k', 'tyramine', 'caffeine', 'potassium', 'salt substitute',
  'tube feed', 'enteral', 'protein'
];
const LABEL_SECTIONS = [
  'boxed_warning', 'warnings', 'warnings_and_cautions', 'precautions', 'contraindications',
  'drug_interactions', 'dosage_and_administration', 'clinical_pharmacology',
  'pharmacokinetics', 'information_for_patients', 'patient_medication_information',
  'spl_patient_package_insert', 'medication_guide'
];

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let drug = '';
    try {
      console.log('FDA scanner request', { requestId, method: request.method });
      if (request.method === 'OPTIONS') return corsResponse(request, null, 204);
      if (request.method === 'GET') return corsResponse(request, json({ ok: true, service: 'fda-food-fat-ai-scanner' }));
      if (request.method !== 'POST') return corsResponse(request, json({ ok: false, error: 'Method not allowed.' }, 405), 405);

      let body;
      try { body = await request.json(); } catch { body = {}; }
      drug = normalizeDrugName(body?.drug);
      console.log('FDA scanner drug searched', { requestId, drug });
      if (!drug) return fail(request, 'MISSING_DRUG', 'Enter one medication name.', 400, { requestId, drug });

      const fdaUrl = buildOpenFdaUrl(drug, env.OPENFDA_API_KEY);
      console.log('FDA scanner openFDA URL', { requestId, url: stripOpenFdaKey(fdaUrl) });
      let fdaResponse;
      try {
        fdaResponse = await fetch(fdaUrl, { headers: { Accept: 'application/json' } });
      } catch (error) {
        console.error('openFDA request failed', { requestId, message: error?.message });
        return fail(request, 'OPENFDA_REQUEST_FAILED', GENERIC_ERROR, 502, { requestId, drug });
      }
      console.log('FDA scanner openFDA response', { requestId, status: fdaResponse.status });

      if (fdaResponse.status === 404) return ok(request, noLabels(drug), requestId, startedAt);
      if (!fdaResponse.ok) return fail(request, 'OPENFDA_REQUEST_FAILED', GENERIC_ERROR, 502, { requestId, drug, status: fdaResponse.status });

      let fdaData;
      try { fdaData = await fdaResponse.json(); } catch (error) {
        console.error('openFDA parse failed', { requestId, message: error?.message });
        return fail(request, 'OPENFDA_PARSE_FAILED', GENERIC_ERROR, 502, { requestId, drug });
      }

      const labels = Array.isArray(fdaData?.results) ? fdaData.results : [];
      const excerpts = collectExcerpts(labels);
      console.log('FDA scanner label/excerpt counts', { requestId, labelsFound: labels.length, excerptsFound: excerpts.length });
      if (!labels.length) return ok(request, noLabels(drug), requestId, startedAt);

      if (!excerpts.length) {
        return ok(request, noFoodFatLanguage(drug, labels.length), requestId, startedAt);
      }

      console.log('FDA scanner OpenAI summarization attempted', { requestId, attempted: true });
      if (!env.OPENAI_API_KEY) {
        console.error('OpenAI API key missing', { requestId, expectedSecretName: 'OPENAI_API_KEY' });
        return fail(request, 'OPENAI_API_KEY_MISSING', GENERIC_ERROR, 500, { requestId, drug });
      }

      const ai = await summarizeWithOpenAi(env.OPENAI_API_KEY, drug, labels.length, excerpts, requestId);
      return ok(request, { ok: true, drugSearched: drug, status: 'food_fat_language_found', labelsReviewed: labels.length, excerptsFound: excerpts.length, rawExcerpts: excerpts.slice(0, 12), aiSummary: ai, disclaimer: disclaimer() }, requestId, startedAt);
    } catch (error) {
      console.error('Worker internal error', { requestId, drug, message: error?.message, stack: error?.stack });
      if (error?.errorCode === 'OPENAI_REQUEST_FAILED' || error?.errorCode === 'OPENAI_PARSE_FAILED') {
        return fail(request, error.errorCode, GENERIC_ERROR, 502, { requestId, drug });
      }
      return fail(request, 'WORKER_INTERNAL_ERROR', GENERIC_ERROR, 500, { requestId, drug });
    }
  }
};

function normalizeDrugName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120); }
function corsHeaders(request) { const origin = request.headers.get('Origin'); const allowOrigin = ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin || '') || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '') ? origin : 'https://tricaprin-c10.com'; return { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }; }
function corsResponse(request, response, status) { const base = response || new Response(null, { status }); const headers = new Headers(base.headers); Object.entries(corsHeaders(request)).forEach(([k, v]) => headers.set(k, v)); return new Response(base.body, { status: status || base.status, headers }); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
function ok(request, data, requestId, startedAt) { console.log('FDA scanner final status', { requestId, ok: true, status: data.status, durationMs: Date.now() - startedAt }); return corsResponse(request, json(data)); }
function fail(request, errorCode, error, status, context = {}) { console.error('FDA scanner final status', { ...context, ok: false, errorCode, status }); return corsResponse(request, json({ ok: false, error, errorCode }, status)); }
function buildOpenFdaUrl(drug, apiKey) { const escaped = escapeFda(drug); const query = `openfda.brand_name:"${escaped}" OR openfda.generic_name:"${escaped}" OR openfda.substance_name:"${escaped}"`; const url = new URL(OPENFDA_ENDPOINT); url.searchParams.set('search', query); url.searchParams.set('limit', '10'); if (apiKey) url.searchParams.set('api_key', apiKey); return url.toString(); }
function stripOpenFdaKey(url) { const clean = new URL(url); clean.searchParams.delete('api_key'); return clean.toString(); }
function escapeFda(value) { return String(value).replace(/["\\]/g, ' '); }
function noLabels(drug) { return { ok: true, drugSearched: drug, status: 'no_fda_labels', labelsReviewed: 0, excerptsFound: 0, rawExcerpts: [], aiSummary: { plainEnglishSummary: 'No FDA labeling records were found for this medication name.', mainCategories: [], findings: [] }, disclaimer: disclaimer() }; }
function noFoodFatLanguage(drug, count) { return { ok: true, drugSearched: drug, status: 'no_food_fat_language_found', labelsReviewed: count, excerptsFound: 0, rawExcerpts: [], aiSummary: { plainEnglishSummary: 'No food, fat, or diet-related language was found in the FDA labeling searched by this tool.', mainCategories: [], findings: [] }, disclaimer: disclaimer() }; }
function disclaimer() { return 'This automated scan is limited to openFDA label records and keyword-matched excerpts. It is not medical advice.'; }
function collectExcerpts(labels) { const out = []; for (const label of labels) { for (const section of LABEL_SECTIONS) { for (const text of (Array.isArray(label[section]) ? label[section] : [])) { for (const excerpt of matchingSentences(text)) out.push({ productName: first(label.openfda?.brand_name), brandName: first(label.openfda?.brand_name), genericName: first(label.openfda?.generic_name), manufacturerName: first(label.openfda?.manufacturer_name), section, matchedTerm: excerpt.matchedTerm, effectiveTime: label.effective_time, setId: label.set_id, excerpt: excerpt.text, labelId: label.id }); } } } return out.slice(0, 24); }
function first(value) { return Array.isArray(value) ? value[0] : value; }
function matchingSentences(text) { const clean = String(text || '').replace(/\s+/g, ' '); const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean]; const found = []; for (const sentence of sentences) { const lower = sentence.toLowerCase(); const term = FOOD_FAT_TERMS.find(t => lower.includes(t)); if (term) found.push({ matchedTerm: term, text: sentence.trim().slice(0, 700) }); } return found.slice(0, 6); }
async function summarizeWithOpenAi(apiKey, drug, labelsReviewed, excerpts, requestId) { const response = await fetch(OPENAI_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Return only JSON with plainEnglishSummary, practicalTakeaway, patientFriendlyCaution, mainCategories array, findings array. Never provide medical advice beyond label-summary cautions.' }, { role: 'user', content: JSON.stringify({ drug, labelsReviewed, excerpts: excerpts.slice(0, 12) }) }] }) }); console.log('FDA scanner OpenAI response', { requestId, status: response.status }); if (!response.ok) { const text = await response.text().catch(() => ''); console.error('OpenAI request failed', { requestId, status: response.status, bodyPrefix: text.slice(0, 300) }); throw Object.assign(new Error('OpenAI request failed'), { errorCode: 'OPENAI_REQUEST_FAILED' }); } let data; try { data = await response.json(); return JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch (error) { console.error('OpenAI parse failed', { requestId, message: error?.message }); throw Object.assign(new Error('OpenAI parse failed'), { errorCode: 'OPENAI_PARSE_FAILED' }); } }
