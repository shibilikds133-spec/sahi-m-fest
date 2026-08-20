# Architecture Audit — Phase 1

**Date**: 2026-07-22
**Scope**: Full repository inspection of `web-for-sahi--main`
**Mode**: READ-ONLY audit. No code changes, no migrations, no configuration changes.

---

## 1. Executive Inventory Summary

This is an Expo 54 + React Native 0.81 + TypeScript festival management platform (SSF Sahithyotsav) being converted from a single-festival app into a reusable multi-festival platform. The system runs on Supabase (Auth, PostgreSQL, Edge Functions, Realtime) with Cloudflare R2 for file storage. A partially completed backend decoupling migration introduced provider/repository/service layers for some modules, but many screens still call Supabase directly.

**Key numbers:**
- **76 SQL migrations** (including duplicate numbers `018` and `022`)
- **20+ root-level SQL repair/test scripts**
- **4 Supabase Edge Functions**
- **~30 service/hook/route files** with direct Supabase imports
- **3 route groups** with distinct auth levels: `(admin)`, `(super)`, `(public)`, plus `judge/` and `stage-management/`
- **Dual storage providers**: R2 (default) and Supabase Storage (fallback)
- **Partially migrated** service layer: auth, participants, festival settings, bulk import, judges, schedules, leaderboard, results visibility, super admin, organisation, storage
- **Not yet migrated**: many hooks, screens, and some services still import Supabase directly

---

## 2. Repository Scope Inspected

All files and directories were inspected. Files read include:

| Category | Files Inspected |
|---|---|
| Configuration | `package.json`, `tsconfig.json`, `app.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `eslint.config.js`, `vercel.json` |
| App entry/layout | `src/app/_layout.tsx`, all `(admin)`, `(super)`, `(public)`, `(auth)`, `judge/`, `stage-management/`, `unit-profile/`, `api/` layouts |
| Providers | All files in `src/providers/auth/`, `src/providers/database/`, `src/providers/storage/` |
| Services | All 20 files in `src/services/` |
| Hooks | All 18 files in `src/core/hooks/` + 3 in `src/hooks/` |
| Core | `src/core/config/`, `src/core/contexts/`, `src/core/store/`, `src/core/rules/`, `src/core/utils/` |
| Lib | `src/lib/repositories/` (11 files), `src/lib/calculators/`, `src/lib/validation/` |
| Types | `src/types/index.ts` |
| Constants | `src/constants/` (5 files) |
| Components | `src/components/` (all subdirectories) |
| Edge Functions | All 4 in `supabase/functions/` |
| SQL Migrations | All 76 filenames in `supabase/migrations/` |
| Root SQL files | All 20+ `.sql` files in project root |
| Scripts | All 8 files in `scripts/` + 2 in `scratch/` |
| Documentation | `plan.md`, `project.md`, `rule.md`, `README.md`, `unit_links.md` |
| Data files | `importjson/`, `_Import_Report_/`, `src/data/scoring_rules.json` |

---

## 3. Repository Tree

```text
web-for-sahi--main/
├── src/
│   ├── app/                          Expo Router file-based routes
│   │   ├── _layout.tsx               Root layout (QueryClient, Theme, Auth, Notifications)
│   │   ├── index.tsx                 Root redirect
│   │   ├── notifications.tsx         Notification inbox
│   │   ├── settings.tsx              Global settings redirect
│   │   ├── (admin)/                  Authenticated admin routes
│   │   │   ├── _layout.tsx           Admin Stack + BackgroundExportEngine
│   │   │   ├── index.tsx             Admin dashboard
│   │   │   ├── participants/         Participant CRUD, import (7 import variants), chest cards
│   │   │   ├── schedule/             Schedule CRUD, venues, check-in, code-letter, marks, results
│   │   │   ├── judges/               Judge management
│   │   │   ├── organisations/        Organisation management
│   │   │   ├── communication/        Communication center
│   │   │   └── settings/             Festival settings (calendar, items, points, scoring-rules, leaderboard/)
│   │   │       └── leaderboard/      Leaderboard controls, unit/individual rankings, poster studio, media center
│   │   ├── (super)/                  Super-admin routes
│   │   │   ├── index.tsx             Super dashboard
│   │   │   ├── organisations/        Global org management
│   │   │   └── tenants/              Tenant account management
│   │   ├── (public)/                 Unauthenticated public routes
│   │   │   ├── index.tsx             Public landing page
│   │   │   ├── leaderboard.tsx       Public leaderboard
│   │   │   └── leaderboard/          Item results, schedule, unit rankings
│   │   ├── (auth)/                   Authentication
│   │   │   └── login.tsx             Login screen
│   │   ├── judge/                    Judge portal (token-based, unauthenticated)
│   │   │   ├── index.tsx             Judge token login
│   │   │   └── marks.tsx             Judge mark entry
│   │   ├── stage-management/         Stage management (check-in, code-letter)
│   │   ├── unit-profile/             Unit profile public view
│   │   ├── candidate/                Candidate profile public view
│   │   └── api/                      API routes (public-ai-chat, tts)
│   ├── components/
│   │   ├── layout/                   PageAccessControl
│   │   ├── leaderboard/              BackgroundExportEngine, PosterGenerationEngine, PosterStudio/, PosterTemplateManager, PublicAiChatbot
│   │   ├── publicLanding/            PublicLandingPage + 10 sub-components
│   │   └── ui/                       SsfButton, SsfCard, SsfInput, SsfLogo, PageHeader, StatusBadge, NotificationToast, etc.
│   ├── core/
│   │   ├── config/                   supabase.ts (client creation), dev_config.ts
│   │   ├── contexts/                 NotificationContext.tsx (push notifications + realtime)
│   │   ├── hooks/                    18 hooks (useFestival, useParticipants, useProtectedRoute, useJudges, useLeaderboard, etc.)
│   │   ├── rules/                    RuleEngine, registrationRules (7 rules), types
│   │   ├── store/                    authStore (Zustand), pageManagementStore
│   │   └── utils/                    pointCalculator, scoringRules, participantValidation
│   ├── lib/
│   │   ├── calculators/              resultCalculator.ts
│   │   ├── repositories/             11 repositories (festival, participant, judge, leaderboard, etc.)
│   │   └── validation/               registrationValidator.ts
│   ├── providers/
│   │   ├── auth/                     AuthProvider interface + SupabaseAuthProvider
│   │   ├── database/                 DatabaseProvider interface (146 methods) + SupabaseDatabaseProvider (1278 lines)
│   │   └── storage/                  StorageProvider interface + R2StorageProvider + SupabaseStorageProvider
│   ├── services/                     20 service files + storage/ subdirectory (5 files)
│   ├── types/                        index.ts (Tenant, Festival, Category, Item, Participant, Registration, PointsConfig)
│   ├── constants/                    categories, items, leaderboard, theme, topics
│   ├── utils/                        pdfGenerator.ts
│   ├── hooks/                        use-color-scheme, use-theme-color (3 files)
│   ├── data/                         scoring_rules.json
│   ├── assets/                       (images)
│   └── scripts/                      reset-project.js
├── supabase/
│   ├── migrations/                   76 SQL migration files (001-076)
│   ├── functions/
│   │   ├── _shared/                  r2Client.ts
│   │   ├── r2-presign/               R2 presigned URL generation (Deno)
│   │   ├── send-notification/        Push notification sender (Deno)
│   │   └── notification-cron/        Schedule reminder cron (Deno)
│   └── .temp/
├── scripts/                          8 utility/test scripts
├── scratch/                          2 diagnostic scripts
├── importjson/                       8 JSON import data files
├── _Import_Report_/                  11 import report PDFs/JSONs
├── public/logo/                      Logo assets
├── fonts/                            Custom fonts (CooperBlack)
├── *.sql (root)                      20+ root-level SQL scripts (test data, fixes, repairs)
├── *.js (root)                       10+ root-level test/diagnosis scripts
├── plan.md                           Master agent plan (817 lines)
├── project.md                        Architecture doc (195 lines)
├── rule.md                           Business rules doc (270 lines)
├── README.md                         Default Expo README
└── unit_links.md                     Empty array placeholder
```

---

## 4. Technology Stack

### Frontend Framework
| Package | Version | Status | Usage |
|---|---|---|---|
| `react` | 19.1.0 | Active | Core UI |
| `react-native` | 0.81.5 | Active | Core runtime |
| `react-native-web` | 0.21.0 | Active | Web target |
| `expo` | ~54.0.34 | Active | Framework |

### Routing
| Package | Version | Status | Usage |
|---|---|---|---|
| `expo-router` | ~6.0.23 | Active | File-based routing, root layout |

### UI and Styling
| Package | Version | Status | Usage |
|---|---|---|---|
| `nativewind` | ^4.2.3 | Active | Tailwind CSS for RN |
| `tailwindcss` | ^3.4.19 | Active | CSS utility classes |
| `lucide-react-native` | ^1.7.0 | Active | Icons |
| `@expo/vector-icons` | ^15.0.3 | Active | Icons |
| `@expo-google-fonts/poppins` | ^0.4.1 | Active | Poppins font family |
| `@expo-google-fonts/montserrat` | ^0.4.2 | Active | Montserrat font family |
| `expo-linear-gradient` | ~15.0.8 | Active | Gradient backgrounds |
| `expo-image` | ~3.0.11 | Active | Image component |
| `react-native-svg` | 15.12.1 | Active | SVG rendering |
| `webfontloader` | ^1.6.28 | Active | Web font loading |
| `konva` / `react-konva` / `use-image` | ^10.3.0 / ^19.2.4 / ^1.1.4 | Active | Poster Studio canvas editor |

### State Management
| Package | Version | Status | Usage |
|---|---|---|---|
| `zustand` | ^5.0.12 | Active | Auth store, page management store, export queue store |
| `@tanstack/react-query` | ^5.96.2 | Active | Server state cache, mutations |

### Data Fetching
| Package | Version | Status | Usage |
|---|---|---|---|
| `@supabase/supabase-js` | ^2.101.1 | Active | Primary data access |

### Local Storage
| Package | Version | Status | Usage |
|---|---|---|---|
| `@react-native-async-storage/async-storage` | 2.2.0 | Active | Session persistence (native) |
| `dexie` | ^4.4.2 | Active | IndexedDB wrapper (likely for local caching, **usage not confirmed in source**). **Possible unused** |
| `react-native-url-polyfill` | ^3.0.0 | Active | URL polyfill for Supabase client |

### Backend Services
| Package | Version | Status | Usage |
|---|---|---|---|
| `@supabase/supabase-js` | ^2.101.1 | Active | Auth, database, storage, Edge Functions, Realtime |

### File Storage
| Package | Version | Status | Usage |
|---|---|---|---|
| Cloudflare R2 | Via Edge Function | Active | Primary storage via `r2-presign` |
| Supabase Storage | Via supabase-js | Active | Fallback storage provider |
| `expo-file-system` | ~19.0.22 | Active | File operations |
| `expo-document-picker` | ~14.0.8 | Active | Import file selection |

### PDF and Document Generation
| Package | Version | Status | Usage |
|---|---|---|---|
| `expo-print` | ~15.0.8 | Active | PDF generation |
| `expo-sharing` | ~14.0.8 | Active | Share generated files |
| `html-to-image` | ^1.11.13 | Active | Poster generation |

### Image Processing
| Package | Version | Status | Usage |
|---|---|---|---|
| `expo-camera` | ~17.0.10 | Active | Camera access (QR scanning) |
| `html-to-image` | ^1.11.13 | Active | Canvas-to-image for posters |

### Excel Import/Export
| Package | Version | Status | Usage |
|---|---|---|---|
| `xlsx` | ^0.18.5 | Active | Excel file parsing |

### Notifications
| Package | Version | Status | Usage |
|---|---|---|---|
| `expo-notifications` | ^0.32.17 | Active | Push notifications |
| `expo-device` | ~8.0.10 | Active | Device detection for push |

### AI/LLM
| Package | Version | Status | Usage |
|---|---|---|---|
| `@google/generative-ai` | ^0.24.1 | Active | Public AI chatbot |
| `openai` | ^6.39.0 | Likely unused | Imported but no confirmed active use in services. **Possible legacy** |
| `google-tts-api` | ^2.0.2 | Active | Text-to-speech API route |

### Validation
| Package | Version | Status | Usage |
|---|---|---|---|
| `zod` | ^4.4.3 | **Unclear** | Not found imported in any service/hook. **Possible unused** |

### Navigation
| Package | Version | Status | Usage |
|---|---|---|---|
| `@react-navigation/bottom-tabs` | ^7.4.0 | **Unclear** | Not used in visible layouts (Stack-based). **Possible unused/legacy** |
| `@react-navigation/elements` | ^2.6.3 | **Unclear** | **Possible unused** |
| `@react-navigation/native` | ^7.1.8 | **Unclear** | Expo Router uses it internally but direct imports not confirmed |

### Animation
| Package | Version | Status | Usage |
|---|---|---|---|
| `react-native-reanimated` | ~4.1.1 | Active | Animations |
| `react-native-gesture-handler` | ~2.28.0 | Active | Gestures |
| `react-native-worklets` | 0.5.1 | Active | Reanimated dependency |

### Build/Dev
| Package | Version | Status | Usage |
|---|---|---|---|
| `typescript` | ~5.9.2 | Active | Type checking |
| `eslint` | ^9.25.0 | Active | Linting |
| `eslint-config-expo` | ~10.0.0 | Active | Expo lint config |
| `expo-splash-screen` | ~31.0.13 | Active | Splash screen |
| `expo-status-bar` | ~3.0.9 | Active | Status bar |
| `expo-constants` | ~18.0.13 | Active | App constants |
| `expo-linking` | ~8.0.12 | Active | Deep linking |
| `expo-haptics` | ~15.0.8 | Active | Haptic feedback |
| `expo-symbols` | ~1.0.8 | Active | SF Symbols |
| `expo-system-ui` | ~6.0.9 | Active | System UI |
| `expo-web-browser` | ~15.0.11 | Active | In-app browser |

**Potentially unused/legacy packages**: `dexie`, `openai`, `zod`, `@react-navigation/bottom-tabs`, `@react-navigation/elements`, `@react-navigation/native` (as direct dependencies — Expo Router bundles these internally).

---

## 5. Application Entry Points and Routes

### Entry Point
- `package.json` → `"main": "expo-router/entry"` → Expo Router entry
- `app.json` → scheme: `"sahiweb"` (deep linking)

### Root Layout
- `src/app/_layout.tsx`: QueryClientProvider, ThemeProvider, NotificationProvider, NotificationToast, useProtectedRoute, fonts, splash screen

### Route Hierarchy

```text
/ (root)
├── (public)/                    Default anchor (unauthenticated)
│   ├── index.tsx                Public landing page
│   ├── leaderboard.tsx          Public leaderboard
│   └── leaderboard/
│       ├── item-results.tsx     Public item-level results
│       ├── schedule.tsx         Public schedule view
│       └── unit-rankings.tsx    Public unit rankings
├── (auth)/
│   └── login.tsx                Login screen
├── (admin)/                     Authenticated admin only (role === 'admin')
│   ├── index.tsx                Admin dashboard
│   ├── participants/
│   │   ├── index.tsx            Participant list
│   │   ├── add.tsx              Add participant
│   │   ├── import.tsx           Import participants (Excel)
│   │   ├── import-lp.tsx        Import LP dataset
│   │   ├── import-up.tsx        Import UP dataset
│   │   ├── import-hs.tsx        Import HS dataset
│   │   ├── import-hss.tsx       Import HSS dataset
│   │   ├── import-senior.tsx    Import Senior dataset
│   │   ├── import-general.tsx   Import General dataset
│   │   ├── import-json.tsx      Import JSON dataset
│   │   ├── chest-cards.tsx      Chest card generation
│   │   ├── chest-numbers.tsx    Chest number management
│   │   ├── manage-units.tsx     Unit reassignment
│   │   └── [id]/index.tsx       Participant detail
│   ├── schedule/
│   │   ├── index.tsx            Schedule list
│   │   ├── create.tsx           Create schedule
│   │   ├── venues.tsx           Venue management
│   │   ├── import-json.tsx      Import schedule JSON
│   │   └── [id]/
│   │       ├── checkin.tsx      Event check-in
│   │       ├── code-letter.tsx  Code letter assignment
│   │       ├── marks.tsx        Mark entry
│   │       ├── results.tsx      Results management
│   │       └── edit.tsx         Edit schedule
│   ├── judges/index.tsx         Judge management
│   ├── organisations/index.tsx  Organisation management
│   ├── communication/
│   │   ├── index.tsx            Send notification
│   │   └── history.tsx          Notification history
│   └── settings/
│       ├── index.tsx            Settings hub
│       ├── calendar.tsx         Festival calendar settings
│       ├── items.tsx            Item configuration
│       ├── points.tsx           Points configuration
│       ├── api-keys.tsx         API key management
│       ├── scoring-rules/       Scoring criteria management
│       │   ├── index.tsx
│       │   └── [id].tsx
│       └── leaderboard/         Leaderboard management
│           ├── index.tsx        Leaderboard overview
│           ├── controls.tsx     Publish/hide controls
│           ├── unit-rankings.tsx Unit rankings admin
│           ├── individual-rankings.tsx Individual rankings
│           ├── item-results.tsx Item-level result controls
│           ├── media-center.tsx Media center
│           ├── poster-studio.tsx Poster Studio canvas
│           └── _layout.tsx      Leaderboard settings layout
├── (super)/                     Super admin only (is_superadmin === true)
│   ├── index.tsx                Super admin dashboard
│   ├── organisations/index.tsx  Global org management
│   └── tenants/index.tsx        Tenant account management
├── judge/                       Judge portal (token-based, unauthenticated)
│   ├── index.tsx                Token entry
│   └── marks.tsx                Mark entry
├── stage-management/            Stage management (unauthenticated)
│   ├── index.tsx
│   └── [id]/
│       ├── checkin.tsx
│       └── code-letter.tsx
├── unit-profile/
│   ├── [id].tsx                 Unit profile view
│   └── [id]/missing-items.tsx   Missing items view
├── candidate/[slug].tsx         Candidate public profile
├── notifications.tsx            Notification inbox
├── settings.tsx                 Global settings redirect
└── api/
    ├── public-ai-chat+api.ts    AI chatbot API
    └── tts+api.ts               Text-to-speech API
