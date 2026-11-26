// -----------------------------------------------------------------------------
// ECHONET Lite manufacturer codes (EPC 0x8A, 3 bytes), as published by the
// ECHONET Consortium. Only the brands most often met on a home network are
// listed: an unknown code is shown as its hexadecimal value.
// -----------------------------------------------------------------------------

export const MANUFACTURERS = {
  '000005': 'Sharp',
  '000006': 'Mitsubishi Electric',
  '000008': 'Daikin',
  '00000b': 'Panasonic',
  '000016': 'Toshiba',
  '00008a': 'Fujitsu General',
};

/**
 * Name of a manufacturer, from the raw EDT of EPC 0x8A.
 * @param {Buffer|undefined} edt
 * @returns {string|null}
 */
export function manufacturerName(edt) {
  if (!edt || edt.length < 3) {
    return null;
  }
  const code = edt.subarray(0, 3).toString('hex');
  return MANUFACTURERS[code] ?? `Manufacturer 0x${code}`;
}

/**
 * Product code (EPC 0x8C): 12 ASCII characters, padded with spaces or NUL.
 * @param {Buffer|undefined} edt
 * @returns {string|null}
 */
export function productCode(edt) {
  if (!edt || edt.length === 0) {
    return null;
  }
  const text = edt
    .toString('latin1')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Identification number (EPC 0x83): 0xFE + 3-byte manufacturer code + 13
 * bytes the manufacturer guarantees unique — the stable id of a node. Returns
 * its lowercase hex without the leading 0xFE, or null when absent or blank.
 * @param {Buffer|undefined} edt
 * @returns {string|null}
 */
export function identificationNumber(edt) {
  if (!edt || edt.length < 2) {
    return null;
  }
  const body = edt[0] === 0xfe ? edt.subarray(1) : edt;
  const blank = body.every((value) => value === 0x00) || body.every((value) => value === 0xff);
  return blank ? null : body.toString('hex');
}
