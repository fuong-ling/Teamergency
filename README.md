# TEAMERGENCY

Teamergency = Team + Emergency.

Tagline: "Find your team before it becomes an emergency."

TEAMERGENCY is an MVP for students who need to find teammates for a group assignment and discover other students for future collaboration.

## MVP Flow

1. Homepage
2. Create User Profile
3. Profile Saved
4. Create Teammate Search Request
5. Match Results
6. View Teammate Profile
7. My Current Request
8. Team Found Confirmation

Extended flow:

```text
Find Matches
  -> View Profile
  -> Connect
  -> Other user accepts / declines
  -> Connected
  -> Chat
  -> Add to My Team
  -> Mark Team Found
```

There is no SSO, login UI, AI scoring, ratings, reviews, personal GPA profile field, hobbies, notification system, voice call, or video call in this MVP. Public testing uses Supabase Anonymous Auth silently in the browser for basic ownership checks.

## Why Profiles and Requests Are Separate

`profiles` stores long-term student information:

- Full name
- School: `SCD`, `TBS`, or `SSET`
- Major
- Skills and technologies
- Contact method and contact value
- Short bio
- Public visibility consent

`team_requests` stores one current teammate search:

- Course name and course code
- School
- Major
- Class / session
- Skills needed
- Number of teammates needed
- Work style
- Requirements
- Optional portfolio/reference upload for request expectations
- Status

One profile can have many team requests over time. A student should not need to recreate their profile every time they need teammates for a different course.

## Database Relationship

`team_requests.profile_id` references `profiles.id`.

Example:

```text
Katie Profile
  -> Request 1: Digital Media Studio 4
  -> Request 2: Digital Storytelling
  -> Request 3: Another course
```

Marking one request as `found` does not make the profile unavailable.

`connections` stores Connect requests between profiles:

- sender profile
- receiver profile
- sender team request, nullable when sent from Discover
- intro message
- status: `pending`, `accepted`, `declined`, or `cancelled`

`messages` stores chat messages for accepted connections only.

`team_members` records the lightweight "Add to My Team" action. It does not create complex team management.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Run `supabase/seed.sql`.
5. Copy your project URL and anon public key into `.env`.

Create `.env` from `.env.example`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not put a `service_role` key in the frontend.

## SQL Files

- `supabase/schema.sql` creates tables, constraints, indexes, RLS policies, and the `mark_team_request_found` database function.
- `supabase/connect_chat.sql` adds the Connect, Messages, and Add to My Team extension to an existing MVP database.
- `supabase/profile_request_update.sql` adds Edit Profile support and the newer Team Search Request fields.
- `supabase/discover_request_update.sql` adds Discover support, course/class request metadata, and connection intro messages.
- `supabase/demo_flow.sql` enables simulated demo acceptance and scripted demo chat replies.
- `supabase/course_portfolio_update.sql` adds `course_name`, `course_code`, portfolio requirement fields, and the `request-portfolios` Storage bucket.
- `supabase/real_public_testing.sql` adds anonymous-auth ownership checks, safer public read functions, and real-user public testing hardening.
- `supabase/seed.sql` creates 15 fictional demo profiles and 15 active demo team requests.

Demo profiles use:

- `is_demo = true`
- `contact_value = null`
- request `status = looking`
- visible `DEMO` badge in the UI

## Demo Match Flow

The prototype includes a simulated demo flow:

```text
Create Profile
  -> Create Team Request
  -> Find Matching Candidate
  -> Send Connect Request
  -> Simulate Demo Acceptance
  -> It's a Match
  -> Start Chat
  -> Scripted demo replies
```

Demo profiles are clearly marked and are not real students. Demo matches should be treated as `demo_match`, not `real_match`, if analytics are added later. The app currently does not track analytics.

Run this migration after the Connect/Discover migrations:

```text
supabase/demo_flow.sql
```

To refresh demo seed data, run `supabase/seed.sql`. This deletes and recreates demo profiles only; it does not delete real profiles.

## Row Level Security

This MVP is designed for public testing without login UI. It uses Supabase Anonymous Auth so each browser gets an authenticated anonymous user ID.

Allowed:

- Anonymous-authenticated users can create real profiles.
- Anonymous-authenticated users can create team requests for profiles they own.
- Public profile/request browsing goes through limited database functions.
- `edit_token` is not returned by public request browsing functions.
- Contact value is only returned for the owner or accepted connections.
- Users cannot directly update `team_requests`.
- Users cannot directly read, insert, update, or delete `connections`, `messages`, or `team_members`.
- Connection and chat actions go through database functions.

To mark a request as found, the app calls:

```sql
public.mark_team_request_found(request_id, request_edit_token)
```

The function only updates the row when both the request ID and edit token match.

Connect/chat functions include:

- `send_connection_request`
- `respond_connection_request`
- `cancel_connection_request`
- `list_connection_requests`
- `get_connection_between`
- `list_message_threads`
- `get_connection_detail`
- `list_messages`
- `send_message`
- `simulate_demo_acceptance`
- `send_demo_reply`
- `reset_demo_connection`
- `add_team_member`

