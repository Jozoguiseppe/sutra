import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './index';

interface CitiesFile {
  counties: { id: number; name: string }[];
  cities: { id: number; name: string; county_id: number }[];
}

export function citiesFilePath(): string {
  return path.resolve(process.cwd(), 'data', 'cities.json');
}

async function readCities(waitMs: number): Promise<CitiesFile> {
  const file = citiesFilePath();
  const deadline = Date.now() + waitMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`seed: ${file} not found`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CitiesFile;
}

/** Idempotent upsert of counties and cities from data/cities.json. Safe to run in production too. */
export async function seedCities(db: Db, opts: { waitMs?: number } = {}): Promise<void> {
  const data = await readCities(opts.waitMs ?? 180_000);
  await db.tx(async (t) => {
    await t.query(
      `insert into counties (id, name)
       select * from unnest($1::smallint[], $2::text[])
       on conflict (id) do update set name = excluded.name`,
      [data.counties.map((c) => c.id), data.counties.map((c) => c.name)],
    );
    await t.query(
      `insert into cities (id, name, county_id)
       select * from unnest($1::int[], $2::text[], $3::smallint[])
       on conflict (id) do update set name = excluded.name, county_id = excluded.county_id`,
      [data.cities.map((c) => c.id), data.cities.map((c) => c.name), data.cities.map((c) => c.county_id)],
    );
  });
}
