# Sutra: free public data sources (research, 2026-11-14)

Purpose: find sources that can settle a "predict tomorrow's number / yes-no" question automatically by 19:30 Europe/Zagreb on the target day (settlement 20:00).

## How this was verified (read first)

- The shell cannot reach these sites, and **WebFetch refused every direct API URL** ("URL not on the session's allowlist"). It only fetched documentation pages that had come up in web search.
- So **no live API call was possible for Open-Meteo, Frankfurter, CoinGecko, Energy-Charts, EMSC, HNB or the air-quality API**. Where a section says "could not verify", it means exactly that. No values were invented.
- Verified from **documentation pages actually fetched**: Open-Meteo (docs, terms, pricing, archive), Frankfurter (home, OpenAPI), CoinGecko keyless docs, Energy-Charts v2 docs, EMSC FDSN page, USGS docs, ECB page, football-data.org policies, fuel-prices.eu llms.txt.
- Items marked **[background]** come from general knowledge, not fetched this session. Re-test them with a real `curl` from the server before building on them.
- The only actual data value seen: the ECB page showed **EUR/USD 1.1081, dated 12 Nov 2026** (page fetch, not an API call).

Common settlement rule for all sources: the game must define the "actual" as "the value the API returns at the settlement job's run time (~19:30)". The job then stores a snapshot (raw JSON plus fetch timestamp) so later model or data revisions cannot change the result.

---

## 1. ECB euro reference rate, EUR/USD (via Frankfurter or ECB XML)

- **Endpoints**
  - Frankfurter v2 (JSON): `https://api.frankfurter.dev/v2/rate/EUR/USD`. Add `?date=2026-11-13` for a specific day.
  - ECB official daily XML: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
  - Frankfurter v1 is still documented at frankfurter.dev/v1/. Its paths were not listed on the page I fetched. Use v2.
- **Auth**: none. Frankfurter: "no quotas, rate-limited to prevent abuse". No numeric limit is published.
- **Terms**:
  - Frankfurter is open and free. The v2 `/rates` endpoint blends several central-bank providers, so pin `providers=ECB` to get the ECB-only rate.
  - ECB: the page says rates are "for information only". The Disclaimer & Copyright page was not readable. The ECB's general policy [background] allows reuse with source credit. Credit "European Central Bank".
- **Availability**: around 16:00 CET on working days. This is well before 19:30. **No rate on Saturdays, Sundays and TARGET closing days** (1 Jan, Good Friday, Easter Monday, 1 May, 25 and 26 Dec). On those days "latest" returns the previous date.
- **Test fetch**: could not verify the API. The ECB page showed 1.1081 USD per EUR, dated 12 Nov 2026, with no fetch timestamp. Frankfurter's OpenAPI examples show the shape `{"date":"2026-03-25","base":"EUR","quote":"USD","rate":1.1568}`.
- **Resolve**: GET `/v2/rate/EUR/USD?providers=ECB&date=<target>`. Use `$.rate`. **Require `$.date == target date`**. If it differs, the question is void or postponed. Only schedule these questions for target days Mon-Fri that are not TARGET holidays.
- **Question templates**
  - Number: "Koliki će biti službeni ECB tečaj EUR/USD sutra?" Slider min 1.05, max 1.20, step 0.0005, unit "USD". Make the range dynamic (last value ±0.05). **Scale 0.008** (about 0.7%).
  - Yes/no: "Hoće li euro sutra biti jači prema dolaru nego danas (ECB tečaj)?" Resolve as `rate(target) > rate(previous working day)`.
  - Number: "Za koliko će se promijeniti tečaj EUR/USD u odnosu na danas (u 0,01 USD)?" Slider -3 to +3, step 0.1, unit "centa". Scale 1.

## 2. Open-Meteo forecast API: weather in 5 Croatian cities

- **Endpoint** (example for Zagreb):
  `https://api.open-meteo.com/v1/forecast?latitude=45.815&longitude=15.9819&hourly=temperature_2m,wind_gusts_10m,precipitation&timezone=Europe%2FZagreb&forecast_days=2`
  - City coordinates: Split 43.508, 16.440. Rijeka 45.327, 14.442. Osijek 45.554, 18.695. Dubrovnik 42.650, 18.094.
  - `past_days` takes 0-92 and returns archived forecasts.
  - Archive API: `https://archive-api.open-meteo.com/v1/archive`. It lags 2 to 5 days (ERA5 has a 5-day delay), so it is **not usable for same-day settlement**.
