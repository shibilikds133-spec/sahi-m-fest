# Portal PWA branding

The Admin install uses `public/manifest.json` and the name Consolium. The Team Leader and Stage Management portals start with their generic static manifests. Once team or venue context loads, `applyPortalPwaMetadata` updates the page title, iOS Home Screen title, and manifest URL. The dynamic `/portal-manifest` endpoint returns the actual team or venue name and a distinct app ID for that team or venue. Cloudflare Pages serves the route from `functions/portal-manifest.ts`; Vercel uses `api/portal-manifest.ts` and its explicit rewrite. Both derive asset and start URLs from the request origin, so changing the deployment domain requires no source edit.

All three installs use the Consolium artwork in `public/brand`. The same crest is used for the Expo native app icons and portal headers. iOS touch icons include 152, 167, and 180 pixel variants; Android has 192, 512, and maskable 512 pixel PNGs. `PwaInstallCard` shows platform-specific instructions on iOS and Android and hides after standalone installation.

QR and copied browser links use the current origin. Native builds have no browser origin; set `EXPO_PUBLIC_APP_ORIGIN` to the public HTTPS app origin when building a native app to enable external QR links. This branding change does not modify tenant data, authorization, or database schema.
