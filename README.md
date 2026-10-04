# WearNext

A personal wardrobe web app. GitHub Pages hosts the interface. A separate Google Apps Script project saves wardrobe details and wear history in a private Google Sheet, and resized clothing photos in a private Google Drive folder. There is no ChatGPT, Claude, paid AI API, or AI-account dependency at runtime.

## What it does

- Upload clothing photos individually or review a batch one item at a time.
- Rotate, resize, zoom/crop, and optionally clean a simple background on the device. Color is suggested from pixels; confirm the other garment details yourself.
- Find possible seller photos with optional SerpApi Google Lens search. Preview and confirm the exact garment/color before replacing the display photo. The resized camera original remains the saved backup, and source links are retained in the Sheet.
- Use Google Lens manually and upload a downloaded seller photo without any search key. Restore the original before saving with one button.
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

## Optional seller-photo search

In **Preferences → Seller-photo search**, connect a SerpApi key from your own account. It is validated against SerpApi and stored only in Apps Script Properties (`SERPAPI_KEY`), never returned to the browser or included in public source. There is no AI account dependency. Use the provider's free plan if you want to avoid a subscription; WearNext never changes billing settings.

Choosing **Find seller photos** sends an EXIF-free JPEG under 500 KB to SerpApi's Image API, then searches Google Lens using the returned image ID. This intentionally shares that photo with the search providers and is subject to their retention policies. The rest of the wardrobe, connection key, and original Drive file stay private. Results are possible matches, not verified product identities. Select a result, preview its downloaded image, and confirm the design and color before using it.

WearNext caps attempts at 250 per Manila calendar month, with a short result cache to avoid repeat searches. Failed provider attempts may consume the local limit; the provider's own account allowance can differ. The manual Lens + seller-photo upload path remains available without a key or when a provider fails. Lookup failures never replace the current clothing photo. Imports accept only short-lived result IDs, validate public image URLs/DNS and redirects, and verify supported image bytes. Some sellers block downloads; save their image and use the manual upload in that case.

The feature applies while adding a new garment or previewing a purchase. Existing saved garments retain their photos. The next seller-photo save adds two optional source columns to the existing Wardrobe sheet without rerunning setup or replacing data. Updating the same Apps Script deployment is required for the new authenticated `sellerStatus`, `sellerKey`, `sellerSearch`, and `sellerImage` actions.

References: [SerpApi image upload](https://serpapi.com/google-lens-upload-an-image), [Google Lens results](https://serpapi.com/google-lens-api), [manual Google image search](https://support.google.com/websearch/answer/1325808).

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