- **Auth**: none for the free API.
- **Terms**: the free API is **non-commercial only**.
  - The terms say: "You may only use the free API services for non-commercial purposes."
  - Commercial means sites or apps with ads or subscriptions, or commercial promotion.
  - A voluntary tip jar is allowed.
  - Limits: 600 per minute, 5,000 per hour, 10,000 per day, 300,000 per month.
  - Attribution under CC BY 4.0 is required.
  - There is no uptime guarantee.
  - Commercial use needs the paid **API Standard** plan. It has a 1M monthly budget, no per-minute limits and an API key via `customer-api.open-meteo.com?apikey=...`. The price is not shown on the pricing page.
  - **A Sutra with ads, sponsorship or paid tiers is commercial.**
- **Availability**: the full day is available as model data from 00:00 local. There is no observation feed. The values are **model analysis and forecast output, not station measurements**. `hourly.time` is local when `timezone=Europe/Zagreb` is set. A DST change (last Sunday of March and October) needs care: pass `timeformat=unixtime` and convert.
- **Test fetch**: **could not verify** (direct API URL blocked). The docs page confirms the parameters.
  - `temperature_2m` is an instantaneous value in °C.
  - `wind_gusts_10m` is the maximum gust over the **preceding hour**, in km/h.
  - `precipitation` is the sum over the **preceding hour**, in mm.
- **Resolve**
  - Temperature at 14:00: find the index `i` where `$.hourly.time[i] == "<target>T14:00"`, then read `$.hourly.temperature_2m[i]`.
  - Max gust: `max($.hourly.wind_gusts_10m[i])` over hours 00:00 to 19:00. It is not a full day at 19:30, so state the window in the question.
  - Rain yes/no: `sum($.hourly.precipitation[0..19]) >= 1.0` mm.
  - Always request two or more forecast days and store the snapshot.
- **Question templates**
  - Number: "Koliko će stupnjeva biti sutra u 14:00 u Zagrebu?" Slider -10 to 40, step 0.5, unit °C. Scale 4.
  - Number: "Koliki će biti najjači udar vjetra u Splitu sutra do 19:00 (km/h)?" Slider 0 to 120, step 1, unit km/h. Scale 25.
  - Yes/no: "Hoće li sutra u Rijeci do 19:00 pasti barem 1 mm kiše?"
  - Yes/no: "Hoće li u Dubrovniku sutra u 14:00 biti topliji nego u Osijeku?" This is a good city duel.
- **Note**: the wind-gust and rain values are heavy-tailed. Use a log or non-linear scale for gusts if the slider UX allows it.

## 3. Bitcoin in EUR at a fixed hour

- **Option A, Kraken public REST [background, not verified]**: `https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=60`.
  - No key. It is a public market-data endpoint with a modest rate limit.
  - Resolve with the hourly candle that opens at 17:00 Zagreb local. Read `result.XXBTZEUR[n][4]` (close), with candle time `result.XXBTZEUR[n][0]` in unix seconds. The close is known at 18:00 Zagreb.
  - Kraken's API terms were not checked.