```

### Route Protection (`useProtectedRoute.ts`)
- Unauthenticated users → redirected to `(public)` unless on public/judge/candidate/stage-management routes
- After login: superadmin → `(super)`, admin → `(admin)`, judge → `judge/`, others → `(public)`
- Superadmin blocked from `(admin)` and `(judge)`
- Non-superadmins blocked from `(super)`
- Judge group allows `judge` and `admin` roles

---

## 6. Feature Module Inventory

| Module | Main Files | Status | Notes |
|---|---|---|---|
| **Authentication** | `(auth)/login.tsx`, `authStore.ts`, `authService.ts`, `AuthProvider`, `SupabaseAuthProvider` | Active | Fully migrated to service layer. Username→email lookup via RPC |
| **Users/Profiles** | `profiles` table, `authStore` | Active | Profile loading via `authProvider.getProfile()` |
| **Tenants** | `(super)/tenants/`, `superService`, `superRepository` | Active | Tenant creation via RPC `setup_tenant_records` |
| **Organisations** | `(admin)/organisations/`, `(super)/organisations/`, `organisationService`, `organisationRepository` | Active | Hierarchical: District→Division→Sector→Unit. RPC-based child creation |
| **Festival Settings** | `(admin)/settings/`, `useFestival.ts`, `festivalSettingsService`, `festivalRepository` | Active | Calendar, items, points config. Migrated to service layer |
| **Participants** | `(admin)/participants/`, `useParticipants.ts`, `participantService`, `participantRepository` | Active | Full CRUD, 7 import variants (LP/UP/HS/HSS/Senior/General/JSON), profile photos |
| **Registrations** | Via participant detail screens, `participantService.registerParticipantForItem` | Active | Rule engine validation before creation |
| **Schedule/Venues** | `(admin)/schedule/`, `scheduleService`, `scheduleRepository` | Active | Venue CRUD, schedule CRUD, JSON import |
| **Judges** | `(admin)/judges/`, `judgeService`, `judgeRepository` | Active | Judge CRUD, assignment to schedules via JSON array in `schedules.judge_panel_id` |
| **Judge Portal** | `judge/`, `judgeTokenService`, `judgeTokenRepository` | Active | Token-based unauthenticated access. 6-char tokens via RPC |
| **Mark Entry** | `judge/marks.tsx`, `admin/schedule/[id]/marks.tsx` | Active | Criteria-based scoring, draft/final states |
| **Results** | `admin/schedule/[id]/results.tsx` | Active | Rank calculation, grade assignment, points calculation, publish |
| **Result Visibility** | `resultVisibilityService.ts`, `leaderboard/item-results.tsx` | Active | Draft/ready/published/hidden/archived workflow |
| **Leaderboard** | `(public)/leaderboard/`, `leaderboardService`, `adminLeaderboardService`, `leaderboardSettingsService` | Active | Public and admin views, unit/individual rankings |
| **Scoring Rules** | `admin/settings/scoring-rules/`, `scoringRuleRepository`, `scoringRules.ts` | Active | Per-item criteria with DB-backed rules |
| **Poster Studio** | `leaderboard/PosterStudio/`, `poster-studio.tsx` | Active | Canvas-based poster editor (Konva). Background template, layers, variables |
| **Media Center** | `leaderboard/media-center.tsx`, `storage/` services | Active | Generated assets management |
| **Communication** | `(admin)/communication/`, `send-notification` Edge Function | Active | Push notifications + in-app inbox |
| **Notifications** | `NotificationContext.tsx`, `notifications.tsx` | Active | Expo push tokens, Supabase Realtime, toast UI |
| **Storage** | `providers/storage/`, `services/storage/` | Active | R2 + Supabase Storage dual providers |
| **Public AI Chatbot** | `PublicAiChatbot.tsx`, `public-ai-chat+api.ts`, `publicAiService.ts` | Active | Gemini-powered public chatbot |
| **Public Landing** | `(public)/index.tsx`, `publicLanding/` | Active | Animated landing page with stats, schedule, leaderboard |
| **Candidate Profile** | `candidate/[slug].tsx`, `participantService.getPublicCandidateProfile` | Active | Public participant profile with published results |
| **Unit Profile** | `unit-profile/[id].tsx`, `unitProfileService` | Active | Public unit view with participants and results |
| **PDF Generation** | `pdfGenerator.ts` | Active | Unit report PDF via expo-print |
| **Bulk Import** | `useBulkImport.ts`, `participantService`, import screens | Active | 7 category-specific import variants via RPC |
| **Bulk Unit Assignment** | `manage-units.tsx`, `participantUnitAssignmentService` | Active | Preview/execute/rollback via RPC |
| **Chest Numbers** | `chest-numbers.tsx`, `chest-cards.tsx` | Active | Category-wise generation, card rendering |
| **Code Letters** | `code-letter.tsx` | Active | Random draw with conflict avoidance |
| **Check-in** | `checkin.tsx` | Active | QR/manual verification |
| **Export Queue** | `exportQueueService.ts`, `BackgroundExportEngine.tsx` | Active | Background poster/asset export with retry |
| **Font Management** | `fontService.ts` | Active | Custom font upload via storage |
| **API Keys** | `admin/settings/api-keys.tsx` | Partial | Screen exists; `system_api_keys` table in DB |
| **Audit Logs** | `participant_unit_audit_logs`, `system_events` tables | Partial | Used for unit assignment audit. No general audit UI |
| **Backup/Restore** | `storage/backup` type, `clear_test_data.sql` | Partial | Backup upload exists. No restore UI |
| **Transfer System** | Not implemented | Not Started | Referenced in plan.md but no code |
| **Certificates** | Not implemented | Not Started | Referenced in plan.md but no code |

---

## 7. Current Architecture Patterns

### Provider Pattern (Partially Applied)
```
src/providers/auth/
  AuthProvider.ts         ← Interface: lookupEmailByUsername, signInWithPassword, signOut, getSession, getProfile
  SupabaseAuthProvider.ts ← Implementation: Supabase-backed
  index.ts                ← Exports singleton `authProvider`

