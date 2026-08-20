# SAHI Fest Management App
## Developer Handover Document

Ee file puthiya developer-nte kayyil kodukkaanullathaanu.

> Full details: https://github.com/shibilikds133-spec/sahi-m-fest

---

## Enthaanu ee App?

SAHI Fest (Sahityotsav 2026) ennath oru Islamic arts & literary festival aaanu.
Ee app athinulla full management system anu — participant registration muthal result publishing vare.

---

## Tech Stack

- **Frontend:** React Native + Expo (Web + Mobile both work)
- **Backend/DB:** Supabase (PostgreSQL + Realtime + Auth)
- **Styling:** NativeWind (Tailwind for React Native)
- **Storage:** Cloudflare R2
- **State:** Zustand + React Query

---

## Setup

```bash
git clone https://github.com/shibilikds133-spec/sahi-m-fest.git
cd sahi-m-fest
npm install
# Create .env.local with Supabase URL and anon key
npm run dev
# Open http://localhost:8081
```

Supabase link:
```bash
npx supabase login
npx supabase link --project-ref szhwkngspodujiqzblab
```

---

## Cheythukkazhinja Karyangal (Completed Features)

- Multi-tenant system (each org has own festival)
- Role-based auth: Superadmin / Admin / Judge / Public / Stage Manager
- Participant import (JSON, CSV) — all categories (LP/UP/HS/HSS/JR/SR/GN)
- Schedule management with venue assignment
- Judge management with panel assignment per event
- **Judge Access Code + QR Code generation** (6-char hex code)
  - Regenerate button (red) — invalidates old code, creates new
  - Shows "Code Generated" badge if code already exists
  - Strict warning if marks already submitted for that event
- **Judge Login Approval Workflow (Realtime)**
  - Judge enters code → sends approval request
  - Admin sees pending request in real-time → approve/reject
- Mark entry system for judges
- Results publishing + public leaderboard
- Poster studio + Cloudflare R2 media
- Communication center (push notifications)
- Audit log system
- Stage management + code letter printing

---

## Cheyyendathaayullathu (Pending Work)

**High Priority:**
- QR Scanner in Judge Portal (camera auto-scan)
- Judge device auto-refresh after admin approval
- Fix pre-existing TypeScript errors in import-*.tsx files

**Medium Priority:**
- supabase db push migration conflict fix (007 onwards)
- Cloudflare R2 Edge Function deployment (Deno)
- Result PDF export completion

---

## Database Notes

- 82 migration files in `supabase/migrations/`
- Manual fixes applied directly to live DB — see `supabase_edits.md` in project root
- RLS active on all tables — always filter by `tenant_id`
- Judges do NOT use Supabase Auth — they use one-time 6-char tokens

---

## Key Files

| Feature | File |
|---|---|
| Admin Dashboard | `src/app/(admin)/index.tsx` |
| Judge Management | `src/app/(admin)/judges/index.tsx` |
| Judge Portal | `src/app/judge/index.tsx` |
| Judge Token Service | `src/services/judgeTokenService.ts` |
| DB Provider | `src/providers/database/SupabaseDatabaseProvider.ts` |
| Supabase Config | `src/core/config/supabase.ts` |

---

*Prepared on July 27, 2026 using Antigravity AI*
