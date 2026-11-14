import type { CitiesResponse } from '@/lib/api-types';
import { normalizeSearch } from './format';

export type CountyGroup = CitiesResponse['counties'][number];

/** Keep only matching cities (or whole counties when the county name matches); drop empty counties. */
export function filterCounties(counties: CountyGroup[], query: string): CountyGroup[] {
  const q = normalizeSearch(query);
  if (!q) return counties;
  const out: CountyGroup[] = [];
  for (const county of counties) {
    const countyHit = normalizeSearch(county.name).includes(q);
    const cities = countyHit ? county.cities : county.cities.filter((c) => normalizeSearch(c.name).includes(q));
    if (cities.length) out.push({ ...county, cities });
  }
  return out;
}
