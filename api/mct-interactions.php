<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Use POST to check interactions.']);
    exit;
}

$configPaths = [
    __DIR__ . '/../natmed-config.php',
    dirname(__DIR__, 2) . '/natmed-config.php',
];

$configLoaded = false;
foreach ($configPaths as $configPath) {
    if (is_readable($configPath)) {
        require $configPath;
        $configLoaded = true;
        break;
    }
}

if (!$configLoaded || !defined('NATMED_API_KEY') || NATMED_API_KEY === '' || NATMED_API_KEY === 'your-natmed-api-key-here') {
    http_response_code(500);
    echo json_encode(['error' => 'The interaction checker is not configured yet.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON request.']);
    exit;
}

$medications = $payload['medications'] ?? [];
if (is_string($medications)) {
    $medications = preg_split('/[\r\n,]+/', $medications);
}

if (!is_array($medications)) {
    http_response_code(400);
    echo json_encode(['error' => 'Enter one or more medication names.']);
    exit;
}

$medications = array_values(array_unique(array_filter(array_map(static function ($medication) {
    $medication = trim((string) $medication);
    $medication = preg_replace('/\s+/', ' ', $medication);
    return substr($medication, 0, 120);
}, $medications))));

if (count($medications) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Enter one or more medication names.']);
    exit;
}

if (count($medications) > 20) {
    http_response_code(400);
    echo json_encode(['error' => 'Please check 20 or fewer medications at one time.']);
    exit;
}

function natmed_request(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/json',
            'X-API-Key: ' . NATMED_API_KEY,
        ],
        CURLOPT_TIMEOUT => 20,
    ]);

    $body = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        return ['status' => 0, 'data' => null, 'error' => $curlError ?: 'Unable to connect to NatMed.'];
    }

    $data = json_decode($body, true);
    return ['status' => $status, 'data' => $data, 'error' => json_last_error() === JSON_ERROR_NONE ? null : 'NatMed returned an unreadable response.'];
}

function natmed_items($data): array
{
    if (!is_array($data)) {
        return [];
    }

    foreach (['data', 'results', 'drugs', 'interactions', 'items'] as $key) {
        if (isset($data[$key]) && is_array($data[$key])) {
            return $data[$key];
        }
    }

    $keys = array_keys($data);
    if ($data === [] || $keys === range(0, count($data) - 1)) {
        return $data;
    }

    return [];
}

$drugIds = [];
$matchedDrugs = [];
$unmatchedDrugs = [];

foreach ($medications as $medication) {
    $lookupUrl = 'https://api.therapeuticresearch.com/nm/drugs?name=' . rawurlencode($medication);
    $lookup = natmed_request($lookupUrl);

    if ($lookup['status'] === 429) {
        http_response_code(429);
        echo json_encode(['error' => 'NatMed rate limit reached. Please wait a moment and try again.']);
        exit;
    }

    if ($lookup['status'] >= 400 || $lookup['error']) {
        http_response_code(502);
        echo json_encode(['error' => 'Unable to look up medications with NatMed right now. Please try again later.']);
        exit;
    }

    $items = natmed_items($lookup['data']);
    $match = $items[0] ?? null;
    $id = null;

    if (is_array($match)) {
        $id = $match['id'] ?? $match['drug-id'] ?? $match['drug_id'] ?? null;
    }

    if ($id) {
        $drugIds[] = (string) $id;
        $matchedDrugs[] = [
            'entered' => $medication,
            'id' => (string) $id,
            'name' => $match['name'] ?? $match['drug-name'] ?? $match['drug_name'] ?? $medication,
        ];
    } else {
        $unmatchedDrugs[] = $medication;
    }
}

if (count($drugIds) === 0) {
    echo json_encode([
        'interactions' => [],
        'matched_drugs' => $matchedDrugs,
        'unmatched_drugs' => $unmatchedDrugs,
        'message' => 'No interactions found for these agents.',
    ]);
    exit;
}

$interactionUrl = 'https://api.therapeuticresearch.com/nm/interactions?drug_ids=' . rawurlencode(implode(',', array_unique($drugIds))) . '&monograph_ids=915';
$interactionResponse = natmed_request($interactionUrl);

if ($interactionResponse['status'] === 429) {
    http_response_code(429);
    echo json_encode(['error' => 'NatMed rate limit reached. Please wait a moment and try again.']);
    exit;
}

if ($interactionResponse['status'] >= 400 || $interactionResponse['error']) {
    http_response_code(502);
    echo json_encode(['error' => 'Unable to retrieve NatMed interactions right now. Please try again later.']);
    exit;
}

$allowedFields = [
    'drug-name',
    'monograph-name',
    'title',
    'description',
    'severity-text',
    'occurrence-text',
    'rating-label',
    'rating-text',
    'level-of-evidence',
    'level-of-evidence-definition',
    'reference-numbers',
    'disclaimer',
];

$interactions = array_map(static function ($interaction) use ($allowedFields) {
    $filtered = [];
    if (!is_array($interaction)) {
        return $filtered;
    }

    foreach ($allowedFields as $field) {
        $filtered[$field] = $interaction[$field] ?? $interaction[str_replace('-', '_', $field)] ?? null;
    }
    return $filtered;
}, natmed_items($interactionResponse['data']));

$disclaimer = null;
foreach ($interactions as $interaction) {
    if (!empty($interaction['disclaimer'])) {
        $disclaimer = $interaction['disclaimer'];
        break;
    }
}

if (!$disclaimer && is_array($interactionResponse['data'])) {
    $disclaimer = $interactionResponse['data']['disclaimer'] ?? null;
}

echo json_encode([
    'interactions' => $interactions,
    'matched_drugs' => $matchedDrugs,
    'unmatched_drugs' => $unmatchedDrugs,
    'message' => count($interactions) ? null : 'No interactions found for these agents.',
    'disclaimer' => $disclaimer,
]);
