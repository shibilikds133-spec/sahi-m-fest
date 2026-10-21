# Team Leader credential flow

## Current implementation

- Provisioning creates a short `tl` plus six-hex-character username and a
  cryptographically generated six-digit temporary password.
- Team Leader sign-in resolves the exact username through
  `resolve_team_leader_login_email`; the existing organization-admin username
  resolver keeps its current validation and behavior. The internal Auth email
  is not sent to the browser.
- First sign-in after provisioning requires the Team Leader to choose a
  permanent username and password. An administrator password reset preserves
  the username and requires only a new password at next sign-in.
- Team Leader credential-change flags are stored in Auth `app_metadata`.
  The migration copies legacy pending flags for Team Leader accounts and adds
  a resolver RPC that only `service_role` can execute.
- Username matching is exact. The application adds no username format or
  length rules; the existing unique index prevents duplicate usernames.

## Auth password policy

The checked-in Supabase config sets `minimum_password_length = 6` and leaves
`password_requirements` empty. The application adds no password-format or
length validation, but Supabase Auth still enforces its configured minimum.
The hosted project's Auth setting must be checked separately if it differs
from this local config.

Temporary credentials do not have a time-based expiry in this implementation.
They stop working when the password is changed or reset. A required-expiry
duration remains a business decision.

## Staging database setup

Migration: `supabase/migrations/20261021140000_team_leader_arbitrary_login_names.sql`

This migration has not been run against the hosted staging database. Review and
run it in the [staging project's Supabase SQL Editor](https://supabase.com/dashboard/project/szhwkngspodujiqzblab/sql/new).
Apply it before deploying the updated `provision-team-leader` and
`resolve-login-identifier` Edge Functions and the web application.

## Validation

- Focused ESLint and `git diff --check` pass.
- Credential helper check passed: collision retry, short username format, and
  10,000 generated six-digit passwords.
- Repository-wide TypeScript check still reports unrelated existing errors
  and Deno Edge Function imports. No errors were reported for the edited
  frontend credential files after the button styling was aligned with the
  shared `Button` component API.
- Hosted SQL execution and authenticated browser sign-in/reset flows remain
  unverified.