src/providers/database/
  DatabaseProvider.ts     ← Interface: ~80+ methods
  SupabaseDatabaseProvider.ts ← Implementation: 1278 lines, Supabase-backed
  index.ts                ← Exports singleton `databaseProvider`

src/providers/storage/
  storageProvider.ts      ← Interface: upload, delete, getUrl, saveMetadata
  r2StorageProvider.ts    ← Implementation: R2 via Edge Function
  supabaseStorageProvider.ts ← Implementation: Supabase Storage
  index.ts                ← Exports singleton based on EXPO_PUBLIC_STORAGE_PROVIDER env
```

### Repository Pattern (Partially Applied)
```
src/lib/repositories/
  festivalRepository.ts          → Uses databaseProvider
  participantRepository.ts       → Uses databaseProvider
  judgeRepository.ts             → Uses databaseProvider
  judgeTokenRepository.ts        → Uses databaseProvider
  leaderboardRepository.ts       → Uses databaseProvider
  adminLeaderboardRepository.ts  → Uses databaseProvider
  leaderboardSettingsRepository.ts → Uses databaseProvider
  organisationRepository.ts      → Uses databaseProvider + supabase auth
  scheduleRepository.ts          → Uses databaseProvider
  scoringRuleRepository.ts       → Uses databaseProvider
  superRepository.ts             → Uses databaseProvider + supabase auth
```

### Service Layer (Partially Applied)
```
src/services/
  authService.ts                   → Uses authProvider
  participantService.ts            → Uses participantRepository + ruleEngine + uploadService
  festivalSettingsService.ts       → Uses festivalRepository
  judgeService.ts                  → Uses judgeRepository + pointCalculator
  judgeTokenService.ts             → Uses judgeTokenRepository + databaseProvider
  scheduleService.ts               → Uses scheduleRepository
  leaderboardService.ts            → Uses leaderboardRepository
  adminLeaderboardService.ts       → Uses adminLeaderboardRepository
  leaderboardSettingsService.ts    → Uses leaderboardSettingsRepository
  resultVisibilityService.ts       → Uses databaseProvider
  organisationService.ts           → Uses organisationRepository
  superService.ts                  → Uses superRepository + createClient (⚠️ direct import)
  adminDashboardService.ts         → Uses databaseProvider
  participantUnitAssignmentService.ts → Uses participantRepository
  jsonImportService.ts             → Uses storageService
  fontService.ts                   → Uses supabase directly (⚠️)
  publicAiService.ts               → Uses supabase directly (⚠️)
  unitProfileService.ts            → Uses supabase directly (⚠️)
  exportQueueService.ts            → Uses supabase directly + storageService (⚠️)
```

### Hooks as Services
```
src/core/hooks/
  useFestival.ts              → Uses festivalSettingsService (migrated)
  useParticipants.ts          → Uses participantService (migrated)
  useJudges.ts                → Uses judgeService (migrated)
  useLeaderboard.ts           → Uses leaderboardService (migrated)
  useAdminLeaderboard.ts      → Uses adminLeaderboardService (migrated)
  useLeaderboardSettings.ts   → Uses leaderboardSettingsService (migrated)
  useResultVisibility.ts      → Uses resultVisibilityService (migrated)
  useSchedule.ts              → Uses scheduleService (migrated)
  useOrganisations.ts         → Uses organisationService (migrated)
  useSuperAdmin.ts            → Uses superService (migrated)
  useFestivalSettings.ts      → **Appears unused/legacy** (plan.md says "mock settings hook")
  useNotificationsInbox.ts    → Direct Supabase (⚠️ not migrated)
  useBulkImport.ts            → Partially migrated (⚠️ some direct Supabase)
  usePageAccess.ts            → Stub: always returns isVisible=true, canEdit=true
  useAdminDashboard.ts        → Uses adminDashboardService (migrated)
  useUnitProfile.ts           → Direct Supabase (⚠️ not migrated)
  useGoBack.ts                → Navigation utility
  useProtectedRoute.ts        → Auth routing logic (uses authStore)
