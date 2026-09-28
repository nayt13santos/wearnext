# WearNext

A personal wardrobe web app. GitHub Pages hosts the interface. A separate Google Apps Script project saves wardrobe details and wear history in a private Google Sheet, and resized clothing photos in a private Google Drive folder. There is no ChatGPT, Claude, paid AI API, or AI-account dependency at runtime.

## What it does

- Upload clothing photos individually or review a batch one item at a time.
- Rotate, resize, zoom/crop, and optionally clean a simple background on the device. Color is suggested from pixels; confirm the other garment details yourself.
- Generate outfits for a purpose, temperature, rain and indoor air conditioning. Lock favorites and swap available alternatives.
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
5. Open the app on each trusted phone. In Preferences, enter the deployment's `/exec` link and the `connection_key` from the private Setup tab. The key is kept in that browser's local storage. Never paste it into public source code, a screenshot, a public issue or a shared URL.
6. Add to Home Screen in Safari (iPhone) or Chrome (Android). The installed browser context may require connecting once separately.

If Google displays an account, permission or unverified-app warning, the owner must review that screen. Do not automate bypassing security warnings.

## Privacy and access

The GitHub repository and built app contain code and fictional sample clothes only. Private wardrobe data, photos, connection keys and Google credentials never belong in the repository. `.clasp.json`, `.clasprc.json`, `.env*` and local test output are ignored.

Anyone with the connection key and backend link can access this single personal wardrobe. It is a shared-secret connection, not per-person Google sign-in. Use trusted devices. To revoke all devices, run `rotateConnectionKey` in the private script editor and reconnect with the new key. Disconnecting one device removes its local key but does not revoke another device.

Private photos are fetched through the authenticated backend by wardrobe ID, not public Drive image URLs. The service worker never caches records, keys or private photos. The weather provider receives only the selected city/coordinates, not clothing data or the connection key. Photo cleanup, outfit generation and scoring run locally.

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

Implementation references: [Google Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Advanced Drive service](https://developers.google.com/apps-script/advanced/drive), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
