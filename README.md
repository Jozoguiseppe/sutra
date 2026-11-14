# Sutra (radni naziv)

Dnevna igra prognoza: svaki dan daješ 4 prognoze za sutra, rezultati stižu u 20:00, a dobre prognoze
te bacaju u budućnost, loše u prošlost. Ime igre je samo tekst (`app.name` u `messages/*.json`).

Arhitektura i ugovori: `docs/ARCHITECTURE.md`. Izvori podataka: `docs/DATA_SOURCES.md`.

## Lokalno pokretanje (bez ikakvih računa)

```bash
npm install
npm run dev        # http://localhost:3000 — baza je ugrađeni PGlite u .pglite/, pitanja su probna (mock)
npm test           # svi testovi
```

Putovanje kroz vrijeme za testiranje: `FAKE_NOW=2026-11-15T19:30:00Z npm run dev` (radi samo izvan produkcije),
pa otvori `/api/cron/settle` da se obračuna današnji krug.

## Baza na Neonu

Projekt je povezan s Neon projektom (`.neon`, `neon.ts`), ali servisi još NISU postavljeni — `neon deploy`
treba pokrenuti s računala koje ima pristup Neonu:

```bash
npm i -g neon@latest
neon login                 # prijava u pregledniku
neon init -y --org-id org-curly-boat-61433617 --project-id mute-paper-38725006 --branch production --services postgres,auth,realtime
neon deploy                # postavlja servise i upisuje DATABASE_URL i ostalo u .env.local (ili .env ako postoji)
npm run db:setup           # tablice + gradovi u Neon bazi (može se pokrenuti više puta)
npm run dev                # aplikacija sada radi na Neonu
```

Aplikaciji je dovoljan `DATABASE_URL` (pooled). Neon Auth i Realtime su deklarirani u `neon.ts`, ali ih kod još ne koristi
(igra je bez računa). `.env` i `.env.local` se ne spremaju u git; popis varijabli je u `.env.example`.

## Produkcija (Vercel)

Environment variables: `DATABASE_URL` (Neon, pooled), `ADMIN_TOKEN`, `CRON_SECRET`, te `SOURCES=live`
ili `SOURCES=mock` + `ALLOW_MOCK=1` za demo s izmišljenim rezultatima. `vercel.json` sadrži cron raspored
(generiranje pitanja u 18:00, obračun u 20:00 po Zagrebu).

## Što još NIJE provjereno

- Stvarni izvori (`src/lib/sources/openmeteo.ts`, `frankfurter.ts`, `kraken.ts`, `emsc.ts`) napisani su prema dokumentaciji,
  ali nijedan nije isproban stvarnim pozivom (razvojno okruženje nije imalo pristup tim servisima). Svaka datoteka na vrhu
  ima `UNVERIFIED` popis onoga što treba provjeriti prije `SOURCES=live`.
- Open-Meteo besplatni plan vrijedi samo za nekomercijalnu upotrebu (prije oglasa/premiuma treba plaćeni plan).
- Vercel cron ograničenja ovise o planu — provjeriti dopušta li plan 4 dnevna cron poziva.