```

### Zustand Stores
```
authStore.ts                → Auth state: user, tenant_id, role, is_superadmin
pageManagementStore.ts      → Stub: empty syncRegistry/fetchPages
exportQueueService.ts       → Export job queue management (Zustand store + Supabase)
```

### Mixed Architecture
The codebase has a **mixed architecture**:
- **Migrated modules**: Auth, participants, festival settings, judges, schedules, leaderboard, results visibility, organisation, super admin — use the service→repository→provider→Supabase chain
- **Direct Supabase calls**: `fontService.ts`, `publicAiService.ts`, `unitProfileService.ts`, `exportQueueService.ts`, `useNotificationsInbox.ts`, `useBulkImport.ts` (partial), `NotificationContext.tsx`, some screen-level hooks, and `superService.ts` (imports `createClient` directly)

---

## 8. Provider, Repository, and Service Inventory

### Provider Interfaces

| Interface | File | Methods | Implementations |
|---|---|---|---|
| `AuthProvider` | `src/providers/auth/AuthProvider.ts` | 5 methods | `SupabaseAuthProvider` |
| `DatabaseProvider` | `src/providers/database/DatabaseProvider.ts` | ~80+ methods | `SupabaseDatabaseProvider` (1278 lines) |
| `StorageProvider` | `src/providers/storage/storageProvider.ts` | 4 methods | `R2StorageProvider`, `SupabaseStorageProvider` |

### Repository Files
| Repository | File | Provider Used |
|---|---|---|
| `festivalRepository` | `src/lib/repositories/festivalRepository.ts` | `databaseProvider` |
| `participantRepository` | `src/lib/repositories/participantRepository.ts` | `databaseProvider` |
| `judgeRepository` | `src/lib/repositories/judgeRepository.ts` | `databaseProvider` |
| `judgeTokenRepository` | `src/lib/repositories/judgeTokenRepository.ts` | `databaseProvider` |
| `leaderboardRepository` | `src/lib/repositories/leaderboardRepository.ts` | `databaseProvider` |
| `adminLeaderboardRepository` | `src/lib/repositories/adminLeaderboardRepository.ts` | `databaseProvider` |
| `leaderboardSettingsRepository` | `src/lib/repositories/leaderboardSettingsRepository.ts` | `databaseProvider` |
| `organisationRepository` | `src/lib/repositories/organisationRepository.ts` | `databaseProvider` + supabase auth |
| `scheduleRepository` | `src/lib/repositories/scheduleRepository.ts` | `databaseProvider` |
| `scoringRuleRepository` | `src/lib/repositories/scoringRuleRepository.ts` | `databaseProvider` |
| `superRepository` | `src/lib/repositories/superRepository.ts` | `databaseProvider` + supabase auth |

---

## 9. Supabase Integration Inventory

### Client Creation
- **File**: `src/core/config/supabase.ts`
- **Method**: `createClient(supabaseUrl, supabaseAnonKey)` with custom platform-aware storage (localStorage on web, AsyncStorage on native)
- **Env vars**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Direct Supabase Imports (⚠️ Not Behind Provider)

| File | Usage | Type |
|---|---|---|
| `src/core/config/supabase.ts` | Client creation | Configuration |
| `src/providers/auth/SupabaseAuthProvider.ts` | Auth operations | Auth provider |
| `src/providers/database/SupabaseDatabaseProvider.ts` | All DB operations | Database provider |
| `src/providers/storage/r2StorageProvider.ts` | Edge Function invoke | Storage provider |
| `src/providers/storage/supabaseStorageProvider.ts` | Storage operations | Storage provider |
| `src/core/contexts/NotificationContext.tsx` | Realtime channel, notification_logs query, user_notification_tokens upsert | Direct ⚠️ |
| `src/services/fontService.ts` | file_metadata query, delete | Direct ⚠️ |
| `src/services/publicAiService.ts` | vw_public_live_status, vw_public_leaderboard, vw_public_results, vw_public_schedule, vw_public_participants queries | Direct ⚠️ |
| `src/services/unitProfileService.ts` | RPC `get_public_unit_profile` | Direct ⚠️ |
| `src/services/exportQueueService.ts` | export_jobs, generated_assets queries | Direct ⚠️ |
| `src/services/superService.ts` | `createClient` import for isolated sign-up | Direct ⚠️ |
| `src/core/hooks/useNotificationsInbox.ts` | (not read but likely direct) | Direct ⚠️ |
| `src/core/hooks/useUnitProfile.ts` | (not read but likely direct) | Direct ⚠️ |

### Tables Referenced (via provider + direct)
`festival_calendar`, `points_config`, `items`, `participants`, `registrations`, `organisations`, `tenants`, `profiles`, `judges`, `schedules`, `venues`, `mark_entries`, `results`, `judge_tokens`, `festival_leaderboard_settings`, `poster_templates`, `generated_posters`, `generated_assets`, `file_metadata`, `scoring_rules`, `scoring_criteria`, `export_jobs`, `notification_logs`, `notifications`, `user_notification_tokens`, `participant_unit_audit_logs`, `participant_unit_batches`, `system_events`, `import_sessions`, `system_api_keys`

### RPC Functions Referenced
`lookup_email_by_username`, `get_public_candidate_profile`, `get_visible_organisations`, `get_admin_dashboard_stats`, `revoke_tenant_access`, `setup_tenant_records`, `get_public_leaderboard`, `get_admin_leaderboard`, `get_public_published_results`, `get_public_leaderboard_settings`, `get_admin_published_results`, `generate_judge_token`, `validate_judge_token`, `get_judge_registrations`, `get_judge_submission_summary`, `get_schedule_readiness`, `log_judge_activity`, `get_festival_results`, `preview_bulk_unit_assignment`, `execute_bulk_unit_assignment`, `rollback_unit_assignment`, `execute_junior_import_chunk`, `execute_senior_import_chunk`, `execute_upper_primary_import_chunk`, `execute_lp_import_chunk`, `execute_hs_import_chunk`, `execute_hss_import_chunk`, `execute_general_import_chunk`, `execute_schedule_import_chunk`, `get_public_unit_profile`

### Database Views Referenced (via publicAiService)
`vw_public_live_status`, `vw_public_leaderboard`, `vw_public_results`, `vw_public_schedule`, `vw_public_participants`

### Realtime Channels
- `src/core/contexts/NotificationContext.tsx` — Channel `public:notification_logs`, event `INSERT`, filter `user_id=eq.{userId}`

---

## 10. Cloudflare R2 Inventory

### Configuration
- **Client**: `supabase/functions/_shared/r2Client.ts` — S3Client with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- **Edge Function**: `supabase/functions/r2-presign/index.ts` — Presigned URL generation for upload/download/delete/verify
- **Frontend provider**: `src/providers/storage/r2StorageProvider.ts`

### Environment Variables
- `R2_ACCOUNT_ID` — Edge Function only
- `R2_ACCESS_KEY_ID` — Edge Function only
- `R2_SECRET_ACCESS_KEY` — Edge Function only
- `R2_BUCKET` — Edge Function (default: `'sahi-assets'`)
- `R2_PUBLIC_DOMAIN` — Edge Function + frontend (`EXPO_PUBLIC_R2_PUB_DOMAIN`)
- `EXPO_PUBLIC_R2_BUCKET` — Frontend (default: `'sahi-assets'`)
- `EXPO_PUBLIC_R2_PUB_DOMAIN` — Frontend

### Upload Flow
1. Frontend calls `R2StorageProvider.upload()` → invokes `r2-presign` Edge Function with `operation: 'upload'`
2. Edge Function returns presigned PUT URL (120s expiry)
3. Frontend PUTs file directly to R2 via XHR (with progress)
4. Frontend verifies upload via `r2-presign` with `operation: 'verify'`
5. Frontend saves metadata to `file_metadata` table via `storageProvider.saveMetadata()`

### Object Key Structure
- Profiles: `festivals/{festivalId}/profiles/{participantId}/{timestamp}-{random}.{ext}`
- Certificates: `festivals/{festivalId}/certificates/{timestamp}-{random}.pdf`
- Exports: `festivals/{festivalId}/exports/{timestamp}-{random}.{ext}`
- Posters: `festivals/{festivalId}/posters/{timestamp}-{random}.png`
- Generated assets: `festivals/{festivalId}/posters/generated_{timestamp}-{random}.jpg`
- Templates: `templates/{type}/{timestamp}-{random}.{ext}`
- Fonts: `tenants/{tenantId}/fonts/{...}` or `festivals/{festivalId}/fonts/{...}`
- Import history: `import-history/import{type}_{festivalId}_{timestamp}.json`

### Allowed Object Key Patterns (Edge Function validation)
- `templates/[a-zA-Z0-9-]+/[a-zA-Z0-9._-]+`
- `generated-posters/[a-zA-Z0-9._-]+`
- `festivals/[a-zA-Z0-9-]+/(profiles/[a-zA-Z0-9-]+/|certificates/|exports/|results/|backups/|posters/|logos/)[a-zA-Z0-9._-]+`

### Fallback to Supabase Storage
- Configured via `EXPO_PUBLIC_STORAGE_PROVIDER` env var (default: `'r2'`)
- `src/providers/storage/index.ts` selects provider at module load time
- `SupabaseStorageProvider` uses `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET` (default: `'sahi-assets'`)

### CORS
- `cloudflare-r2-cors.example.json` provides example CORS config for localhost + production

---

## 11. Authentication Inventory

### Flow
```
Login Screen ((auth)/login.tsx)
  → authService.login(identifier, password)
    → authProvider.lookupEmailByUsername(username) [RPC: lookup_email_by_username]
    → authProvider.signInWithPassword(email, password) [Supabase Auth]
    → authProvider.getProfile(userId) [profiles table: role, tenant_id, is_superadmin]
    → Returns { user, tenant_id, role, is_superadmin }
  → authStore.setUser(user, tenant_id, role, is_superadmin)

Root Layout (_layout.tsx)
  → useEffect: checkSession()
    → authService.getCurrentSession()
      → authProvider.getSession()
      → authProvider.getProfile(userId)
      → Returns session or null
    → authStore initialized

useProtectedRoute (core/hooks/useProtectedRoute.ts)
  → Reads user, role, is_superadmin, initialized from authStore
  → Routes to appropriate group based on role
