# Build

Use Python 3.11+ and Node 22+. Source JSON, extracted page text, deterministic IDs, scripts, checks and the shared-content registry are in the source ZIP. The install ZIP contains compiled LevelDB packs and image assets. Extract both ZIPs into the same working directory to rebuild without rerendering the book.

```sh
python3 -m pip install -r requirements.txt
npm install
python3 tools/build.py
npm test
npm run compile
npm run package
```

The compiler uses the official `@foundryvtt/foundryvtt-cli` 3.0.5 and checks extraction against every source document. Set `FOUNDRY_CLI_MODULE` only when using an already-installed copy of its `lib/package.mjs`.

`tools/prepare_registry.py` refreshes the canonical snapshot from a published Tasha source tree (`TASHA_SOURCE_DIR`). Normal builds use the committed registry. To audit additional books, merge their `source/canonical-content-index.json` records and source/release identity first, then run build/validation. Do not copy another book’s documents into this module.

`tools/extract_source.py` and `tools/prepare_assets.py` document the initial PDF extraction/rendering workflow. The supplied PDF and the Clawfoot cutout edit are inputs to recreating those images; they are not silently regenerated on a normal code build. Asset provenance is recorded separately.

The offline validator checks content/image coverage, deterministic document/activity IDs, handler presence, table ranges, transparent creature art, all local and known external UUIDs, cross-book collisions and JavaScript syntax. Native Foundry schemas and runtime integrations still require the acceptance checklist.
