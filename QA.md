# Verification

## Photo category recognition — October 19, 2026

- 53 automated tests pass. Added category score selection and editor regressions for manual overrides, slow/stale detection, model failures, unclear photos and independent batch categories. TypeScript and production build pass.
- Exported the original MIT-licensed CLIP ViT-B/32 image encoder with fixed clothing labels and int8 weights. Checked six fictional catalogue crops: tee, trousers, shorts, shoes and overshirt were clear matches; the ambiguous shirt/overshirt crop correctly required a manual choice. These examples are smoke checks, not an accuracy benchmark.
- Verified the production build in Chrome using a local shoe photo: the real worker/model loaded, suggested Shoes and enabled the form. The test photo remained in an unsaved preview. Physical phone performance is unverified; unavailable recognition permits manual selection.
- Reviewed the owner’s saved wardrobe photos through the connected app and corrected five misclassified categories. No photos, keys or private record identifiers are stored in this repository.

## Generate Outfit feedback — October 19, 2026

- Reproduced a phone layout issue: Generate updated the result below the viewport while the button and visible page appeared unchanged.
- Each attempt now focuses and scrolls to the result, announces the outcome, and displays no-match feedback beside the button. Empty wardrobes and unexpected generator errors provide instructions instead of a silent action.
- All 43 automated tests pass, including four screen-interaction regressions. TypeScript validation and the production build pass.
- Verified successful generation and no-match feedback in Chrome at a 390 × 844 phone viewport using sample clothes. The user's private wardrobe and device session were not used for these checks.

## Passed locally

- 37 automated tests: outfit generation, locks, rotation boundaries, shoe/accessory exceptions, laundry/archive exclusions, purchase scoring, backend authentication, validation, safe error responses, upload idempotency, protected photo access, wear/undo history, connection transport, preservation of live setup URLs, separate gallery/camera controls, cancellation, disabled controls, color sampling, upload-response photo reuse, close/reopen during processing, stale processing failures, failed batch retry/skip, and cloud-save retry preservation.
- TypeScript validation and production build.
- Dependency audit after updating Vite: zero reported vulnerabilities.
- Original inventory app and earlier prototype left unchanged.

## Verified live on September 28, 2026

- Owner-authorized Apps Script setup completed under the personal Google account.
- Wardrobe Sheet is private to its owner; setup created the private photo folder.
- Public backend health returned HTTP 200 and the expected app/version JSON.
- Frontend connected with the private key after the owner approved device storage. Preferences showed “This device is connected.” Reload retained the connection and loaded the wardrobe.
- Desktop preferences save was exercised without changing values; cross-device persistence and photo writes remain unverified.

## Requires live verification

- Save, reload, and retrieve a clothing photo from private Drive.
- Test preferences and wear/undo across two connected devices.
- Visual desktop/mobile browser check and Add to Home Screen verification.

These are not represented as completed by the mocked test suite.

## Seller-photo feature removed (October 4, 2026)

- Removed automatic seller-photo search, the Google Lens/import panel, and search-key setup at the owner's request.
- Removed the backend search/configuration/image-fetch actions. Existing wardrobe rows and private photos remain intact; editing existing rows preserves any extra source columns already present in the Sheet.
- Regular uploads, camera capture, rotate/crop, optional plain-background cleanup, and batch retry/skip remain available.
- 39 tests, TypeScript validation, and the production build pass.

## Camera and upload changes (September 28, 2026)

- Dedicated rear-camera input (`image/*`, `capture=environment`, single image), separate from multi-select wardrobe gallery input. Purchase gallery remains single-image.
- Browser: camera input opened a single-file chooser on desktop and processed the public sample image. A 390px-wide screenshot verified both actions are visible and readable. Physical iPhone/Android camera capture remains unverified.
- Saving now uses the authoritative state returned by upload instead of issuing another state request, and seeds the session-only photo cache with the uploaded display image instead of downloading it again.
- Color sampling uses a linear nearest-swatch search. A local synthetic 1200×1200 benchmark (five runs) averaged 189ms before and 9ms after with the same color. This is not an end-to-end phone or Google upload benchmark.
- Independent read-only Bugbot-style review: no introduced regressions identified; two pre-existing editor bugs found. Both fixed after user approval: opening resets processing state and stale callbacks cannot overwrite a new session; failed batch items remain available for explicit Retry/Skip, with the prior saved preview cleared. Five new editor regression tests cover these transitions and cloud-save retry. The independent review ran once before these fixes; subsequent verification is the regression suite and build, not a second review.