```

### Session Persistence
- Supabase Auth with `persistSession: true`
- Web: `window.localStorage`
- Native: `AsyncStorage`
- `autoRefreshToken: true`

### Role-Based Access
- **superadmin**: `(super)` routes only
- **admin**: `(admin)` routes, can preview `judge/`
- **judge**: `judge/` routes only
- **volunteer/participant**: `(public)` routes only
- **Unauthenticated**: `(public)`, `judge/`, `candidate/`, `stage-management/`, `unit-profile/`

### Dev Mode
- `src/core/config/dev_config.ts`: `isDevMode: false` (when true, bypasses auth with hardcoded tenant/role)

---

## 12. Database and Migration Inventory

### Migration Folder
`supabase/migrations/` — 76 files, numbered 001-076

### Migration Inventory (in order)

| # | Filename | Purpose |
|---|---|---|
| 001 | `001_initial_schema.sql` | Initial schema: participants, items, registrations, organisations, tenants |
| 002 | `002_auth_profiles.sql` | Auth profiles table, RLS |
| 003 | `003_add_participant_fields.sql` | Additional participant fields |
| 004 | `004_phase5_participant_management.sql` | Participant management features |
| 005 | `005_category_age_logic.sql` | Category age-based logic |
| 006 | `006_fix_category_trigger.sql` | Fix category trigger |
| 007 | `007_flexible_hierarchy.sql` | Flexible org hierarchy |
| 008 | `008_superadmin_setup.sql` | Superadmin setup functions |
| 009 | `009_tenant_management_funcs.sql` | Tenant management RPCs |
| 010 | `010_tenant_revocation_func.sql` | Tenant access revocation |
| 011 | `011_multi_tenant_rls.sql` | Multi-tenant RLS policies |
| 012 | `012_cleanup_old_policies.sql` | Cleanup old RLS policies |
| 013 | `013_hierarchical_orgs.sql` | Hierarchical organisation support |
| 014 | `014_fix_org_rls.sql` | Fix organisation RLS |
| 015 | `015_add_rejection_reason.sql` | Rejection reason field |
| 016 | `016_add_audit_fields.sql` | Audit fields (created_at, updated_at) |
| 017 | `017_fix_items_upsert.sql` | Fix items upsert behavior |
| 018a | `018_phase5_judges_marks_results.sql` | **Phase 5**: Judges, marks, results tables |
| 018b | `018_results_policies.sql` | **DUPLICATE NUMBER**: Results RLS policies |
| 019 | `019_judge_tokens.sql` | Judge token system |
| 020 | `020_complete_judge_system.sql` | Complete judge system |
| 021 | `021_generate_judge_token_rpc.sql` | Generate judge token RPC |
| 022a | `022_scoring_rules.sql` | **DUPLICATE NUMBER**: Scoring rules tables + seed data |
| 022b | `022_validate_judge_token_rpc.sql` | **DUPLICATE NUMBER**: Validate judge token RPC |
| 023 | `023_expanded_points_config.sql` | Expanded points config (individual/group) |
| 024 | `024_public_leaderboard_rpc.sql` | Public leaderboard RPC |
| 025 | `025_r2_storage_metadata.sql` | File metadata table for R2 |
| 026 | `026_judge_count_extension.sql` | Judge count extension |
| 027 | `027_judge_portal_rls_bypass.sql` | Judge portal RLS bypass |
| 028 | `028_hybrid_participant_management.sql` | Hybrid participant management |
| 029 | `029_fix_judge_portal_hybrid.sql` | Fix judge portal hybrid |
| 030 | `030_leaderboard_settings.sql` | Leaderboard settings table |
| 031 | `031_enforce_leaderboard_visibility.sql` | Leaderboard visibility enforcement |
| 032 | `032_generated_posters.sql` | Generated posters table |
| 033 | `033_result_visibility.sql` | Result visibility workflow |
| 034 | `034_combined_run.sql` | Combined migration run |
| 035 | `035_leaderboard_dedup.sql` | Leaderboard deduplication |
| 036 | `036_fix_published_status_backfill.sql` | Published status backfill |
| 037 | `037_get_festival_results_hierarchy.sql` | Festival results hierarchy RPC |
| 038 | `038_complete_leaderboard_fix.sql` | Complete leaderboard fix |
| 039 | `039_public_leaderboard_edge_cases.sql` | Public leaderboard edge cases |
| 040 | `040_backfill_published_at.sql` | Backfill published_at timestamps |
| 041 | `041_emergency_republish.sql` | Emergency republish results |
| 042 | `042_public_published_results.sql` | Public published results RPC |
| 043 | `043_public_individual_rankings_visibility.sql` | Individual rankings visibility |
| 044 | `044_leaderboard_settings_admin_policy.sql` | Leaderboard settings admin policy |
| 045 | `045_result_workflow_public_visibility_split.sql` | Result workflow public visibility split |
| 046 | `046_backfill_public_visible_for_public_festivals.sql` | Backfill public_visible |
| 047 | `047_admin_leaderboard_internal_results.sql` | Admin leaderboard internal results |
| 048 | `048_admin_festival_results_internal_published.sql` | Admin festival results internal published |
| 049 | `049_candidate_profiles.sql` | Candidate profiles table |
| 050 | `050_poster_studio.sql` | Poster studio tables |
| 051 | `051_sahityotsav_2026_event_names.sql` | Sahityotsav 2026 event names seed |
| 052 | `052_public_result_no.sql` | Public result numbering |
| 053 | `053_media_center_assets.sql` | Media center assets |
| 054 | `054_generated_assets_event_name.sql` | Generated assets event name |
| 055 | `055_participant_unit_audit_logs.sql` | Participant unit audit logs |
| 056 | `056_filter_rejected_registrations.sql` | Filter rejected registrations |
| 057 | `057_junior_dataset_import.sql` | Junior dataset import RPC |
| 058 | `058_senior_dataset_import.sql` | Senior dataset import RPC |
| 059 | `059_schedule_import_unique_slot.sql` | Schedule import unique slot |
| 060 | `060_execute_schedule_import.sql` | Execute schedule import RPC |
| 061 | `061_production_safety_patch.sql` | Production safety patch |
| 062 | `062_production_audit_views.sql` | Production audit views |
| 063 | *(no file — root `063_official_participant_bracket.sql` exists outside migrations)* | Gap |
| 064 | `064_fix_public_leaderboard_visibility.sql` | Fix public leaderboard visibility |
| 065 | `065_public_items_policy.sql` | Public items RLS policy |
| 066 | `066_public_ai_views.sql` | Public AI views (5 views) |
| 067 | `067_public_registrations_policy.sql` | Public registrations policy |
| 068 | `068_add_team_point_status.sql` | Team point status field |
| 069 | `069_upper_primary_dataset_import.sql` | Upper primary import RPC |
| 070 | `070_multi_category_dataset_import.sql` | Multi-category import RPC |
| 071 | `071_general_category_import.sql` | General category import RPC |
| 072 | `072_remove_participants_name_org_constraint.sql` | Remove name-org constraint |
| 073 | `073_public_unit_profile.sql` | Public unit profile RPC |
| 074 | `074_communication_center.sql` | Communication center (notifications tables) |
| 075 | `075_add_scoring_rules_guidelines.sql` | Scoring rules guidelines field |
| 076 | `076_seed_scoring_rules.sql` | Seed scoring rules data |

### Migration Anomalies
- **Duplicate numbers**: `018` (two files), `022` (two files)
- **Missing number**: `063` (root file `063_official_participant_bracket.sql` exists outside migration folder)
- **Emergency/repair migrations**: `040` (backfill), `041` (emergency republish), `046` (backfill public_visible) — production hotfixes
- **High volume of fix/repair migrations**: 027-029, 035-041, 064 — indicates iterative debugging

### Root-Level SQL Files (20+)
These are test/repair/seed scripts outside the migration system:

| File | Purpose | Risk |
|---|---|---|
| `clear_all_test_data.sql` | Delete all test data | Destructive |
| `clear_test_data.sql` | Clear test data | Destructive |
| `insert_test_data.sql` | Insert test data | Data modification |
| `insert_shibili.sql` | Insert specific test user | Data modification |
| `fix_rls.sql` | Fix RLS policies | Schema modification |
| `fix_notifs.sql` | Fix notifications | Data modification |
| `restore_schedules.sql` | Restore schedules | Data modification |
| `create_system_api_keys.sql` | Create API keys | Data modification |
| `add_code_letter_lock.sql` | Add code letter lock | Schema modification |
| `add_general_category.sql` | Add general category | Data modification |
| `063_official_participant_bracket.sql` | Participant bracket (misplaced) | Should be in migrations |

---

## 13. Domain Entity Inventory

| Entity | DB Table | TypeScript Type | Repository | Primary Screens | Has tenant_id | Has festival_id | Has organisation_id |
|---|---|---|---|---|---|---|---|
| Tenant | `tenants` | `Tenant` | `superRepository` | `(super)/tenants/` | N/A (is the tenant) | — | — |
| User/Profile | `profiles` | `AuthProfile` | via `authProvider` | Login, auth | Yes | — | — |
| Organisation | `organisations` | — | `organisationRepository` | `(admin)/organisations/`, `(super)/organisations/` | Yes | — | Yes (self-referencing parent_id) |
| Festival | `festival_calendar` | `FestivalCalendarRecord` | `festivalRepository` | `(admin)/settings/calendar` | Yes | N/A (is the festival) | — |
| Points Config | `points_config` | `PointsConfigRecord` | `festivalRepository` | `(admin)/settings/points` | Yes | Yes | — |
| Item | `items` | `Item` | `festivalRepository` | `(admin)/settings/items` | Yes | Yes | — |
| Participant | `participants` | `Participant` | `participantRepository` | `(admin)/participants/` | Yes | Yes | Yes |
| Registration | `registrations` | `Registration` | `participantRepository` | Via participant detail | Yes | Yes | Yes |
| Venue | `venues` | — | `scheduleRepository` | `(admin)/schedule/venues` | Yes | — | — |
| Schedule | `schedules` | — | `scheduleRepository` | `(admin)/schedule/` | Yes | — | — |
| Judge | `judges` | — | `judgeRepository` | `(admin)/judges/` | Yes | Yes | — |
| Judge Token | `judge_tokens` | — | `judgeTokenRepository` | `(admin)/schedule/[id]/` | Yes | — | — |
| Mark Entry | `mark_entries` | — | `judgeRepository` | `judge/marks`, `admin/schedule/[id]/marks` | Yes | — | — |
| Result | `results` | — | `judgeRepository` | `admin/schedule/[id]/results` | Yes | Yes | Yes |
| Scoring Rules | `scoring_rules` + `scoring_criteria` | `ItemRule` | `scoringRuleRepository` | `admin/settings/scoring-rules/` | Yes (nullable for defaults) | — | — |
| Leaderboard Settings | `festival_leaderboard_settings` | `LeaderboardSettings` | `leaderboardSettingsRepository` | `admin/settings/leaderboard/` | Yes | Yes | — |
| Poster Template | `poster_templates` | `PosterTemplate` | `leaderboardSettingsRepository` | `admin/settings/leaderboard/poster-studio` | Yes | Yes | — |
| Generated Poster | `generated_posters` | `GeneratedPoster` | `leaderboardSettingsRepository` | `admin/settings/leaderboard/media-center` | Yes | Yes | — |
| Generated Asset | `generated_assets` | — | via `exportQueueService` | `BackgroundExportEngine` | Yes | Yes | — |
| File Metadata | `file_metadata` | `FileMetadata` | via `storageProvider` | `admin/settings/leaderboard/media-center` | Yes | Yes | — |
| Export Job | `export_jobs` | `ExportJob` | via `exportQueueService` | Background processing | Yes | Yes | — |
| Notification | `notifications` | — | via Edge Function | `admin/communication/` | Yes | — | — |
| Notification Log | `notification_logs` | — | via `NotificationContext` | Notification inbox | — | — | — |
| User Notification Token | `user_notification_tokens` | — | via `NotificationContext` | Push token management | — | — | — |
| Participant Unit Batch | `participant_unit_batches` | — | `participantRepository` | `admin/participants/manage-units` | Yes | — | — |
| Participant Unit Audit Log | `participant_unit_audit_logs` | — | `participantRepository` | `admin/participants/manage-units` | — | — | — |
| System Event | `system_events` | — | `participantRepository` | Audit logging | Yes | — | — |
| Import Session | `import_sessions` | — | `participantRepository` | Import screens | Yes | Yes | — |
| Candidate Profile | `candidate_profiles` | — | via RPC | `candidate/[slug]` | — | — | — |
| System API Keys | `system_api_keys` | — | unclear | `admin/settings/api-keys` | — | — | — |

---

## 14. Environment Variable Inventory

### Supabase
| Variable | Scope | Used In | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Frontend | `src/core/config/supabase.ts`, `superService.ts` | Required |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Frontend | `src/core/config/supabase.ts`, `superService.ts` | Required |

### R2 (Cloudflare)
| Variable | Scope | Used In | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_R2_BUCKET` | Frontend | `r2StorageProvider.ts`, `uploadService.ts` | Default: `'sahi-assets'` |
| `EXPO_PUBLIC_R2_PUB_DOMAIN` | Frontend | `r2StorageProvider.ts` | Public CDN domain |
| `R2_ACCOUNT_ID` | Edge Function | `r2-presign/index.ts`, `_shared/r2Client.ts` | Secret — server only |
| `R2_ACCESS_KEY_ID` | Edge Function | `r2-presign/index.ts`, `_shared/r2Client.ts` | Secret — server only |
| `R2_SECRET_ACCESS_KEY` | Edge Function | `r2-presign/index.ts`, `_shared/r2Client.ts` | Secret — server only |
| `R2_BUCKET` | Edge Function | `r2-presign/index.ts`, `_shared/r2Client.ts` | Default: `'sahi-assets'` |
| `R2_PUBLIC_DOMAIN` | Edge Function | `r2-presign/index.ts` | Public CDN domain |