- **Option B, CoinGecko keyless**: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&include_last_updated_at=true`.
  - No key. About 5 calls per minute on a shared IP pool.
  - **Attribution is required.**
  - The docs say keyless access is **"not recommended for production"** and that commercial use needs a paid plan.
  - It only gives the current price, not a "price at 18:00", unless you poll and store it.
- **Availability**: 24/7, including weekends and holidays.
- **Test fetch**: could not verify (blocked). A third-party proxy page confirmed only the Kraken pair name `XXBTZEUR`, which is not an API test.
- **Resolve**: Kraken `$.result.XXBTZEUR[<candle at 17:00 local>][4]` (close). CoinGecko `$.bitcoin.eur`.
- **Question templates**
  - Number: "Kolika će biti cijena Bitcoina u eurima sutra u 18:00?" Use a dynamic slider: today's 18:00 price ±10%, step 1% of that price in euros (rounded), unit "EUR". **Scale 3% of price.**
  - Yes/no: "Hoće li Bitcoin sutra u 18:00 biti skuplji nego danas u 18:00?"
  - Number: "Za koliko će se posto promijeniti cijena Bitcoina do sutra u 18:00?" Slider -8 to +8, step 0.1, unit %. Scale 3.
- **Risk**: single-exchange prices can briefly spike or glitch. Store the candle and use a fixed exchange as the "official" source in the rules.

## 4. Earthquakes in Croatia and the region (EMSC primary, USGS backup)

- **Endpoints**
  - EMSC FDSN event service: `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat=42.3&maxlat=46.6&minlon=13.4&maxlon=19.5&minmag=2.0&starttime=2026-11-15T00:00:00&endtime=2026-11-15T19:00:00`
    - The page fetched did not show the query path. It named the parameters `starttime`, `endtime`, `minlat`, `maxlat`, `minmag` and `format` (`xml`, `text` or `json`). `/query` is the standard FDSN method.
    - `minlon` and `maxlon` are standard FDSN parameters. They were not shown on the page I fetched.
  - USGS count: `https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&minlatitude=42.3&maxlatitude=46.6&minlongitude=13.4&maxlongitude=19.5&minmagnitude=2.5&starttime=...&endtime=...`
    - It returns only a count, which is easy to settle. USGS completeness at M<3 for Europe is poor, so use M2.5 or higher.
    - Rate limits are not stated. USGS advises its real-time feeds for automated display use.
- **Auth**: none.
- **Terms**: EMSC data is **CC BY 4.0** (attribution). USGS data is US-government and public domain [background].
- **Availability**: events appear within minutes to tens of minutes. Latency was not stated on the page. Values can be revised afterwards, so settle on a snapshot taken at 19:30 with a fixed window ending 19:00.
- **Test fetch**: could not verify (blocked).
- **Resolve**: EMSC GeoJSON `$.features.length` [background: FeatureCollection]. For magnitude, `$.features[*].properties.mag`. USGS `count` with `format=geojson` returns `{"count": N, "maxAllowed": 20000}` [background]. Treat both response shapes as to be confirmed with a real call.
- **Question templates**
  - Number: "Koliko će potresa jačine 2,0 ili više EMSC zabilježiti u Hrvatskoj i okolici sutra do 19:00?" Slider 0-30, step 1, unit "potresa". **Scale 6.** The counts are skewed. Calibrate the slider range from 90 days of history.
  - Yes/no: "Hoće li sutra do 19:00 biti potres jačine 3,0 ili više u Hrvatskoj i okolici?"
  - Yes/no: "Hoće li najjači potres sutra biti jači od 3,5?"
- **Risk**: aftershock sequences can make one day an outlier. Define the bounding box clearly because it includes neighbours (Bosnia, Slovenia, Hungary border).

## 5. Open-Meteo air quality (PM10, European AQI)

- **Endpoint**: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=45.815&longitude=15.9819&hourly=pm10,pm2_5,european_aqi&timezone=Europe%2FZagreb&forecast_days=2`
- **Auth and terms**: same as section 2. It is free for non-commercial use only, with CC BY 4.0 attribution and the same call limits.
- **Availability**: model data (CAMS) for the full day. It is not a measurement from the Croatian monitoring stations.
- **Test fetch**: could not verify (blocked).
- **Resolve**: the same method as section 2. Use `$.hourly.pm10[i]` at 14:00, or `$.hourly.european_aqi[i]`.
- **Question templates**
  - Number: "Kolika će biti razina čestica PM10 u Zagrebu sutra u 14:00?" Slider 0-100, step 1, unit µg/m³. Scale 20.
  - Yes/no: "Hoće li zrak u Osijeku sutra u 14:00 biti lošiji nego u Splitu?"
- **Note**: it is predictable from the forecast and it is unreliable for weekend variation. It is a filler source. Its main advantage is that it shares the integration with source 2.

## 6. Croatian fuel prices (Ministry data via mzoe-gor.hr)

- **Endpoints**
  - Original: the Ministry's mzoe-gor.hr price file. **I could not confirm its URL or format.**
  - Third-party mirror: `https://www.fuel-prices.eu/live/geojson.php?country=HR&fuel=diesel`. It gives station-level prices.
- **Auth**: none.
- **Terms**: per fuel-prices.eu, the Ministry's open data terms allow commercial and non-commercial reuse **if the source is credited**. I did not read the Ministry's own terms. fuel-prices.eu itself is an independent service and its reuse terms were not checked.
- **Availability**: fuel-prices.eu reads the national file hourly. Prices **change in steps and can stay the same for days**. Croatian maximum prices are set by the government on a fixed cycle (every 14 days) [background: not verified in this session]. That means the next change date is announced in advance, so a "will the price change" question is not a real unknown on most days.
- **Test fetch**: could not verify. The page content had no price figures.
- **Resolve**: not confirmed. Compute a statewide median from `features[*].properties.price` once the field names are checked.
- **Question templates** (only on change days)
  - Number: "Kolika će biti prosječna cijena Eurosupera 95 u petak (EUR/l)?" Slider 1.30-1.90, step 0.01, unit EUR/l. Scale 0.03.
  - Yes/no: "Hoće li Eurodizel poskupjeti na idućem obračunu?"
- **Verdict**: too static for a daily game, and the resolve path is unverified. Candidate for later weeks as an occasional "event" question.

## 7. Day-ahead electricity price (Energy-Charts / CROPEX / ENTSO-E)

