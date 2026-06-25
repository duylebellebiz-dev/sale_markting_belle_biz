const PROVINCE_ALIASES: Record<string, string> = {
  AB: 'AB',
  ALBERTA: 'AB',
  BC: 'BC',
  'BRITISH COLUMBIA': 'BC',
  MB: 'MB',
  MANITOBA: 'MB',
  NB: 'NB',
  'NEW BRUNSWICK': 'NB',
  NL: 'NL',
  'NEWFOUNDLAND AND LABRADOR': 'NL',
  NS: 'NS',
  'NOVA SCOTIA': 'NS',
  NT: 'NT',
  'NORTHWEST TERRITORIES': 'NT',
  NU: 'NU',
  NUNAVUT: 'NU',
  ON: 'ON',
  ONTARIO: 'ON',
  PE: 'PE',
  'PRINCE EDWARD ISLAND': 'PE',
  QC: 'QC',
  QUEBEC: 'QC',
  SK: 'SK',
  SASKATCHEWAN: 'SK',
  YT: 'YT',
  YUKON: 'YT',
};

const PROVINCE_PATTERN = new RegExp(
  `\\b(${Object.keys(PROVINCE_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'i',
);

const POSTAL_CODE_PATTERN = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i;
const COUNTRY_PATTERN = /\b(Canada|United States|USA|US)\b$/i;
const STREET_SUFFIXES = new Set([
  'AVE', 'AVENUE', 'BLVD', 'BOULEVARD', 'CIR', 'CIRCLE', 'CLOSE', 'COURT', 'CRT',
  'CRES', 'CRESCENT', 'DR', 'DRIVE', 'GATE', 'GDNS', 'GROVE', 'HWY', 'HIGHWAY',
  'LANE', 'LN', 'PATH', 'PKWY', 'PLACE', 'PL', 'RD', 'ROAD', 'SQ', 'ST', 'STREET',
  'TERR', 'TERRACE', 'TRAIL', 'VIEW', 'WAY',
]);
const UNIT_MARKERS = new Set(['#', 'APT', 'APARTMENT', 'BAY', 'BUILDING', 'FL', 'FLOOR', 'RM', 'ROOM', 'STE', 'SUITE', 'UNIT']);

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeCountry(country?: string | null) {
  if (!country) return undefined;
  const value = cleanWhitespace(country);
  if (!value) return undefined;
  if (/^(usa|us)$/i.test(value)) return 'USA';
  return value;
}

function normalizeProvince(province?: string | null) {
  if (!province) return undefined;
  const key = cleanWhitespace(province).toUpperCase();
  return PROVINCE_ALIASES[key] ?? key;
}

function splitStreetAndCity(prefix: string) {
  const tokens = cleanWhitespace(prefix).split(' ').filter(Boolean);
  let boundary = -1;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].replace(/[.,]/g, '').toUpperCase();
    if (STREET_SUFFIXES.has(token)) {
      boundary = i;
      continue;
    }
    if (UNIT_MARKERS.has(token)) {
      boundary = Math.min(i + 1, tokens.length - 1);
      continue;
    }
    if (/^#\w+/i.test(tokens[i])) {
      boundary = i;
    }
  }

  if (boundary >= 0 && boundary < tokens.length - 1) {
    return {
      line1: tokens.slice(0, boundary + 1).join(' '),
      city: tokens.slice(boundary + 1).join(' '),
    };
  }

  return { line1: prefix, city: '' };
}

function fallbackLines(address?: string | null, country?: string) {
  const lines = (address ?? '')
    .split(/\r?\n|,\s*/)
    .map((part) => cleanWhitespace(part))
    .filter(Boolean);
  const normalizedCountry = normalizeCountry(country);
  if (normalizedCountry && !lines.some((line) => line.toLowerCase() === normalizedCountry.toLowerCase())) {
    lines.push(normalizedCountry);
  }
  return lines;
}

export interface FormattedAddressInput {
  address?: string | null;
  province?: string | null;
  country?: string | null;
}

export function formatAddressLines({ address, province, country }: FormattedAddressInput) {
  const normalizedCountry = normalizeCountry(country);
  const normalizedProvince = normalizeProvince(province);
  const raw = cleanWhitespace((address ?? '').replace(/\r?\n/g, ', '));

  if (!raw) {
    return normalizedCountry ? [normalizedCountry] : [];
  }

  let working = raw;
  let detectedCountry = normalizedCountry;
  const countryMatch = working.match(COUNTRY_PATTERN);
  if (countryMatch) {
    detectedCountry = normalizeCountry(countryMatch[1]) ?? detectedCountry;
    working = cleanWhitespace(working.slice(0, countryMatch.index));
  }

  const postalMatch = working.match(POSTAL_CODE_PATTERN);
  const postalCode = postalMatch ? `${postalMatch[1].toUpperCase()} ${postalMatch[2].toUpperCase()}` : undefined;

  const provinceMatches = [...working.matchAll(new RegExp(PROVINCE_PATTERN.source, 'gi'))];
  const provinceMatch = provinceMatches.length ? provinceMatches[provinceMatches.length - 1] : undefined;
  const parsedProvince = provinceMatch ? normalizeProvince(provinceMatch[1]) : normalizedProvince;

  if (!postalCode || !parsedProvince) {
    return fallbackLines(raw, detectedCountry);
  }

  const postalStart = postalMatch?.index ?? -1;
  const provinceStart = provinceMatch?.index ?? -1;
  const provinceEnd = provinceStart >= 0 ? provinceStart + provinceMatch![0].length : -1;
  const postalEnd = postalStart >= 0 ? postalStart + postalMatch![0].length : -1;

  const headEnd = provinceStart >= 0 && provinceStart < postalStart ? provinceStart : postalStart;
  const tailStart = provinceStart >= 0 && provinceStart > postalStart ? provinceEnd : postalEnd;

  const prefix = cleanWhitespace(working.slice(0, headEnd));
  const between = cleanWhitespace(working.slice(headEnd, tailStart).replace(PROVINCE_PATTERN, '').replace(POSTAL_CODE_PATTERN, ''));
  const suffix = cleanWhitespace(working.slice(tailStart));
  const localitySource = cleanWhitespace([between, suffix].filter(Boolean).join(' '));

  const { line1, city } = splitStreetAndCity(prefix);
  const localityCity = city || localitySource;
  const line2Parts: string[] = [];
  if (localityCity) line2Parts.push(localityCity);
  line2Parts.push([parsedProvince, postalCode].filter(Boolean).join(' '));

  const lines = [line1, line2Parts.join(', '), detectedCountry]
    .map((line) => line?.trim())
    .filter(Boolean) as string[];

  return lines.length ? lines : fallbackLines(raw, detectedCountry);
}