### Storage Provider
| Variable | Scope | Used In | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_STORAGE_PROVIDER` | Frontend | `providers/storage/index.ts` | `'r2'` (default) or `'supabase'` |
| `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET` | Frontend | `supabaseStorageProvider.ts` | Default: `'sahi-assets'` |

### Development
| Variable | Scope | Used In | Notes |
|---|---|---|---|
| `isDevMode` (hardcoded) | Frontend | `dev_config.ts` | Boolean, not env var |
| `tenant_id` (hardcoded) | Frontend | `dev_config.ts` | For dev testing |

### Notes
- No `EXPO_PUBLIC_` prefix for R2 secrets (correct — server-only via Edge Functions)
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are browser-exposed (expected for Supabase anon key)
- No conflicting environment variable names detected
- `EXPO_PUBLIC_R2_BUCKET` and `R2_BUCKET` are separate (frontend vs Edge Function) — this is correct but could cause confusion if they differ

---

## 15. Edge Function and Realtime Inventory

### Edge Functions

| Function | File | Purpose | Auth |
|---|---|---|---|
| `r2-presign` | `supabase/functions/r2-presign/index.ts` | R2 presigned URL generation (upload/download/delete/verify) | User auth required (Supabase Auth) |
| `send-notification` | `supabase/functions/send-notification/index.ts` | Push notification delivery via Expo Push API | User auth required (admin/superadmin role check) |
| `notification-cron` | `supabase/functions/notification-cron/index.ts` | Schedule reminder cron (upcoming events in 10 min) | Uses service role key (no user auth) |
| `_shared/r2Client` | `supabase/functions/_shared/r2Client.ts` | Shared S3 client for R2 | N/A (shared module) |

### Realtime
- **Channel**: `public:notification_logs` in `NotificationContext.tsx`
- **Event**: `INSERT` on `notification_logs` table
- **Filter**: `user_id=eq.{userId}`
- **Purpose**: Real-time toast notifications for logged-in users

---

## 16. Documentation and Planning File Inventory

| File | Lines | Purpose | Status |
|---|---|---|---|
| `plan.md` | 817 | Master agent plan: project context, architecture targets, phases, session log | **Mostly current** — last entry 2026-06-11. References phases 0-8. Currently in Phase 7. |
| `project.md` | 195 | Architecture overview: stack, folder structure, backend direction, multi-tenant hierarchy | **Current** — aligns with code |
| `rule.md` | 270 | Business rules: calendar, categories, registration, schedule, judges, results, certificates, transfer, storage | **Current** — comprehensive rule source |
| `README.md` | 53 | Default Expo README + minimal project note | **Outdated** — generic Expo boilerplate |
| `unit_links.md` | 1 | Empty array `[]` | **Placeholder** — unused |

### Documentation Conflicts
1. `plan.md` references future FastAPI backend; `project.md` references NestJS as future backend API. These are the same architectural direction with different framework names — **minor documentation conflict**.
2. `plan.md` references `(judge)` route group; actual code uses `judge/` (not in parentheses). The plan's route notation is slightly different from actual implementation.
3. `plan.md` states "Some settings still use mock data" — this appears outdated; settings are now backed by database.
4. `README.md` is generic Expo boilerplate and does not reflect the project.

---

## 17. Test and Script Inventory

### Root-Level Test Scripts (10+)
| File | Purpose | Reusable? |
|---|---|---|
| `test-supabase.js` | Test Supabase connection | Diagnostic |
| `test_auth_rpc.js` | Test auth RPC functions | Diagnostic |
| `test_orgs.js` | Test organisation queries | Diagnostic |
| `test_participants_query.js` | Test participant queries | Diagnostic |
| `test_public_lb.js` | Test public leaderboard | Diagnostic |
| `test_query_without_tenant.js` | Test queries without tenant | Diagnostic |
| `test_results.js` | Test results queries | Diagnostic |
| `test_storage.js` | Test storage operations | Diagnostic |
| `test_user_profiles.js` | Test user profiles | Diagnostic |
| `check-db.js` | Check database state | Diagnostic |
| `check_profile.js` | Check profile state | Diagnostic |
| `deep_investigate.js` | Deep investigation | Diagnostic |
| `diagnosis_v2.js` | Diagnosis v2 | Diagnostic |
| `full_diagnosis.js` | Full diagnosis | Diagnostic |
| `fix_mappings.js` | Fix mappings | Repair |
| `generator.js` | Data generator | Utility |

### Scripts Directory (8 files)
| File | Purpose | Reusable? |
|---|---|---|
| `scripts/generate_recovery_sql.js` | Generate recovery SQL | Utility |
| `scripts/generate_seed.js` | Generate seed data | Utility |
| `scripts/query_db.js` | Query database | Diagnostic |
| `scripts/recover_schedules.js` | Recover schedule data | Repair |
| `scripts/remove-dark.js` | Remove dark mode styles | UI fix |
| `scripts/test_candidate_profile.js` | Test candidate profile | Diagnostic |
| `scripts/test_direct.js` | Direct test | Diagnostic |
| `scripts/test_public_service.js` | Test public service | Diagnostic |

### Scratch Directory (2 files)
| File | Purpose |
|---|---|
| `scratch/inspect_db.js` | Database inspection |
| `scratch/list_models.js` | List models |

### No Automated Test Suite
There are **no unit tests, integration tests, or E2E tests** in the repository. All "test" files are manual diagnostic scripts. No `__tests__/` directories, no `.test.ts` or `.spec.ts` files, no testing framework configured.

---

## 18. Duplicate, Legacy, and Experimental File Inventory

### Confirmed Duplicates
| Finding | Evidence |
|---|---|
| Migration `018` exists twice | `018_phase5_judges_marks_results.sql` and `018_results_policies.sql` |
| Migration `022` exists twice | `022_scoring_rules.sql` and `022_validate_judge_token_rpc.sql` |
| `resultCalculator.ts` and `pointCalculator.ts` overlap | Both calculate grades, but with different thresholds (75% vs 70% for A grade). **Two grade calculation implementations** |
| `registrationValidator.ts` and `registrationRules.ts` overlap | Both validate registration rules. `registrationValidator.ts` uses class pattern; `registrationRules.ts` uses rule engine pattern. **Two parallel implementations** |

### Likely Legacy / Possible Legacy
| Finding | Evidence | Status |
|---|---|---|
| `useFestivalSettings.ts` | plan.md says "mock settings hook" | **Likely legacy** — `useFestival.ts` is the active replacement |
| `usePageAccess.ts` | Returns hardcoded `{ isVisible: true, canEdit: true }` | **Stub/placeholder** — not functional |
| `pageManagementStore.ts` | Empty stub with no-op functions | **Stub/placeholder** — not functional |
| `@react-navigation/bottom-tabs` dependency | No bottom tabs visible in any layout | **Possible unused** |
| `@react-navigation/elements` dependency | No direct imports found | **Possible unused** |
| `dexie` dependency | No Dexie imports found in source | **Possible unused** |
| `openai` dependency | No OpenAI imports found in services (only Gemini) | **Possible unused/legacy** |
| `zod` dependency | No Zod imports found in source | **Possible unused** |
| Root-level test JS files (10+) | One-off diagnostic scripts | **Temporary/one-off** |
| `scratch/` directory | Diagnostic scripts | **Temporary** |
| `importjson/` directory | 8 JSON data import files | **Data files** — should not be in repo long-term |
| `_Import_Report_/` directory | 11 PDF/JSON import reports | **Generated output** — should not be in repo |
| `import_sn.json`, `importjn.json` | Root-level import data files | **Data files** — should not be in repo |
| `unit_links.md` | Empty `[]` | **Placeholder** — unused |
| `README.md` | Default Expo boilerplate | **Outdated** — not project-specific |

### Deprecated / Commented-Out Code
| Finding | Evidence | Status |
|---|---|---|
| `participantService.updateCodeLetter()` | Throws `'Not implemented here yet'` | **Incomplete implementation** |
| `participantService.generateChestNumber()` | Simple sequential generation, no DB audit trail | **Simplified** |

---

## 19. Confirmed Documentation Conflicts

| # | Conflict | Details |
|---|---|---|
| 1 | Future backend framework | `plan.md` says FastAPI; `project.md` says NestJS. Both describe the same gradual migration approach. |
| 2 | Route group notation | `plan.md` references `(judge)` route group; actual code uses `judge/` (no parentheses). |
| 3 | Mock data status | `plan.md` says "Some settings still use mock data" — code shows settings are fully database-backed. |
| 4 | Migration numbers | `plan.md` references migrations `016_2026_festival_settings.sql`, `017_rule_engine_tables.sql`, etc. — these don't exist; actual migrations are numbered sequentially. |

---

## 20. Areas Requiring Deeper Phase 2 Inspection

1. **Database schema completeness**: Read all 76 migration files to understand the full schema (tables, columns, constraints, indexes, triggers, functions, views, RLS policies)
2. **RLS policy audit**: Verify all tables have appropriate RLS policies for all roles (superadmin, admin, judge, public)
3. **Duplicate grade calculation**: `resultCalculator.ts` uses 75%/60%/50% thresholds; `pointCalculator.ts` uses 70%/60%/50%. Which is correct?
4. **Duplicate registration validation**: `registrationValidator.ts` vs `registrationRules.ts` — which is active and complete?
5. **Unused dependencies**: Confirm whether `dexie`, `openai`, `zod`, `@react-navigation/bottom-tabs` are truly unused
6. **Direct Supabase call inventory**: Complete list of all files importing `supabase` directly (beyond what was found)
7. **Database type generation**: Check if `supabase gen types` is used or if types are manual
8. **Edge Function deployment**: Verify `supabase/config.toml` and deployment status
9. **Missing features from plan**: Certificates, transfer system, queue jobs — confirm zero code exists
10. **Security review**: Verify no service-role keys leak to frontend, no RLS bypass in app code (except where intentional for judge portal)
11. **Grade calculation inconsistency**: `pointCalculator.ts` line 5: `if (pct >= 70) return 'A'` vs `resultCalculator.ts` line 23: `if (score >= 75) return 'A'`. These produce different results.
12. **`superService.ts` imports `createClient`** from `@supabase/supabase-js` directly — creates isolated auth session for tenant setup
13. **Root-level SQL scripts**: Many are destructive (DELETE FROM). Confirm none are accidentally run against production.

---

## 21. Phase 1 Evidence Index

### Key Files Read
| Category | Files |
|---|---|
| Config | `package.json`, `tsconfig.json`, `app.json`, `vercel.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `eslint.config.js`, `cloudflare-r2-cors.example.json` |
| Entry/Layout | `src/app/_layout.tsx`, all route group layouts |
| Providers | All 10 files in `src/providers/` |
| Services | All 25 files in `src/services/` (including `storage/` subdirectory) |
| Hooks | All 21 files in `src/core/hooks/` + `src/hooks/` |
| Core | All files in `src/core/config/`, `src/core/contexts/`, `src/core/store/`, `src/core/rules/`, `src/core/utils/` |
| Lib | All 13 files in `src/lib/` |
| Types | `src/types/index.ts` |
| Edge Functions | All 4 files in `supabase/functions/` |
| Documentation | `plan.md`, `project.md`, `rule.md`, `README.md`, `unit_links.md` |
| Migration filenames | All 76 filenames in `supabase/migrations/` |
| Root SQL | All 20+ `.sql` filenames |
| Root JS | All 10+ `.js` filenames |

### Files NOT Read (would require Phase 2)
- Individual route screen files (only directory listings and layout files read)
- Individual component files (only directory listings read)
- Individual repository files (only patterns understood from provider usage)
- Migration file contents (only filenames inspected)
- `src/data/scoring_rules.json`
- `importjson/*.json` data files

---

*End of Phase 1 Architecture Audit*
