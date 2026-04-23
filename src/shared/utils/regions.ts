/**
 * Nigerian geopolitical zones — used to rank "corpers near you" in the
 * Discover feed. States within the same region are treated as close-by;
 * the map is intentionally forgiving about state-name spellings because
 * the DB has seen "FCT", "FCT State", and "Abuja (FCT)" all used for
 * the federal capital depending on the sign-up path.
 */

export type Region = 'NC' | 'NE' | 'NW' | 'SE' | 'SS' | 'SW';

const REGION_STATES: Record<Region, string[]> = {
  NC: [
    'Benue State', 'Kogi State', 'Kwara State', 'Nasarawa State',
    'Niger State', 'Plateau State',
    'FCT', 'FCT State', 'Abuja (FCT)', 'Abuja',
  ],
  NE: [
    'Adamawa State', 'Bauchi State', 'Borno State',
    'Gombe State', 'Taraba State', 'Yobe State',
  ],
  NW: [
    'Jigawa State', 'Kaduna State', 'Kano State', 'Katsina State',
    'Kebbi State', 'Sokoto State', 'Zamfara State',
  ],
  SE: [
    'Abia State', 'Anambra State', 'Ebonyi State',
    'Enugu State', 'Imo State',
  ],
  SS: [
    'Akwa Ibom State', 'Bayelsa State', 'Cross River State',
    'Delta State', 'Edo State', 'Rivers State',
  ],
  SW: [
    'Ekiti State', 'Lagos State', 'Ogun State', 'Ondo State',
    'Osun State', 'Oyo State',
  ],
};

const STATE_TO_REGION: Map<string, Region> = (() => {
  const m = new Map<string, Region>();
  for (const [region, states] of Object.entries(REGION_STATES)) {
    for (const s of states) m.set(s.toLowerCase(), region as Region);
  }
  return m;
})();

/** Find the geopolitical zone for a serving state, or `null` if unknown. */
export function regionOf(servingState: string | null | undefined): Region | null {
  if (!servingState) return null;
  return STATE_TO_REGION.get(servingState.toLowerCase()) ?? null;
}

/** All serving-state names in the same zone. Empty array for unknown input. */
export function statesInRegion(region: Region): string[] {
  return REGION_STATES[region] ?? [];
}

/**
 * Return every stored-form variant that refers to the same state as `state`.
 * This exists because FCT is recorded as "FCT", "FCT State", or "Abuja (FCT)"
 * across different sign-up paths, so same-state queries need to OR them.
 */
export function aliasStatesFor(state: string): string[] {
  const lower = state.toLowerCase();
  if (lower.includes('fct') || lower.includes('abuja')) {
    return ['FCT', 'FCT State', 'Abuja (FCT)', 'Abuja'];
  }
  return [state];
}
