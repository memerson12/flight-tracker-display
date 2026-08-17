const BUSINESS_JET_TYPES = new Set([
  // Cessna Citation
  'C500', 'C501', 'C510', 'C525', 'C25A', 'C25B', 'C25C', 'C550', 'C551',
  'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750',
  // Gulfstream and IAI business aircraft
  'ASTR', 'G100', 'G150', 'G280', 'GALX', 'GLF2', 'GLF3', 'GLF4', 'GLF5',
  'GLF6', 'GL5T', 'GL7T', 'GLEX',
  // Bombardier Challenger and Global
  'CL30', 'CL35', 'CL60',
  // Learjet
  'LJ23', 'LJ24', 'LJ25', 'LJ28', 'LJ31', 'LJ35', 'LJ40', 'LJ45', 'LJ55',
  'LJ60', 'LJ70', 'LJ75',
  // Dassault Falcon
  'FA10', 'FA20', 'FA50', 'FA6X', 'FA7X', 'FA8X', 'F2TH', 'F900',
  // Embraer executive jets
  'E50P', 'E55P',
  // Hawker, Beechjet and Premier
  'BE40', 'H25A', 'H25B', 'H25C', 'PRM1',
  // Other common purpose-built business jets
  'EA50', 'HDJT', 'PC24', 'SBR1', 'SF50', 'WW24'
]);

const ORGANIZATION_MARKERS = [
  ' AIR ', ' AIRCRAFT ', ' AIRLINE', ' AIRWAYS', ' AVIATION', ' BANK', ' COMPANY',
  ' CORP', ' DEPARTMENT', ' GOVERNMENT', ' GROUP', ' HOLDING', ' INC', ' LEASING',
  ' LIMITED', ' LLC', ' LLP', ' LTD', ' MINISTRY', ' PTY', ' SERVICES', ' STATE OF ',
  ' TRUST', ' UNIVERSITY'
];

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeCode = (value) => normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

function looksLikeOrganization(value) {
  const name = ` ${normalizeText(value).toUpperCase()} `;
  if (!name.trim()) return false;
  return ORGANIZATION_MARKERS.some((marker) => name.includes(marker));
}

function isBusinessJetModel({ aircraftType, manufacturer, model } = {}) {
  const type = normalizeCode(aircraftType);
  if (BUSINESS_JET_TYPES.has(type)) return true;

  const description = `${normalizeText(manufacturer)} ${normalizeText(model)}`.toUpperCase();
  if (!description.trim()) return false;

  if (/\b(GULFSTREAM|LEARJET|CITATION|CHALLENGER|GLOBAL EXPRESS|HONDAJET|BEECHJET|SABRELINER|WESTWIND)\b/.test(description)) return true;
  if (/\b(FALCON|PHENOM|PRAETOR)\b/.test(description)) return true;
  if (/\b(PILATUS\s+PC-?24|CIRRUS\s+VISION|ECLIPSE\s+(500|550))\b/.test(description)) return true;
  if (/\b(HAWKER\s+(400|750|800|850|900|1000)|PREMIER\s+I)\b/.test(description)) return true;
  if (/\bCESSNA\b.*\b(500|501|510|525[A-C]?|550|551|560|650|680A?|700|750)\b/.test(description)) return true;
  return false;
}

function resolveAircraftIdentity({ aircraftType, registration, registryRecord } = {}) {
  const manufacturer = normalizeText(registryRecord?.manufacturer);
  const model = normalizeText(registryRecord?.model);
  const resolvedType = normalizeCode(aircraftType || registryRecord?.icaoType);

  if (!isBusinessJetModel({ aircraftType: resolvedType, manufacturer, model })) return null;

  const registeredName = registryRecord?.partyKind === 'organization'
    ? normalizeText(registryRecord.registeredName).slice(0, 100)
    : '';
  const isQantasOperator = registryRecord?.relationship === 'registered-operator'
    && /\bQANTAS\b/.test(registeredName.toUpperCase());

  return {
    category: 'business-jet',
    label: isQantasOperator ? 'Qantas Corporate Aircraft' : 'Business Jet',
    brandCode: isQantasOperator ? 'QF' : '',
    registration: normalizeText(registryRecord?.registration || registration).toUpperCase(),
    manufacturer,
    model,
    registeredName,
    relationship: registeredName ? registryRecord.relationship : '',
    registry: registryRecord?.registry || ''
  };
}

module.exports = {
  BUSINESS_JET_TYPES,
  isBusinessJetModel,
  looksLikeOrganization,
  normalizeCode,
  resolveAircraftIdentity
};
