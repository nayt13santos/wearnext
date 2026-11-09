# WearNext

A personal wardrobe web app. GitHub Pages hosts the interface. A separate Google Apps Script project saves wardrobe details and wear history in a private Google Sheet, and resized clothing photos in a private Google Drive folder. There is no ChatGPT, Claude, paid AI API, or AI-account dependency at runtime.

## What it does

- Choose clothing photos individually or in a batch. Clear photos are named, tagged and saved automatically. Unclear category/color/pattern choices, possible duplicates and failed photos remain in a review queue; successful photos are not re-saved when you retry.
- Detect category, color, pattern, dress code, estimated weight and likely material on device. Color analysis excludes a border-connected background and groups shadows, cross-checking the image model when confident. Uncertain fabric stays Other, and waterproofing is never inferred from appearance. You can edit any saved piece.
- Check exact source fingerprints and visually similar photos before saving, including archived pieces and earlier saves in the batch. Exact repeats are skipped; possible visual matches require a decision. Similarity is a warning, not proof of identity.
- Use **Wardrobe → Repair color tags → Check and repair colors** on your phone to scan existing pieces. Clear corrections save automatically; uncertain colors remain for review. Undo corrections in the same screen. Names, other tags, photos, laundry, favorites and wear history are preserved. Keep the screen open until the scan finishes.
- Generate outfits for a purpose, temperature, rain and indoor air conditioning. Lock favorites and swap available alternatives.
- Use **Mix & match** to slide through each category in one combined editor with a compact live outfit preview, or browse up to three distinct complete looks in **Suggestions**. Swipe, tap a piece, or use the arrow buttons/keyboard. Add matching layers and accessories, keep pieces locked, and choose a suggestion to edit before recording a wear. Suggestions and dismissals last for the current session; they do not save an outfit or start its rotation.
- Choose a colorway or let Automatic find a coordinated palette. Outfits use up to three saved color families, including shoes, layers and kept accessories; swaps stay in the same palette. Twelve presets cover neutrals, tonal colors, earthy combinations and accents. Adobe Color and Coolors links open optional inspiration tools; no wardrobe data is sent to them. Check an item's saved color if its photo and suggestions disagree.
- Rest each clothing piece for 30 days after recording it as worn. Shoes/accessories can repeat. Adjust the interval from 0 to 90 days.
- Exclude laundry and archived clothing. Undo mistaken wears without deleting audit history.
- Score a potential purchase against compatible combinations, similar owned pieces, wardrobe gaps and budget. This is a transparent rules-based score, not semantic image recognition or a guarantee of fit or quality.
- Install on a phone using Add to Home Screen. This release needs internet to load or save the private wardrobe. It does not queue offline writes.

## Owner setup

Use your **personal Google account**, not a work account. This app uses separate resources and does not need access to any existing inventory app.

1. Create a standalone Apps Script project and upload `apps-script/Code.gs` and its manifest. With Google's official `clasp` CLI, use `clasp create --type standalone --title WearNext --rootDir apps-script`, restore the supplied manifest if creation replaces it, then `clasp push --force`.
2. In the Apps Script editor, select `setupWearNext` and Run. Review Google's permissions yourself. It creates a private Sheet and a private photo folder. Do not make either publicly accessible. The Drive scope is limited to files created/opened by this app; the spreadsheet scope is broader because Apps Script uses SpreadsheetApp. The code only opens the Sheet ID created by its setup.
3. Deploy as a **Web app**, execute as **Me**, access **Anyone**. Every private request requires a 64-character connection key; the anonymous GET endpoint returns only an app/version health check.
4. Run `setupWearNext` again after deployment to update the private Setup tab's deployment link. This function is idempotent: it preserves clothes, photos, history, preferences and the existing key.
5. Open the app on each trusted phone. In Settings, enter the deployment's `/exec` link and the `connection_key` from the private Setup tab. The key is kept in that browser's local storage. Never paste it into public source code, a screenshot, a public issue or a shared URL.
6. Add to Home Screen in Safari (iPhone) or Chrome (Android). The installed browser context may require connecting once separately.

If Google displays an account, permission or unverified-app warning, the owner must review that screen. Do not automate bypassing security warnings.

## Privacy and access

The GitHub repository and built app contain code and fictional sample clothes only. Private wardrobe data, photos, connection keys and Google credentials never belong in the repository. `.clasp.json`, `.clasprc.json`, `.env*` and local test output are ignored.

Anyone with the connection key and backend link can access this single personal wardrobe. It is a shared-secret connection, not per-person Google sign-in. Use trusted devices. To revoke all devices, run `rotateConnectionKey` in the private script editor and reconnect with the new key. Disconnecting one device removes its local key but does not revoke another device.

Duplicate comparison and color repair read saved photos sequentially; analysis results are kept in memory only for the session. No backend redeployment is required for these tools. Fresh cloud-state checks prevent ordinary duplicate uploads and retries; simultaneous uploads from separate devices are not an atomic deduplication guarantee.

Private photos are fetched through the authenticated backend by wardrobe ID, not public Drive image URLs. The service worker never caches records, keys or private photos. The weather provider receives only the selected city/coordinates, not clothing data or the connection key. Photo cleanup, clothing recognition, duplicate comparison, color repair, outfit generation and scoring run locally. Recognition downloads a public 96 MB CLIP model and a WebAssembly runtime on first use and caches the weights when browser storage allows it. Photos are never sent to an AI service. Older/low-memory devices or unavailable downloads fall back to manual review. Color repair can still use strong foreground color evidence when the model is unavailable.

The source photo stored by the app is a resized JPEG, not an archival original. Keep your original camera files if needed. Apps Script/Drive quotas apply; large wardrobes can load more slowly than a dedicated database/photo service. Image downloads are lazy and concurrency-limited. Do not use this as a multi-tenant public service without replacing the personal-key access model.

## Development and deployment

Requires Node.js 22.13 or newer.

```
npm ci
npm test
npm run dev
npm run build
```

The app uses the `/wearnext/` GitHub Pages path. Set GitHub Pages Source to **GitHub Actions**. The included workflow tests and builds before publishing. It needs no Google or AI credentials in Actions. Backend deployment is separate through the personal Apps Script project; keep updating the same deployment to preserve the phone's API URL.

Tests use synthetic data and a mocked Google runtime; they never edit your real Sheet. Real-account authorization and a live upload/save/reload test are still required to verify a fresh deployment.

The category model is derived from MIT-licensed OpenAI CLIP ViT-B/32. Its source, checksum, vocabulary, export steps and license are in `public/models/clip-clothing/` and `scripts/export-category-model.py`.

Implementation references: [Google Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Advanced Drive service](https://developers.google.com/apps-script/advanced/drive), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