- **Endpoint**: `https://api.energy-charts.info/price?bzn=HR&start=2026-11-14&end=2026-11-15` (the v1 path I tried). The newer `/v2/price` has the same parameters.
- **Auth**: none for Energy-Charts. ENTSO-E needs a free security token (registration, then email request) [background].
- **Terms**: the v2 docs say day-ahead prices have a licence **per bidding zone**: "several zones are CC BY 4.0 from Bundesnetzagentur | SMARD.de, all others are restricted to private and internal use." HR is not in the CC BY list that a second source (evcc docs) gives. **So HR is probably restricted.** Check the `license` field in a live response.
- **Rate limit**: 2 requests per minute, burst 2.
- **Availability**: the day-ahead auction results for day D+1 are published around 12:45 CET on day D [background]. Tomorrow's price is therefore **already public** when players guess it. That removes the unknown.
- **Test fetch**: could not verify.
- **Verdict**: **exclude** (licence plus no uncertainty).

## 8. Football (HNL and national team)

- **football-data.org**: `https://api.football-data.org/v4/matches`. It needs an `X-Auth-Token` header (free registration) and allows 10 requests per minute.
  - The free tier covers 12 competitions: Champions League, 5 top leagues, Eredivisie, Primeira Liga, Championship, Brazil Serie A, World Cup, Euro.
  - **Croatian HNL is not covered.** National-team matches outside the World Cup and Euro are not covered either.
  - Scores are delayed on the free tier and live scores need a paid plan.
- **TheSportsDB, API-Football**: not verified. Free tiers are known to be limited [background].
- **Timing problem**: HNL matches often start 17:00 to 20:45, so many end after 19:30. They cannot be settled by the deadline.
- **Test fetch**: not possible. A key is required.
- **Verdict**: **exclude from week one.**

## 9. DHMZ (sea temperature, river levels, observations)

- DHMZ publishes sea temperature at `https://meteo.hr/podaci_e.php?section=podaci_vrijeme&param=more_e`. This page is **HTML only** and I found no machine-readable URL. Terms and update frequency are not stated on the page.
- There are XML feeds on vrijeme.hr for current observations [background]. The fetch was blocked and the licence is unknown.
- Another DHMZ dataset I checked (digital climate maps) lists a fee and restrictions on redistribution.
- **Verdict**: **exclude** until a stable JSON or XML endpoint and a clear licence are found. An email to DHMZ asking for permission is worth sending. Open-Meteo's marine API (`marine-api.open-meteo.com`, `hourly=sea_surface_temperature`) is a model-based alternative [background, not verified], with the same licence issue as source 2.

## 10. HNB (Croatian National Bank) exchange API

- The only HNB page I could open (`api.hnb.hr/ncbk`) contained no endpoints or fields. A third-party listing suggests `https://api.hnb.hr/tecajn-eur/v3` [background].
- It is useful as a **backup for non-euro currencies** (USD, CHF, GBP) since Croatia adopted the euro.
- **Test fetch**: could not verify. Terms unknown.
- **Verdict**: not needed. Use source 1.

---

## Ranked recommendation for the week-one prototype

1. **Open-Meteo weather** (14:00 temperature, gusts, rain) for the 5 cities. Daily, incl. weekends, no key, one request per city. Highest engagement and many question variants. **Blocker for a commercial launch: the free tier is non-commercial only**, so budget for the API Standard plan or settle on a no-ads, no-subscriptions launch.
2. **ECB EUR/USD via Frankfurter**. Official, no key, clean JSON. Weekdays only, so use another source on Saturdays, Sundays and TARGET holidays. It is the one source where I saw a real value (page, not API).
3. **Bitcoin in EUR at 18:00** via Kraken public OHLC. Works on 7 days a week, which fills the weekend gap from source 2. Verify the Kraken endpoint, terms and candle indexing before coding. Do not use CoinGecko keyless in production.
4. **Earthquake counts** from EMSC with USGS as the backup. CC BY, no key, a fun "will it shake" question. Needs history to calibrate the slider range and has outlier days.
5. **Open-Meteo air quality**. Same integration as source 1 and the same licence. Filler only.

Weekly cover: Mon-Fri has weather, EUR/USD, BTC, quakes. Sat-Sun has weather, BTC, quakes.

**Exclude:**
- **Day-ahead electricity**: the price is already public before players guess it, and the HR licence looks restricted.
- **Football**: the free tiers do not cover HNL, and matches can end after 19:30.
- **DHMZ**: no machine-readable endpoint or clear licence found.
- **Fuel prices**: too static for daily play, and the source format is unverified. Use occasionally later.
- **HNB**: no verifiable endpoint, and not needed.
- **CoinGecko keyless as the main BTC source**: not for production.

## Open risks and to-do before coding

1. Run real `curl` tests for every endpoint above from the server. None was tested in this research.
2. Decide the commercial status of Sutra. Open-Meteo, CoinGecko and probably Energy-Charts all depend on it.
3. Add a `void` outcome for "no data by 19:30" (weekend or holiday ECB rate, API outage). Settle from the stored snapshot only.
4. Show attribution in the app: Open-Meteo (CC BY 4.0), ECB, EMSC (CC BY 4.0), the exchange used for BTC.
