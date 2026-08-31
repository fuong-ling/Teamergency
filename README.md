# TEAMERGENCY

Teamergency = Team + Emergency.

Tagline: "Find your team before it becomes an emergency."

TEAMERGENCY is an MVP for students who need to find teammates for a group assignment and discover other students for future collaboration.

## MVP Flow

1. Homepage
2. Choose role and create User Profile
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
  -> Mark Team Found
```

There is no SSO, login UI, personal GPA profile field, hobbies, push notification, voice call, or video call in this MVP. Public testing uses Supabase Anonymous Auth silently in the browser for basic ownership checks.

## MVP Roles

Profile creation starts with a role choice:

- `student`: keeps the existing Teamergency student experience for profiles, team requests, matching, Discover, Connect, chat, reviews, and marking a team as found.
- `lecturer`: opens a minimal Lecturer Dashboard experience for checking class/team-formation progress.

This is not production university authentication. It is an MVP role-based experience on top of the existing anonymous Supabase ownership system. Existing profiles without a role safely behave as `student`.

## Why Profiles and Requests Are Separate

`profiles` stores long-term student information:

- Role: `student` or `lecturer`
- Full name
- University
- School: `SCD`, `TBS`, or `SSET`
- Major
- Skills and technologies
- Contact method and contact value
- Short bio
- Available / unavailable mode
- Public visibility consent

`team_requests` stores one current teammate search:

- Optional class/cohort link from a lecturer-created class
- Course name and course code
- School
- Major
- Class / session code, for example `Session 01`
- Skills needed
- Number of teammates needed
- Work style
- Requirements
- Optional portfolio/reference upload for request expectations
- Status

One profile can have many team requests over time. A student should not need to recreate their profile every time they need teammates for a different course.

## Database Relationship

`team_requests.profile_id` references `profiles.id`.

Phase 2 adds optional class/cohort tables:

- `classes` stores a lecturer-created course cohort with university, course, session code, semester/year, lecturer name, and a join code.
- `class_members` stores which student profiles joined which class and their preferred-teammate status.
- `team_requests.class_id` optionally references `classes.id`.

When a request has `class_id`, matching is restricted to the same class. Older requests without `class_id` still match by course code/name plus session code.

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
- connection context: `team_request` or `discover`
- intro message
- status: `pending`, `accepted`, `declined`, `cancelled`, or `unmatched`

`messages` stores chat messages for accepted connections only.

`reviews` stores teammate ratings for accepted team-request connections.

`match_feedback` stores feedback about whether Teamergency recommended the right match. It is separate from teammate ratings.

`ai_match_results` can store AI-assisted match metadata for later A3 evidence.

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
- `supabase/request_management_bugfix.sql` adds edit/cancel/multiple request management, unmatch notifications, and teammate count bug fixes.
- `supabase/bidirectional_match_team_size.sql` adds total team size, bidirectional request progress, and request-aware connection counting.
- `supabase/digital_media_demo_boost.sql` refreshes demo Digital Media Studio 4 coverage.
- `supabase/a3_iteration_features.sql` adds University, Available mode, Friends context, Reviews, Match Quality Feedback, Skill Gap support data, and AI match metadata.
- `supabase/reviews_feedback_iteration.sql` separates Teammate Reviews from Match Usefulness Rating, adds 30-day review eligibility, accepted timestamps, and seeded demo reviews.
- `supabase/session_code_matching_update.sql` updates matching to compare stable session codes such as `Session 01` instead of timetable-style day/start time values.
- `supabase/class_cohort_phase2.sql` adds Class/Cohort support, lecturer-created join codes, class membership, class-aware request creation, and a light lecturer dashboard.
- `supabase/role_lecturer_access_phase2.sql` adds profile role selection, lecturer title, demo lecturer class codes, demo class memberships, and code-based Lecturer Dashboard access.
- `supabase/my_profile_role_switch_demo.sql` adds the latest My Profile mode switch, demo lecturer IDs, school/major-aware demo class lookup, and My Classes lecturer dashboard data.
- `supabase/class_based_team_status.sql` adds class-based student team status helpers for Class Detail and the Lecturer Dashboard.
- `supabase/fix_join_demo_class_ambiguous.sql` replaces the demo join function if Supabase reports `column reference "class_id" is ambiguous`.
- `supabase/fix_current_request_team_size_and_class_rpc.sql` applies the current team-size request RPCs without rerunning older connection migrations.
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

## A3 Iteration Features

Run this migration after the previous MVP migrations:

```text
supabase/a3_iteration_features.sql
```

This adds:

- `profiles.university`
- `profiles.is_available`
- `connections.connection_context`
- `reviews`
- `match_feedback`
- `ai_match_results`

Existing real profiles are backfilled to `RMIT University` and `Available`. Existing connections are backfilled as `team_request` when they have a team request ID, otherwise `discover`.

## AI Match Score

Rule-based scoring remains the fallback and baseline. AI matching is optional and runs through a Supabase Edge Function so the OpenAI API key is not exposed in the frontend.

Deploy:

```text
supabase/functions/ai-match/index.ts
```

Set Edge Function secrets in Supabase:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MATCH_MODEL=gpt-4o-mini
```