These functions check profile involvement and connection status before changing data.

## Ownership Token

Because there is no login UI, the app stores the anonymous Supabase session in the browser. Each new team request still gets a random `edit_token` as a fallback for marking a request found.

The browser stores:

- `currentProfileId`
- `currentTeamRequestId`
- `currentTeamRequestEditToken`
- Supabase anonymous auth session

These values live in `localStorage` on the current device/browser.

Security limitations:

- Anonymous Auth is better than plain `currentProfileId`, but it is still device/browser-based.
- If the user clears browser storage or changes device, they may lose access to their anonymous session and profile ownership.
- Existing legacy profiles with no `owner_id` can be claimed once from the browser that already has the saved profile ID.
- Anyone with access to the same browser session can act as that user.
- Real production ownership should use Supabase Auth.
- Public profile data is visible after consent; contact value is intended to be visible only to the owner or accepted connections.

## Match Logic

Match score is rule-based and not AI-generated.

Weights:

- Same course: 30%
- Same class / session: 20%
- Same major: 10%
- Same school: 5%
- Skill compatibility: 25%
- Work style compatibility: 10%

Skill compatibility is checked two ways:

- Candidate has skills the current request needs.
- Current user has skills the candidate request needs.

The UI displays scores like:

```text
87% Match
```

This is a compatibility score, not a probability.

Availability is no longer used in the request form, match cards, teammate profile view, or match score. Existing `availability` and `preferred_active_time` columns are left in place to avoid damaging current data.

Request Results and Discover are separate:

- Find Teammates shows active `team_requests` for course/class-specific teammate search.
- Discover shows `profiles` for networking and future projects, without requiring an active team request.

## Request Data

`skills_needed` is stored as a `text[]`.

`work_styles` is stored as a `text[]`.

`requirements_data` is stored as JSONB:

```json
{
  "selected": ["Has previous project experience", "Has a portfolio"],
  "required_courses": ["Digital Media Studio 3"],
  "minimum_gpa": 3,
  "portfolio_link_required": true,
  "required_tools": ["Figma", "TouchDesigner"]
}
```

`requirements` stores the optional "Anything else?" text.

`team_requests.course_name` and `team_requests.course_code` store the selected predefined course. The legacy `course` column is still populated with the course name so older data keeps working.

`team_requests.school`, `team_requests.major`, and `team_requests.class_session` store request context. School uses the same `SCD/TBS/SSET` codes as profiles.

Portfolio/reference uploads use Supabase Storage bucket `request-portfolios`. The database stores only:

- `requires_portfolio`
- `portfolio_reference_path`
- `portfolio_reference_name`

The uploaded file is a request reference/example, not the user's personal portfolio.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Migration Plan for Existing Supabase Projects

If your Supabase database already has an older Teamergency table, do not assume the database is empty.

Option A: clean MVP reset

1. Back up existing data if needed.
2. Drop old tables that are no longer part of the MVP.
3. Run `supabase/schema.sql`.
4. Run `supabase/seed.sql`.

Option B: non-destructive rebuild

1. Keep old tables temporarily.
2. Run `supabase/schema.sql` to create the new `profiles` and `team_requests` tables.
3. Run `supabase/seed.sql` for demo browsing data.
4. Point the frontend to the new tables.
5. Delete old tables only after verifying the new MVP flow.

The current local project was empty at rebuild time, so no local implementation files were removed.

## Adding Connect and Chat to an Existing Database

If you already ran the first MVP schema, run only:

```text
supabase/connect_chat.sql
```

Do not rerun seed data unless you want to refresh demo profiles.

## Adding Edit Profile and Request Form Updates

If you already have the first MVP database, run:

```text
supabase/profile_request_update.sql
```

This migration does not drop existing request columns or data. It adds `work_styles`, `requirements_data`, and the `update_profile` function.

## Adding Discover and Course/Class Requests

Run:

```text
supabase/discover_request_update.sql
```

This migration adds request `school`, `major`, `class_session`, makes `connections.sender_team_request_id` nullable, and adds `connections.intro_message`.

## Adding Course Codes and Portfolio References

Run:

```text
supabase/course_portfolio_update.sql
```

This migration keeps the old `course` column, adds `course_name` and `course_code`, backfills known courses, and creates the `request-portfolios` Storage bucket. After `real_public_testing.sql`, uploads require the browser's Supabase anonymous-auth session and use MIME/type/extension/10 MB limits.

## Preparing Real Public MVP Testing

In Supabase, enable Anonymous Sign-ins first:

```text
Authentication -> Sign In / Providers -> Anonymous Sign-Ins -> Enable
```

Then run:

```text
supabase/real_public_testing.sql
```

This migration keeps demo data, adds `owner_id` and consent fields, tightens RLS for real ownership, and changes connection/chat functions to check `auth.uid()`.

## Deploy

For a static host such as Vercel, Netlify, or Supabase Hosting:

1. Set `VITE_SUPABASE_URL`.
2. Set `VITE_SUPABASE_ANON_KEY`.
3. Build with `npm run build`.
4. Deploy the generated `dist` folder or connect the repo with the same build command.
