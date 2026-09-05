# BR-233 national U.S. locality index

**Generated file:** `usLocalities.generated.json`  
**License:** Public domain (U.S. Census Bureau / U.S. federal government work)  
**Coverage:** 50 states + District of Columbia  
**Excluded:** Puerto Rico and island areas (`PR`, `AS`, `GU`, `MP`, `VI`)

## Sources

1. [Census Gazetteer Places 2025](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip) — incorporated places and CDPs.
2. [Census 2020 ZCTA5–Place relationship](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt) — ZIP evidence only.

Rebuild (network required for first cache fill):

```bash
node backend/core/usLocalityResolver/ingest/buildUsLocalityIndex.js
```

Raw Census downloads stay in `ingest/.cache/` (gitignored). The compact JSON is committed so runtime has **no network**.

NYC borough aliases (`Brooklyn`, `Queens`, `Bronx`, `Manhattan`, `Staten Island`) are a documented overlay because those names are not always Census places. They are not tenant `localCities`.