If the Edge Function is not deployed, the key is missing, the request times out, or AI returns invalid output, the app keeps using the standard rule-based match score.

## Skill Gap Analysis

Skill Coverage is shown in My Request. It is deterministic:

```text
required skills = team_request.skills_needed
team skills = current user skills + accepted teammates' skills
covered = required skills found in team skills
missing = required skills not found in team skills
```

Discover-only Friends do not count toward Skill Gap Analysis.

## Friends

Connections from Discover use `connection_context = discover`. Accepted Discover connections appear in Friends and do not affect teammate count.

Connections from Find Teammates use `connection_context = team_request`. Accepted team-request connections affect teammate count and can receive teammate reviews / match quality feedback.

## Reviews and Match Usefulness

Run this after `supabase/a3_iteration_features.sql`:

```text
supabase/reviews_feedback_iteration.sql
```

Teammate Reviews answer: "Was this person a good teammate?"

- only for accepted team-request connections
- prototype testing uses `REVIEW_WAIT_DAYS = 0` so reviews can be tested immediately after an accepted match; for official release, set it to `15` and rerun `supabase/review_wait_now_testing.sql` with `select 15`
- appears on the reviewed teammate's profile
- demo profile reviews are seeded and labeled as Demo Review

Match Usefulness Rating answers: "Was Teamergency's recommendation useful?"

- appears when a team request is complete
- stored in `match_feedback`
- does not affect the teammate's profile rating

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
- `list_friends`
- `create_review`
- `create_match_feedback`

These functions check profile involvement and connection status before changing data.

## Ownership Token

Because there is no login UI, the app stores the anonymous Supabase session in the browser. Each new team request still gets a random `edit_token` as a fallback for marking a request found.

The browser stores:

- `currentProfileId`
- `currentTeamRequestId`
- `currentTeamRequestEditToken`
- `currentClassId`, when the student joins a lecturer-created class
- Supabase anonymous auth session

These values live in `localStorage` on the current device/browser.

Security limitations:

- Anonymous Auth is better than plain `currentProfileId`, but it is still device/browser-based.
- If the user clears browser storage or changes device, they may lose access to their anonymous session and profile ownership.
- Existing legacy profiles with no `owner_id` can be claimed once from the browser that already has the saved profile ID.
- Anyone with access to the same browser session can act as that user.
- Real production ownership should use Supabase Auth.
- Public profile data is visible after consent; contact value is intended to be visible only to the owner or accepted connections.
- Reviews and match feedback are protected by RPC checks, but production should still move to stronger user accounts before high-stakes deployment.
- AI provider secrets must live in Supabase Edge Function secrets, never in frontend `.env`.

## Match Logic

