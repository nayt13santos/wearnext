# WearNext

An installable, private wardrobe web app inspired by the everyday usefulness of Octogo, not its restaurant branding.

Visual thesis: a quiet digital dressing table. Denim blue controls, a white photographic outfit board, alternative pieces alongside it. Keep clothing the dominant visual.

Palette: canvas #F4F6F9, paper #FFFFFF, ink #182534, denim #234EDB, secondary #5D6B7A, warm weather #B47713. Type: Avenir Next/Avenir/Segoe UI, a humanist sans with compact, strong headings. No marketing hero, repeated dashboard tiles, or decorative charts. The outfit editor combines a compact live preview with centered clothing rows. Planning controls sit beside it on desktop and above it on phones.

Outfit views: Mix & match combines a compact sticky outfit preview and category-specific horizontal pickers in one white panel. The selected garments align down the center, outlined in denim, while the preview updates in place. Desktop and phone use the same integrated layout. Suggestions shows distinct complete clothing collages with quiet palette labels and a direct route into editing. Keep the existing palette and type; motion comes from native swipe scrolling, with immediate selection centering and keyboard/arrow alternatives. Locks, availability and defining colorway colors constrain every choice. Optional layers/accessories can be removed only when the look still meets its rules.

User-confirmed rotation: each clothing piece rests 30 days after an actual wear; shoes and accessories can repeat. Adjustable 0–90 days. Laundry and archive always exclude items. No silent cooldown overrides.

Purchase scorer: transparent rule-based compatibility and metadata similarity, not an AI claim. Category uses a locally hosted, quantized CLIP image encoder with fixed clothing prompts. Close category scores and weak/non-clothing matches require manual selection; predictions are suggestions, not calibrated probabilities. A worker keeps inference off the UI thread. Closing/changing photos or selecting a category prevents late predictions from overriding user input. Style/pattern/material require user review. Color is suggested from image pixels. Resized source and processed display photos live in private Google Drive files; metadata and wear history live in Google Sheets.

Demo catalogue is fictional, generated during development. The demo never persists into the user's wardrobe. Asset public/demo-catalog.png is a 3×2 image atlas. No generative AI service is called by the app.

Connection screen: preserve the denim palette and humanist type. Put Google connection fields inside Preferences in a single left-aligned panel: storage explanation, deployment link, private key, Connect this device. Keep the outfit board as the main visual. No new marketing hero or separate login brand.
