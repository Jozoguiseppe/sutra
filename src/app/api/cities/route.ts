import { getContext, json } from '@/lib/server';
import type { CitiesResponse } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db } = await getContext();
  const rows = await db.query<{ county_id: number; county_name: string; id: number; name: string }>(
    `select co.id as county_id, co.name as county_name, c.id, c.name
     from cities c join counties co on co.id = c.county_id order by co.name, c.name`,
  );
  const map = new Map<number, CitiesResponse['counties'][number]>();
  for (const r of rows) {
    const cid = Number(r.county_id);
    let c = map.get(cid);
    if (!c) map.set(cid, (c = { id: cid, name: r.county_name, cities: [] }));
    c.cities.push({ id: Number(r.id), name: r.name });
  }
  const body: CitiesResponse = { counties: [...map.values()] };
  return json(body);
}