Match score starts with rule-based scoring and can be enhanced by AI when the Edge Function is configured.

Weights:

- Same course: 30%
- Same class / session code: 20%
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

New team requests use compact session codes such as `Session 01`, `Session 02`, and `Session 03`. Older timetable-style values are kept in the database for backward compatibility, but the current UI should not ask students to enter class day, start time, or end time.

Phase 2 class-aware matching:

- If either request has `class_id`, both requests must share the same `class_id`.
- If neither request has `class_id`, the app falls back to same course plus same session code.
- This keeps existing real requests working while allowing lecturer class-code cohorts to become the primary matching context.

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

`team_requests.school`, `team_requests.major`, and `team_requests.class_session` store request context. `class_session` now stores compact session-code text such as `Session 01` for new requests. School uses the same `SCD/TBS/SSET` codes as profiles.

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

## Adding Class / Cohort Phase 2

Run this only after the current MVP migrations are already in place:

```text
supabase/class_cohort_phase2.sql
supabase/my_profile_role_switch_demo.sql
supabase/fix_join_demo_class_ambiguous.sql
supabase/fix_current_request_team_size_and_class_rpc.sql
supabase/class_based_team_status.sql
```

This migration is additive. It does not drop existing tables, reset data, or delete real users. It adds:

- lecturer-created classes with shareable join codes
- student class membership
- optional `team_requests.class_id`
- class-aware matching
- request create/update functions that can attach a request to a joined class
- a light lecturer dashboard function

The latest role-switch migration adds:

- `profiles.role`, defaulting existing users to `student`
- `profiles.lecturer_title`
- demo classes and demo class membership
- My Profile mode switching between Student and Lecturer
- demo Lecturer ID access for the Lecturer Dashboard
- school/major-aware demo class lookup for student Join Class testing

The class status migration adds:

- class-based status labels such as `No request / not looking`, `Looking for teammates`, `Missing 1 teammate`, and `Team complete`
- `list_my_classes_with_status(current_profile)` for the student My Classes screen
- updated lecturer dashboard student status data based on partial team progress

Student flow:

```text
Create Profile
  -> My Classes
  -> Join Class with lecturer code
  -> Class Detail
  -> See team status
  -> Create Team Request for that class
  -> Return to Class Detail
  -> Find Matches inside that class
```

Standalone / outside-class flow:

```text
Open Opportunities
  -> Create Teammate Request
  -> Find teammates outside a specific enrolled class
```

Lecturer flow:

```text
My Profile
  -> Switch to Lecturer Mode
  -> Select University
  -> Enter demo Lecturer ID
  -> Open Lecturer Dashboard
  -> View My Classes and team-formation progress
```

Security limitation: there is still no real university login, SSO, or staff verification. Lecturer Mode is an MVP-only local mode plus demo Lecturer ID lookup, so it is suitable for testing the experience and dashboard evidence only. Production should use real Supabase Auth roles and university identity checks before handling real class administration.

Demo lecturer accounts:

- `RMIT University` · Lecturer ID `v123456` · Tom Anderson
- `University of Economics Ho Chi Minh City` · Lecturer ID `v654321` · Minh Nguyen
- `University of Technology Ho Chi Minh City` · Lecturer ID `v888888` · Sarah Tran

Student demo class codes:

- `200206`
- `676767`
- `88889999`

The app shows `Demo lecturer ID: v123456` under the Lecturer ID field and `Demo codes: 200206 • 676767 • 88889999` under the Join Class field so testers do not need to search the README. Demo class lookup chooses a class that matches the student's saved school/major where possible, so a Business or IT student is not shown the Digital Media class by default.

## Deploy

For a static host such as Vercel, Netlify, or Supabase Hosting:

1. Set `VITE_SUPABASE_URL`.
2. Set `VITE_SUPABASE_ANON_KEY`.
3. Build with `npm run build`.
4. Deploy the generated `dist` folder or connect the repo with the same build command.
