import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';
import {
  cancelConnectionRequest,
  cancelTeamRequest,
  confirmFriendMatch,
  createProfile,
  createMatchFeedback,
  createReview,
  createTeamRequest,
  getConnectionBetween,
  getConnectionDetail,
  getConnectionRequests,
  getDiscoverProfiles,
  getNotificationCounts,
  getMatchesForRequest,
  getMessages,
  getMessageThreads,
  getActiveTeamRequests,
  getProfileById,
  listMyTeamRequests,
  getTeamRequestProgress,
  getTeamRequestById,
  getPortfolioReferenceUrl,
  markNotificationsRead,
  markTeamRequestFound,
  listFriends,
  listProfileReviews,
  respondConnectionRequest,
  resetDemoConnection,
  reopenTeamRequest,
  sendDemoReply,
  sendChatMessage,
  sendConnectionRequest,
  simulateDemoAcceptance,
  unmatchConnectionRequest,
  updateProfile,
  updateTeamRequest,
  uploadPortfolioReference,
} from './lib/database';
import { hasSupabaseConfig } from './lib/supabase';
import { REVIEW_WAIT_DAYS } from './lib/config';
import {
  connectMessageSuggestions,
  contactTypes,
  demoReplyPool,
  getAllCourses,
  getAllSkills,
  getCoursesForSchool,
  getRequestSkillOptions,
  getSchoolsForUniversity,
  getSkillsForSchool,
  majorsBySchool,
  requirementOptions,
  schoolOptions,
  toolOptions,
  universityOptions,
  workStyleOptions,
} from './lib/catalog';
import {
  getStoredProfileId,
  getStoredRequestEditToken,
  getStoredRequestId,
  clearCurrentRequest,
  storeCurrentRequest,
  storeProfileId,
} from './lib/storage';
import { calculateMatchScore } from './lib/matching';

const classDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const mergeMessagesById = (left = [], right = []) => {
  const seen = new Set();
  return [...left, ...right]
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};
const portfolioFileRules = {
  maxSize: 10 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg'],
};

const unmatchReasons = [
  'Our skills or expectations are not a good fit',
  'Our working styles are not compatible',
  'I found another teammate',
  'No response / inactive',
  'Connected by mistake',
  'Our project needs have changed',
  'Other',
];

const emptyProfile = {
  full_name: '',
  university: 'RMIT University',
  school: '',
  major: '',
  skills: [],
  other_skill: '',
  contact_type: 'email',
  contact_value: '',
  short_bio: '',
  is_available: true,
  consent_public_visibility: false,
};

const parseClassSession = (session = '') => {
  const parts = String(session || '').trim().split(/\s+/);
  const [day = '', startTime = '', endTime = ''] = parts;

  return {
    day: classDayOptions.includes(day) ? day : '',
    startTime: /^\d{2}:\d{2}$/.test(startTime) ? startTime : '',
    endTime: /^\d{2}:\d{2}$/.test(endTime) ? endTime : '',
  };
};

const formatClassSession = ({ class_day, class_start_time, class_end_time }) => {
  if (!class_day || !class_start_time) return '';
  return class_end_time
    ? `${class_day} ${class_start_time} ${class_end_time}`
    : `${class_day} ${class_start_time}`;
};

const emptyRequest = {
  school: '',
  major: '',
  course_name: '',
  course_code: '',
  class_session: '',
  class_day: '',
  class_start_time: '',
  class_end_time: '',
  skills_needed: [],
  other_skill: '',
  members_needed: 1,
  total_team_size: 2,
  teammates_needed_initial: 1,
  work_styles: [],
  requirements_selected: [],
  minimum_gpa: '',
  portfolio_link_required: false,
  portfolio_upload_enabled: false,
  portfolio_file: null,
  portfolio_reference_path: null,
  portfolio_reference_name: null,
  required_tools: [],
  other_tool: '',
  requirements: '',
};

const buildRequestFormState = (profile, request = null) => {
  const parsedSession = parseClassSession(request?.class_session);

  if (!request) {
    return {
      ...emptyRequest,
      school: schoolOptions.some((school) => school.value === profile.school) ? profile.school : '',
      major: profile.major || '',
    };
  }

  const requirementsData = request.requirements_data || {};
  return {
    ...emptyRequest,
    school: request.school || profile.school || '',
    major: request.major || profile.major || '',
    course_name: request.course_name || request.course || '',
    course_code: request.course_code || '',
    class_session: request.class_session || '',
    class_day: request.class_day || parsedSession.day,
    class_start_time: request.class_start_time || parsedSession.startTime,
    class_end_time: request.class_end_time || parsedSession.endTime,
    skills_needed: request.skills_needed || [],
    members_needed: request.members_needed || 1,
    total_team_size: request.total_team_size || Number(request.members_needed || 1) + 1,
    teammates_needed_initial: request.teammates_needed_initial || request.members_needed || 1,
    work_styles: getWorkStyles(request),
    requirements_selected: requirementsData.selected || [],
    minimum_gpa: requirementsData.minimum_gpa ?? '',
    portfolio_link_required: Boolean(requirementsData.portfolio_link_required),
    portfolio_upload_enabled: Boolean(request.portfolio_reference_path),
    portfolio_reference_path: request.portfolio_reference_path || null,
    portfolio_reference_name: request.portfolio_reference_name || null,
    required_tools: requirementsData.required_tools || [],
    requirements: request.requirements || '',
  };
};

const splitList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const validatePortfolioFile = (file) => {
  if (!file) return '';
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!portfolioFileRules.extensions.includes(extension)) {
    return 'Portfolio reference must be a PDF, PNG, JPG, or JPEG file.';
  }

  if (!portfolioFileRules.mimeTypes.includes(file.type)) {
    return 'Portfolio reference must be a PDF, PNG, JPG, or JPEG file.';
  }

  if (file.size > portfolioFileRules.maxSize) {
    return 'Portfolio reference must be 10 MB or smaller.';
  }

  return '';
};

const getFriendlyError = (error, fallback) => {
  if (error?.code === 'anonymous_provider_disabled' || error?.message?.includes('Anonymous sign-ins are disabled')) {
    return 'Anonymous Sign-ins are not enabled in Supabase yet. Enable them in Authentication > Sign In / Providers, then refresh this app.';
  }

  if (error?.code === 'PGRST204' || error?.message?.includes("Could not find the 'owner_id' column")) {
    return 'The real public testing migration has not been applied yet. Run supabase/real_public_testing.sql in Supabase.';
  }

  if (error?.message?.includes('p_total_team_size') || error?.message?.includes("Could not find the 'total_team_size' column")) {
    return 'The team size migration has not been applied yet. Run supabase/bidirectional_match_team_size.sql in Supabase.';
  }

  if (
    error?.message?.includes('p_university')
    || error?.message?.includes("Could not find the 'university' column")
    || error?.message?.includes("Could not find the 'is_available' column")
  ) {
    return 'The A3 iteration migration has not been applied yet. Run supabase/a3_iteration_features.sql in Supabase.';
  }

  if (error?.message?.includes('Profile ownership required')) {
    return 'This profile is not linked to the current browser session. Refresh the app first. If this keeps happening, create a new profile on this browser.';
  }

  if (error?.message?.includes('Profile was not updated')) {
    return 'This profile is not linked to the current browser session, so it cannot be edited from here. Refresh first; if it still happens, create a new profile on this browser.';
  }

  if (error?.message?.includes('Review is not available yet')) {
    if (REVIEW_WAIT_DAYS === 0) {
      return 'Supabase is still using the old review wait setting. Run supabase/review_wait_now_testing.sql, then try again.';
    }
    return 'Review is not available yet.';
  }

  if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
    return 'You already submitted this once for this match.';
  }

  return error?.message ? `${fallback} (${error.message})` : fallback;
};

const titleCase = (value) => {
  if (!value) return 'Not specified';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const contactLabel = (value) => {
  if (value === 'url') return 'Other link';
  return titleCase(value);
};

const schoolLabel = (value) =>
  schoolOptions.find((school) => school.value === value)?.label || value || 'Not specified';

const universityLabel = (value) =>
  universityOptions.find((university) => university.value === value)?.label || value || 'RMIT University';

const getReviewSummary = (profile = {}) => {
  const summary = profile.review_summary || {};
  return {
    average: Number(summary.average_rating || summary.average || 0),
    count: Number(summary.review_count || summary.count || 0),
  };
};

const getReviewSummaryFromReviews = (reviews = []) => {
  const validReviews = reviews.filter((review) => Number(review.rating) > 0);

  if (validReviews.length === 0) {
    return { average: 0, count: 0 };
  }

  const total = validReviews.reduce((sum, review) => sum + Number(review.rating), 0);
  return {
    average: total / validReviews.length,
    count: validReviews.length,
  };
};

const reviewSummaryLabel = (profile = {}, reviews = null) => {
  const summary = Array.isArray(reviews) && reviews.length > 0
    ? getReviewSummaryFromReviews(reviews)
    : getReviewSummary(profile);

  return summary.count > 0
    ? `${summary.average.toFixed(1)} ★ · Based on ${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}`
    : 'No reviews yet.';
};

const normalizeSkill = (value) => String(value || '').trim().toLowerCase();

const calculateSkillGap = (request, profile, teammates = []) => {
  const required = request?.skills_needed || [];
  const teamSkills = [
    ...(profile?.skills || []),
    ...teammates.flatMap((teammate) => teammate.skills || teammate.teammate_skills || []),
  ];
  const teamSkillSet = new Set(teamSkills.map(normalizeSkill).filter(Boolean));

  const covered = required.filter((skill) => teamSkillSet.has(normalizeSkill(skill)));
  const missing = required.filter((skill) => !teamSkillSet.has(normalizeSkill(skill)));

  return {
    covered,
    missing,
    total: required.length,
  };
};

const getReviewEligibility = (connection) => {
  if (REVIEW_WAIT_DAYS <= 0) {
    return { eligible: true, remainingDays: 0, eligibleAt: new Date() };
  }

  const acceptedAt = connection?.accepted_at || connection?.updated_at || connection?.created_at;
  const acceptedDate = acceptedAt ? new Date(acceptedAt) : null;

  if (!acceptedDate || Number.isNaN(acceptedDate.getTime())) {
    return { eligible: false, remainingDays: REVIEW_WAIT_DAYS, eligibleAt: null };
  }

  const eligibleAt = new Date(acceptedDate.getTime() + REVIEW_WAIT_DAYS * 24 * 60 * 60 * 1000);
  const remainingDays = Math.max(0, Math.ceil((eligibleAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  return {
    eligible: remainingDays === 0,
    remainingDays,
    eligibleAt,
  };
};

const allCourseOptions = getAllCourses();

const formatCourseOption = (course) =>
  course?.code ? `${course.name} (${course.code})` : course?.name || 'Not specified';

const findCourseByCode = (courseCode) =>
  allCourseOptions.find((course) => course.code === courseCode) || null;

const getCourseDisplay = (request) => {
  if (!request) return 'Not specified';
  if (request.course_name && request.course_code) return `${request.course_name} (${request.course_code})`;
  if (request.course_name) return request.course_name;
  return request.course || 'Not specified';
};

const getSessionDisplay = (request = {}) => {
  const parsed = parseClassSession(request.class_session);
  const day = request.class_day || parsed.day;
  const start = request.class_start_time || parsed.startTime;
  const end = request.class_end_time || parsed.endTime;

  if (day && start && end) return `${day} · ${start}-${end}`;
  if (day && start) return `${day} · ${start}`;
  return request.class_session || 'Not specified';
};

const getCourseFilterValue = (request) =>
  request?.course_code || request?.course_name || request?.course || '';

const normalizeFilterValue = (value) => String(value || '').trim().toLowerCase();

const getCourseFilterValues = (request) =>
  [...new Set([
    request?.course_code,
    request?.course_name,
    request?.course,
  ].map(normalizeFilterValue).filter(Boolean))];

const courseMatchesFilter = (request, filterValue) => {
  const normalizedFilter = normalizeFilterValue(filterValue);
  if (!normalizedFilter) return true;
  return getCourseFilterValues(request).includes(normalizedFilter);
};

const joinList = (items) => {
  if (!items?.length) return 'Not specified';
  return items.join(', ');
};

const getWorkStyles = (request) => {
  if (request?.work_styles?.length) return request.work_styles;
  if (request?.work_style) return [request.work_style];
  return [];
};

const getTotalTeamSize = (request) =>
  Math.max(1, Number(request?.total_team_size || Number(request?.members_needed || 1) + 1));

const getInitialNeeded = (request) =>
  Math.max(1, Number(request?.teammates_needed_initial || request?.members_needed || 1));

const getTeamProgress = (request, progress = {}) => {
  const total = Math.max(1, Number(progress.total_team_size || getTotalTeamSize(request)));
  const initialNeeded = Math.min(total, getInitialNeeded(request));
  const existingMembers = Math.max(0, Number(progress.existing_members ?? (total - initialNeeded)));
  const matchedCount = Math.max(0, Number(progress.matched_count ?? progress.found_count ?? 0));
  const backendIncludesExisting = progress.total_team_size !== undefined || progress.existing_members !== undefined || progress.matched_count !== undefined;
  const rawFound = backendIncludesExisting
    ? Number(progress.found_count ?? existingMembers + matchedCount)
    : existingMembers + matchedCount;
  const found = Math.min(total, Math.max(0, rawFound));
  const remaining = Math.max(0, total - found);

  return {
    total,
    initialNeeded,
    existingMembers,
    matchedCount,
    found,
    remaining,
    complete: found >= total,
    percent: total ? Math.min(100, (found / total) * 100) : 0,
  };
};

const progressSummary = (metrics) => `${metrics.found} / ${metrics.total} found`;

const remainingSummary = (metrics) =>
  metrics.complete
    ? 'Team complete 🎉'
    : `${metrics.remaining} ${metrics.remaining === 1 ? 'spot' : 'spots'} remaining`;

const getProfileSkillsFromForm = (form) => [
  ...form.skills.filter((skill) => skill !== 'Other'),
  ...splitList(form.other_skill),
];

const filterSkillsForSchool = (skills, school) => {
  const schoolSkills = new Set(getSkillsForSchool(school));
  const knownSkills = new Set(getAllSkills());
  return (skills || []).filter((skill) =>
    skill === 'Other' || schoolSkills.has(skill) || !knownSkills.has(skill),
  );
};

const mergeOptionSets = (...groups) =>
  [...new Set(groups.flat().filter(Boolean))];

const describeRequirements = (request) => {
  const data = request?.requirements_data || {};
  const parts = [];

  if (data.selected?.length) {
    parts.push(...data.selected.filter((item) => item !== 'Has completed specific courses'));
  }

  if (data.minimum_gpa) {
    parts.push(`Minimum GPA: ${data.minimum_gpa}`);
  }

  if (data.portfolio_link_required) {
    parts.push('Portfolio link requested');
  }

  if (data.required_tools?.length) {
    parts.push(`Tools: ${data.required_tools.join(', ')}`);
  }

  if (request?.requirements) {
    parts.push(request.requirements);
  }

  return parts.length ? parts.join(' | ') : 'Not specified';
};

const toggleValue = (items, value) =>
  items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

const withoutNoSpecificRequirements = (items) =>
  items.filter((item) => item !== 'No specific requirements');

const formatTime = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatThreadTime = (value) => {
  if (!value) return 'No messages yet';
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return formatTime(value);
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
};

const PillList = ({ items }) => (
  <div className="pill-list">
    {items?.length ? items.map((item) => <span key={item}>{item}</span>) : <span>Not specified</span>}
  </div>
);

const DemoBadge = () => <span className="demo-badge">DEMO</span>;

const displayName = (name) => String(name || '').replace(/\s*\(Demo\)\s*$/i, '').trim();

const displayInitial = (name) => displayName(name).slice(0, 1) || '?';

const getConnectionState = (connection, currentProfileId) => {
  if (!connection || ['declined', 'cancelled', 'unmatched'].includes(connection.status)) return 'none';
  if (connection.status === 'accepted') return 'accepted';
  if (connection.status === 'pending' && connection.sender_profile_id === currentProfileId) return 'sent_pending';
  if (connection.status === 'pending' && connection.receiver_profile_id === currentProfileId) return 'received_pending';
  if (connection.status === 'pending') return 'pending';
  return connection.status;
};

const connectionStateLabel = (state) => {
  if (state === 'accepted') return 'Connected';
  if (state === 'sent_pending') return 'Request Sent';
  if (state === 'received_pending') return 'Respond to Request';
  if (state === 'pending') return 'Pending';
  return '';
};

const connectionRelationshipLabel = (connection) =>
  connection?.relationship_type === 'teammate' ? 'Teammate' : 'Friend';

const connectedButtonLabel = (connection) =>
  connection?.status === 'accepted'
    ? `Connected · ${connectionRelationshipLabel(connection)}`
    : 'Connected';

const connectionStatusLabel = (status, tab) => {
  if (tab === 'received' && status === 'pending') return 'Needs response';
  if (tab === 'sent' && status === 'pending') return 'Pending';
  if (tab === 'connected' && status === 'accepted') return 'Accepted';
  if (tab === 'declined' && status === 'unmatched') return 'Connection ended';
  if (tab === 'declined') return 'Declined';
  return titleCase(status);
};

const ConnectionStateBadge = ({ state }) => {
  const label = connectionStateLabel(state);
  if (!label) return null;
  return <span className={`status-badge ${state}`}>{state === 'accepted' ? '✓ ' : ''}{label}</span>;
};

const ConnectionRelationshipBadge = ({ connection }) => {
  if (connection?.status !== 'accepted') return null;
  const relationship = connectionRelationshipLabel(connection);
  return <span className={`status-badge ${relationship.toLowerCase()}`}>{relationship}</span>;
};

const PortfolioReference = ({ request }) => {
  const fileUrl = getPortfolioReferenceUrl(request?.portfolio_reference_path);

  if (!request?.requires_portfolio && !fileUrl) {
    return null;
  }

  return (
    <>
      {request?.requires_portfolio && <div><dt>Portfolio</dt><dd>Portfolio required</dd></div>}
      {fileUrl && (
        <div>
          <dt>Portfolio / Project Reference</dt>
          <dd>
            <a className="text-link" href={fileUrl} target="_blank" rel="noreferrer">
              View File
            </a>
            {request.portfolio_reference_name && <span className="file-name"> {request.portfolio_reference_name}</span>}
          </dd>
        </div>
      )}
    </>
  );
};

const CheckboxGrid = ({ options, selected, onToggle, columns = 'auto' }) => (
  <div className={`checkbox-grid ${columns}`}>
    {options.map((option) => (
      <label className={selected.includes(option) ? 'check-option selected' : 'check-option'} key={option}>
        <input
          type="checkbox"
          checked={selected.includes(option)}
          onChange={() => onToggle(option)}
        />
        <span>{option}</span>
      </label>
    ))}
  </div>
);

function ConnectModal({ receiverName, sending, error, onClose, onSend }) {
  const [introMessage, setIntroMessage] = useState('');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Send a connection request">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Connect</p>
            <h2>Send a connection request</h2>
          </div>
          <button className="ghost" onClick={onClose} type="button">Close</button>
        </div>
        <p className="note">To: {receiverName}</p>
        <label>
          Add a short message
          <textarea
            value={introMessage}
            onChange={(event) => setIntroMessage(event.target.value)}
            placeholder="Write a short intro..."
            rows="4"
          />
        </label>
        <div className="suggestions">
          {connectMessageSuggestions.map((message) => (
            <button className="suggestion-chip" key={message} type="button" onClick={() => setIntroMessage(message)}>
              {message}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="hero-actions">
          <button className="primary" onClick={() => onSend(introMessage)} disabled={sending}>
            {sending ? 'Sending...' : 'Send Request'}
          </button>
          <button className="secondary" onClick={onClose} type="button">Cancel</button>
        </div>
      </section>
    </div>
  );
}

function UnmatchModal({ teammateName, saving, error, onClose, onConfirm }) {
  const [step, setStep] = useState('confirm');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Unmatch confirmation">
        {step === 'confirm' ? (
          <>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Unmatch</p>
                <h2>Unmatch with {teammateName}?</h2>
              </div>
              <button className="ghost" onClick={onClose} type="button">Close</button>
            </div>
            <p className="note">Are you sure you want to unmatch? You will no longer appear as connected.</p>
            {error && <p className="error">{error}</p>}
            <div className="hero-actions">
              <button className="secondary" onClick={onClose} type="button">Cancel</button>
              <button className="primary" onClick={() => setStep('reason')} type="button">Continue</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Unmatch</p>
                <h2>Why are you unmatching?</h2>
              </div>
              <button className="ghost" onClick={onClose} type="button">Close</button>
            </div>
            <div className="radio-list">
              {unmatchReasons.map((item) => (
                <label className={reason === item ? 'check-option selected' : 'check-option'} key={item}>
                  <input
                    type="radio"
                    name="unmatch-reason"
                    checked={reason === item}
                    onChange={() => setReason(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            {reason === 'Other' && (
              <label>
                Tell us more (optional)
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows="3"
                />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <div className="hero-actions">
              <button className="secondary" onClick={onClose} type="button">Cancel</button>
              <button className="primary" onClick={() => onConfirm(reason, note)} disabled={saving || !reason}>
                {saving ? 'Unmatching...' : 'Confirm Unmatch'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DemoSimulationPanel({ connection, accepting, onAccept, onStartChat, onViewConnection, onReset }) {
  if (!connection) return null;

  if (connection.status === 'accepted') {
    return (
      <section className="demo-simulation success-simulation">
        <p className="eyebrow">Demo Simulation</p>
        <h3>It's a Match! 🎉</h3>
        <p>You and this demo teammate are now connected.</p>
        <div className="hero-actions">
          <button className="primary" onClick={onStartChat}>Start Chat</button>
          {onViewConnection && <button className="secondary" onClick={onViewConnection}>View Connection</button>}
          {onReset && <button className="secondary" onClick={onReset}>Reset Demo</button>}
        </div>
      </section>
    );
  }

  if (connection.status === 'pending') {
    return (
      <section className="demo-simulation">
        <p className="eyebrow">Demo Simulation</p>
        <h3>Simulate demo acceptance</h3>
        <p>This is a demo profile. Simulate the teammate accepting your connection request to continue testing the MVP flow.</p>
        <button className="primary" onClick={onAccept} disabled={accepting}>
          {accepting ? 'Simulating...' : 'Simulate Acceptance'}
        </button>
      </section>
    );
  }

  return null;
}

const StepRail = ({ step }) => {
  const steps = ['Profile', 'Request', 'Matches', 'Connect'];

  return (
    <div className="step-rail" aria-label="Teamergency flow">
      {steps.map((item, index) => (
        <div className={index <= step ? 'step active' : 'step'} key={item}>
          <span>{index + 1}</span>
          {item}
        </div>
      ))}
    </div>
  );
};

function Home({ profileId, requestId, onStartProfile, onStartRequest, onFindMatches }) {
  return (
    <main className="home-grid">
      <section className="intro">
        <h1>
          <span className="hero-line">Find the right <span className="brand-blue">Teammate.</span></span>
          <span className="hero-line">Build better projects <span className="brand-red">Emergency.</span></span>
        </h1>
        <p className="lead">
          Help students connect with the right teammates faster and build great projects together.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={requestId ? onFindMatches : (profileId ? onStartRequest : onStartProfile)}>
            Find Teammates
            <ArrowRight size={18} />
          </button>
          <button className="secondary" onClick={profileId ? onStartRequest : onStartProfile}>
            Create a Request
          </button>
        </div>
        <button className="signup-inline" type="button" onClick={onStartProfile}>
          Not have an Account? <span>Sign Up</span>
        </button>
      </section>
    </main>
  );
}

function ProfileForm({ onSaved }) {
  const [form, setForm] = useState(emptyProfile);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const profileSkillOptions = mergeOptionSets(getSkillsForSchool(form.school), form.skills);
  const profileSchoolOptions = getSchoolsForUniversity(form.university);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateSchool = (value) => {
    setForm((current) => ({
      ...current,
      school: value,
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
      skills: filterSkillsForSchool(current.skills, value),
    }));
  };

  const toggleProfileSkill = (skill) => {
    setForm((current) => ({
      ...current,
      skills: toggleValue(current.skills, skill),
      other_skill: skill === 'Other' && current.skills.includes('Other') ? '' : current.other_skill,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const skills = getProfileSkillsFromForm(form);

    if (!form.full_name || !form.school || !form.major || skills.length === 0 || !form.contact_value || !form.short_bio) {
      setError("Please fill in your profile's required fields.");
      return;
    }

    if (!form.consent_public_visibility) {
      setError('Please confirm that your profile information will be visible to other Teamergency users.');
      return;
    }

    setSaving(true);

    try {
      const profile = await createProfile({
        full_name: form.full_name.trim(),
        university: form.university || 'RMIT University',
        school: form.school.trim(),
        major: form.major.trim(),
        skills,
        contact_type: form.contact_type,
        contact_value: form.contact_value.trim() || null,
        short_bio: form.short_bio.trim(),
        is_available: true,
        consent_public_visibility: true,
      });
      storeProfileId(profile.id);
      onSaved(profile);
    } catch (err) {
      setError(getFriendlyError(err, "We couldn't save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen">
      <StepRail step={0} />
      <form className="form-shell" onSubmit={submit}>
        <div className="form-heading">
          <UserRound size={28} />
          <div>
            <p className="eyebrow">Create User Profile</p>
            <h2>Your reusable teammate profile</h2>
          </div>
        </div>

        <div className="form-grid">
          <label>
            Full Name
            <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
          </label>
          <label>
            University
            <select value={form.university} onChange={(event) => updateField('university', event.target.value)} required>
              {universityOptions.map((university) => (
                <option value={university.value} key={university.value}>{university.label}</option>
              ))}
            </select>
          </label>
          <label>
            School
            <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
              <option value="">Select school</option>
              {profileSchoolOptions.map((school) => (
                <option value={school.value} key={school.value}>{school.label}</option>
              ))}
            </select>
          </label>
          <label>
            Major
            <select value={form.major} onChange={(event) => updateField('major', event.target.value)} required>
              <option value="">Select major</option>
              {(majorsBySchool[form.school] || []).map((major) => (
                <option value={major} key={major}>{major}</option>
              ))}
            </select>
          </label>
          <fieldset className="wide">
            <legend>Skills & Technologies</legend>
            <p className="field-helper">Suggested skills update based on your school. You can still add a custom skill.</p>
            <CheckboxGrid
              options={profileSkillOptions}
              selected={form.skills}
              onToggle={toggleProfileSkill}
            />
            {form.skills.includes('Other') && (
              <input
                value={form.other_skill}
                onChange={(event) => updateField('other_skill', event.target.value)}
                placeholder="Add another skill"
              />
            )}
          </fieldset>
          <label>
            Contact Method
            <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
              {contactTypes.map((type) => (
                <option value={type} key={type}>{contactLabel(type)}</option>
              ))}
            </select>
          </label>
          <label>
            Contact Information
            <input
              value={form.contact_value}
              onChange={(event) => updateField('contact_value', event.target.value)}
              placeholder="name@email.com or @handle"
              required
            />
          </label>
          <label className="wide">
            Short Bio
            <textarea
              value={form.short_bio}
              onChange={(event) => updateField('short_bio', event.target.value)}
              rows="4"
              required
            />
          </label>
        </div>

        <label className={form.consent_public_visibility ? 'consent-box selected' : 'consent-box'}>
          <input
            type="checkbox"
            checked={form.consent_public_visibility}
            onChange={() => updateField('consent_public_visibility', !form.consent_public_visibility)}
            required
          />
          <span>
            I understand that the information I provide will be visible to other Teamergency users for teammate-finding and networking purposes.
          </span>
        </label>
        <p className="field-helper">Teamergency is an MVP being developed and tested as part of a university project.</p>

        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={saving || !form.consent_public_visibility}>
          {saving ? 'Creating...' : 'Create Profile'}
        </button>
      </form>
    </main>
  );
}

function ProfileSaved({ profile, onContinue }) {
  return (
    <main className="screen compact">
      <StepRail step={1} />
      <section className="confirmation">
        <CheckCircle2 size={42} />
        <p className="eyebrow">Profile Saved</p>
        <h2>{displayName(profile?.full_name) || 'Your profile'} is ready.</h2>
        <p>Your profile ID is saved on this device and will be used for new teammate searches.</p>
        <button className="primary" onClick={onContinue}>Create Teammate Search Request</button>
      </section>
    </main>
  );
}

function RequestForm({ profile, onCreated, onUpdated, onBack, request = null, mode = 'create' }) {
  const [form, setForm] = useState(() => buildRequestFormState(profile, request));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const courseOptions = getCoursesForSchool(form.school);
  const requestSkillOptions = mergeOptionSets(getRequestSkillOptions(profile), form.skills_needed);

  useEffect(() => {
    setForm(buildRequestFormState(profile, request));
  }, [profile.id, request?.id]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateCourse = (courseCode) => {
    const selectedCourse = findCourseByCode(courseCode);
    setForm((current) => ({
      ...current,
      course_name: selectedCourse?.name || '',
      course_code: selectedCourse?.code || '',
      class_session: '',
      class_day: '',
      class_start_time: '',
      class_end_time: '',
    }));
  };

  const toggleSkill = (skill) => {
    setForm((current) => ({
      ...current,
      skills_needed: toggleValue(current.skills_needed, skill),
    }));
  };

  const toggleWorkStyle = (style) => {
    setForm((current) => ({
      ...current,
      work_styles: toggleValue(current.work_styles, style),
    }));
  };

  const toggleRequirement = (requirement) => {
    setForm((current) => {
      if (requirement === 'No specific requirements') {
        const selected = current.requirements_selected.includes(requirement) ? [] : [requirement];
        return {
          ...current,
          requirements_selected: selected,
          minimum_gpa: '',
          portfolio_link_required: false,
          portfolio_upload_enabled: false,
          portfolio_file: null,
          required_tools: [],
          other_tool: '',
        };
      }

      if (requirement === 'Has a portfolio' && current.requirements_selected.includes(requirement)) {
        return {
          ...current,
          requirements_selected: withoutNoSpecificRequirements(current.requirements_selected).filter(
            (item) => item !== requirement,
          ),
          portfolio_link_required: false,
          portfolio_upload_enabled: false,
          portfolio_file: null,
        };
      }

      return {
        ...current,
        requirements_selected: toggleValue(
          withoutNoSpecificRequirements(current.requirements_selected),
          requirement,
        ),
      };
    });
  };

  const toggleTool = (tool) => {
    setForm((current) => ({
      ...current,
      required_tools: toggleValue(current.required_tools, tool),
    }));
  };

  const updatePortfolioFile = (file) => {
    const fileError = validatePortfolioFile(file);
    setError(fileError);
    setForm((current) => ({
      ...current,
      portfolio_file: fileError ? null : file,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const skillsNeeded = [
      ...form.skills_needed.filter((skill) => skill !== 'Other'),
      ...splitList(form.other_skill),
    ];
    const requiredTools = [
      ...form.required_tools.filter((tool) => tool !== 'Other'),
      ...splitList(form.other_tool),
    ];

    const portfolioFileError = validatePortfolioFile(form.portfolio_file);
    const totalTeamSize = Number(form.total_team_size);
    const teammatesNeededInitial = Number(form.teammates_needed_initial);

    if (!form.school || !form.major || !form.course_name || !form.course_code || !form.class_day || !form.class_start_time || skillsNeeded.length === 0 || totalTeamSize < 2 || teammatesNeededInitial < 1) {
      setError('Please fill in course, class day, start time, skills needed, total team size, and spots remaining.');
      return;
    }

    if (teammatesNeededInitial >= totalTeamSize) {
      setError('You cannot look for more teammates than the total team size.');
      return;
    }

    if (portfolioFileError) {
      setError(portfolioFileError);
      return;
    }

    setSaving(true);

    try {
      const portfolioUpload = form.portfolio_file
        ? await uploadPortfolioReference(form.portfolio_file, profile.id)
        : null;
      const requiresPortfolio = form.requirements_selected.includes('Has a portfolio');
      const classSession = formatClassSession(form);
      const portfolioReferencePath = requiresPortfolio
        ? portfolioUpload?.path || form.portfolio_reference_path || null
        : null;
      const portfolioReferenceName = requiresPortfolio
        ? portfolioUpload?.name || form.portfolio_reference_name || null
        : null;

      const payload = {
        school: form.school,
        major: form.major,
        course: form.course_name.trim(),
        course_name: form.course_name.trim(),
        course_code: form.course_code.trim(),
        class_session: classSession,
        class_day: form.class_day,
        class_start_time: form.class_start_time,
        class_end_time: form.class_end_time || null,
        skills_needed: skillsNeeded,
        members_needed: teammatesNeededInitial,
        total_team_size: totalTeamSize,
        teammates_needed_initial: teammatesNeededInitial,
        availability: [],
        preferred_active_time: null,
        work_style: null,
        work_styles: form.work_styles,
        requirements_data: {
          selected: form.requirements_selected,
          minimum_gpa: form.minimum_gpa ? Number(form.minimum_gpa) : null,
          portfolio_link_required: requiresPortfolio && form.portfolio_link_required,
          required_tools: requiredTools,
        },
        requires_portfolio: requiresPortfolio,
        portfolio_reference_path: portfolioReferencePath,
        portfolio_reference_name: portfolioReferenceName,
        requirements: form.requirements.trim() || null,
      };

      if (mode === 'edit' && request?.id) {
        const updatedRequest = await updateTeamRequest(request.id, profile.id, payload);
        onUpdated?.(updatedRequest);
      } else {
        const createdRequest = await createTeamRequest(profile.id, payload);
        storeCurrentRequest(createdRequest.id, createdRequest.editToken);
        onCreated(createdRequest);
      }
    } catch (err) {
      const fallback = mode === 'edit'
        ? "We couldn't update your teammate search. Please try again."
        : "We couldn't create your teammate search. Please try again.";
      setError(getFriendlyError(err, fallback));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen">
      <StepRail step={1} />
      <form className="form-shell" onSubmit={submit}>
        <button className="ghost" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div className="form-heading">
          <Search size={28} />
          <div>
            <p className="eyebrow">{mode === 'edit' ? 'Edit Team Request' : 'Create Teammate Search Request'}</p>
            <h2>{mode === 'edit' ? 'Update this teammate search' : 'What team do you need right now?'}</h2>
          </div>
        </div>

        <div className="profile-strip">
          <GraduationCap size={20} />
          <span>{displayName(profile.full_name)}</span>
          <span>{schoolLabel(profile.school)} | {profile.major}</span>
        </div>

        <div className="form-grid">
          <div className="course-session-row wide">
            <label>
              Course
              <select value={form.course_code} onChange={(event) => updateCourse(event.target.value)} required>
                <option value="">Select course</option>
                {courseOptions.map((course) => (
                  <option value={course.code} key={course.code}>{formatCourseOption(course)}</option>
                ))}
              </select>
              <span className="field-helper">Courses are filtered by your profile school.</span>
            </label>
            <label>
              Day
              <select value={form.class_day} onChange={(event) => updateField('class_day', event.target.value)} required>
                <option value="">Select day</option>
                {classDayOptions.map((day) => (
                  <option value={day} key={day}>{day}</option>
                ))}
              </select>
              <span className="field-helper invisible-helper">Select the class day.</span>
            </label>
          </div>
          <div className="course-session-row wide">
            <label>
              Start Time
              <input
                type="time"
                value={form.class_start_time}
                onChange={(event) => updateField('class_start_time', event.target.value)}
                required
              />
              <span className="field-helper">Use your actual class start time.</span>
            </label>
            <label>
              End Time
              <input
                type="time"
                value={form.class_end_time}
                onChange={(event) => updateField('class_end_time', event.target.value)}
              />
              <span className="field-helper">Optional.</span>
            </label>
          </div>
          <fieldset className="wide">
            <legend>What skills are you looking for?</legend>
            <p className="field-helper">Starts with skills related to your school, plus cross-disciplinary options for mixed teams.</p>
            <CheckboxGrid
              options={requestSkillOptions}
              selected={form.skills_needed}
              onToggle={toggleSkill}
            />
            {form.skills_needed.includes('Other') && (
              <input
                value={form.other_skill}
                onChange={(event) => updateField('other_skill', event.target.value)}
                placeholder="Add another skill"
              />
            )}
          </fieldset>
          <div className="course-session-row wide">
            <label>
              Total team members required
              <input
                min="2"
                type="number"
                value={form.total_team_size}
                onChange={(event) => updateField('total_team_size', event.target.value)}
                required
              />
            </label>
            <label>
              How many teammates are you still looking for?
              <input
                min="1"
                type="number"
                value={form.teammates_needed_initial}
                onChange={(event) => {
                  updateField('teammates_needed_initial', event.target.value);
                  updateField('members_needed', event.target.value);
                }}
                required
              />
            </label>
          </div>
          <fieldset className="wide">
            <legend>What kind of teammate are you looking for?</legend>
            <CheckboxGrid
              options={workStyleOptions}
              selected={form.work_styles}
              onToggle={toggleWorkStyle}
            />
          </fieldset>
          <fieldset className="wide">
            <legend>Any specific requirements?</legend>
            <p className="field-helper">Optional - select anything that matters to your team.</p>
            <CheckboxGrid
              options={requirementOptions}
              selected={form.requirements_selected}
              onToggle={toggleRequirement}
            />
            {form.requirements_selected.includes('Minimum GPA') && (
              <label>
                Minimum GPA
                <input
                  min="0"
                  max="4"
                  step="0.1"
                  type="number"
                  value={form.minimum_gpa}
                  onChange={(event) => updateField('minimum_gpa', event.target.value)}
                  placeholder="3.0"
                />
              </label>
            )}
            {form.requirements_selected.includes('Has a portfolio') && (
              <div className="conditional-box">
                <strong>Portfolio requirement</strong>
                <label className={form.portfolio_link_required ? 'check-option selected' : 'check-option'}>
                  <input
                    type="checkbox"
                    checked={form.portfolio_link_required}
                    onChange={() => updateField('portfolio_link_required', !form.portfolio_link_required)}
                  />
                  <span>Ask candidates to provide a portfolio link</span>
                </label>
                <label className={form.portfolio_upload_enabled ? 'check-option selected' : 'check-option'}>
                  <input
                    type="checkbox"
                    checked={form.portfolio_upload_enabled}
                    onChange={() => setForm((current) => ({
                      ...current,
                      portfolio_upload_enabled: !current.portfolio_upload_enabled,
                      portfolio_file: current.portfolio_upload_enabled ? null : current.portfolio_file,
                    }))}
                  />
                  <span>Upload a portfolio / reference file</span>
                </label>
                {form.portfolio_upload_enabled && (
                  <label>
                    Upload portfolio / reference file
                    <span className="field-helper">
                      Optional - upload a portfolio or reference that helps candidates understand the level/style you are looking for.
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(event) => updatePortfolioFile(event.target.files?.[0] || null)}
                    />
                    <span className="field-helper">PDF, PNG, JPG - Max 10 MB</span>
                  </label>
                )}
              </div>
            )}
            {form.requirements_selected.includes('Has experience with specific software/tools') && (
              <div className="conditional-box">
                <strong>Which tools?</strong>
                <CheckboxGrid
                  options={toolOptions}
                  selected={form.required_tools}
                  onToggle={toggleTool}
                />
                {form.required_tools.includes('Other') && (
                  <input
                    value={form.other_tool}
                    onChange={(event) => updateField('other_tool', event.target.value)}
                    placeholder="Other tools, separated by commas if needed"
                  />
                )}
              </div>
            )}
          </fieldset>
          <label className="wide">
            Anything else?
            <textarea
              value={form.requirements}
              onChange={(event) => updateField('requirements', event.target.value)}
              placeholder="e.g. Prefer someone who has worked on an interactive web project before."
              rows="4"
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={saving}>
          {saving ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Find Matches')}
        </button>
      </form>
    </main>
  );
}

function MatchCard({ request, connectionState, onView }) {
  return (
    <article className="match-card">
      <div className="score">
        <Sparkles size={18} />
        {request.matchScore}% Match
      </div>
      {request.ruleBasedScore !== undefined && request.ruleBasedScore !== request.matchScore && (
        <p className="note">Standard score: {request.ruleBasedScore}%</p>
      )}
      <h3>{displayName(request.profile.full_name)} {request.profile.is_demo && <DemoBadge />}</h3>
      <p>{universityLabel(request.profile.university)} | {schoolLabel(request.profile.school)} | {request.profile.major}</p>
      <p className={request.profile.is_available === false ? 'note unavailable-text' : 'note'}>
        {request.profile.is_available === false ? 'Unavailable' : reviewSummaryLabel(request.profile)}
      </p>
      <div className="match-meta">
        <span>{getCourseDisplay(request)}</span>
        <span>{getSessionDisplay(request)}</span>
        <span>{getInitialNeeded(request)} {getInitialNeeded(request) === 1 ? 'spot' : 'spots'} remaining</span>
      </div>
      <div className="mini-detail">
        <strong>Skills they have</strong>
        <span>{joinList(request.profile.skills)}</span>
      </div>
      <div className="mini-detail">
        <strong>Looking for</strong>
        <span>{joinList(request.skills_needed)}</span>
      </div>
      <div className="mini-detail">
        <strong>Work style</strong>
        <span>{joinList(getWorkStyles(request))}</span>
      </div>
      <div className="mini-detail">
        <strong>Why this match</strong>
        <span>{request.aiExplanation || 'Calculated using standard matching.'}</span>
      </div>
      {request.aiStrengths?.length > 0 && (
        <div className="mini-detail">
          <strong>Strengths</strong>
          <span>{joinList(request.aiStrengths)}</span>
        </div>
      )}
      {request.aiGaps?.length > 0 && (
        <div className="mini-detail">
          <strong>Potential gaps</strong>
          <span>{joinList(request.aiGaps)}</span>
        </div>
      )}
      <ConnectionStateBadge state={connectionState} />
      <button className="secondary" onClick={() => onView(request.id, request.matchScore)}>
        View Profile
      </button>
    </article>
  );
}

function MatchResults({ requestId, currentProfileId, onViewProfile, onViewCurrent, onCreateNew, onSelectRequest }) {
  const [state, setState] = useState({
    activeLoading: true,
    matchesLoading: false,
    error: '',
    data: null,
    activeRequests: [],
    progressById: {},
    connectionsByProfile: {},
  });

  useEffect(() => {
    let alive = true;

    if (!currentProfileId) {
      setState((current) => ({
        ...current,
        activeLoading: false,
        activeRequests: [],
        progressById: {},
      }));
      return () => {
        alive = false;
      };
    }

    setState((current) => ({ ...current, activeLoading: true, error: '' }));

    listMyTeamRequests(currentProfileId)
      .then(async (requests) => {
        const activeRequests = requests.filter((request) => request.status === 'looking');
        const progressEntries = await Promise.all(
          activeRequests.map(async (request) => {
            try {
              return [request.id, await getTeamRequestProgress(request.id, currentProfileId)];
            } catch {
              return [request.id, { found_count: 0, teammates: [] }];
            }
          }),
        );

        if (!alive) return;

        const selectedRequestExists = activeRequests.some((request) => request.id === requestId);
        const nextRequestId = selectedRequestExists ? requestId : activeRequests[0]?.id || '';

        setState((current) => ({
          ...current,
          activeLoading: false,
          activeRequests,
          progressById: Object.fromEntries(progressEntries),
        }));

        if (nextRequestId !== requestId) {
          onSelectRequest(nextRequestId);
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            activeLoading: false,
            activeRequests: [],
            progressById: {},
            error: "We couldn't load your active requests right now. Please try again.",
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [currentProfileId, requestId]);

  useEffect(() => {
    let alive = true;

    if (!requestId) {
      setState((current) => ({
        ...current,
        matchesLoading: false,
        data: null,
        connectionsByProfile: {},
      }));
      return () => {
        alive = false;
      };
    }

    setState((current) => ({ ...current, matchesLoading: true, error: '', data: null }));

    getMatchesForRequest(requestId)
      .then(async (data) => {
        const connectionEntries = currentProfileId
          ? await Promise.all(
            [...new Set(data.matches.map((request) => request.profile_id))]
              .map(async (profileId) => {
                try {
                  return [profileId, await getConnectionBetween(currentProfileId, profileId, 'team_request')];
                } catch {
                  return [profileId, null];
                }
              }),
          )
          : [];
        if (alive) {
          setState((current) => ({
            ...current,
            matchesLoading: false,
            error: '',
            data,
            connectionsByProfile: Object.fromEntries(connectionEntries),
          }));
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            matchesLoading: false,
            error: "We couldn't load teammates right now. Please try again.",
            data: null,
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId, currentProfileId]);

  if (state.activeLoading) {
    return <main className="screen compact"><p className="loading">Loading teammates...</p></main>;
  }

  if (!currentProfileId || state.activeRequests.length === 0) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>You need an active team request before we can find teammates for you.</p>
          <button className="primary" onClick={onCreateNew}>Create Team Request</button>
        </section>
      </main>
    );
  }

  if (state.error && !state.data) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>{state.error}</p>
          <button className="secondary" onClick={onCreateNew}>Create New Search</button>
        </section>
      </main>
    );
  }

  if (state.matchesLoading || !state.data) {
    return <main className="screen compact"><p className="loading">Loading teammates...</p></main>;
  }

  const { currentRequest, matches } = state.data;
  const selectedProgress = state.progressById[currentRequest.id] || { found_count: 0, teammates: [] };
  const selectedMetrics = getTeamProgress(currentRequest, selectedProgress);
  const visibleMatches = [...matches]
    .sort((a, b) =>
      b.matchScore - a.matchScore
      || Number(Boolean(a.profile?.is_demo)) - Number(Boolean(b.profile?.is_demo))
      || new Date(b.created_at) - new Date(a.created_at),
    );

  const handleRequestChange = (value) => {
    if (value === '__new__') {
      onCreateNew();
      return;
    }

    if (value && value !== requestId) {
      onSelectRequest(value);
    }
  };

  return (
    <main className="screen results">
      <StepRail step={2} />
      <div className="results-header">
        <div>
          <p className="eyebrow">Match Results</p>
          <h2>Find teammates by request</h2>
        </div>
        <button className="secondary" onClick={onViewCurrent}>
          <Clock3 size={18} />
          My Current Request
        </button>
      </div>

      <section className="request-switcher-panel">
        <label>
          Match Results for
          {state.activeRequests.length > 1 ? (
            <select value={currentRequest.id} onChange={(event) => handleRequestChange(event.target.value)}>
              {state.activeRequests.map((request) => (
                <option value={request.id} key={request.id}>
                  {request.id === currentRequest.id ? '✓ ' : ''}{getCourseDisplay(request)} | {getSessionDisplay(request)}
                </option>
              ))}
              <option value="__new__">+ Create New Request</option>
            </select>
          ) : (
            <div className="static-request-name">{getCourseDisplay(currentRequest)}</div>
          )}
        </label>
        <div className="request-context-summary">
          <h3>{getCourseDisplay(currentRequest)}</h3>
          <p>Looking for: {joinList(currentRequest.skills_needed)}</p>
          <p>{progressSummary(selectedMetrics)}</p>
          <p>{remainingSummary(selectedMetrics)}</p>
        </div>
      </section>

      {matches.length === 0 ? (
        <section className="empty-state">
          <p>No active teammate searches are available right now.</p>
          <button className="primary" onClick={onCreateNew}>Create Another Search</button>
        </section>
      ) : visibleMatches.length === 0 ? (
        <section className="empty-state">
          <p>No teammates match your current search yet. Try changing your criteria.</p>
          <button className="primary" onClick={onCreateNew}>Create Another Search</button>
        </section>
      ) : (
        <div className="match-grid">
          {visibleMatches.map((request) => (
            <MatchCard
              request={request}
              connectionState={getConnectionState(state.connectionsByProfile[request.profile_id], currentProfileId)}
              key={request.id}
              onView={onViewProfile}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function DiscoverPage({ currentProfileId, onOpenProfile }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    profiles: [],
    activeRequests: [],
    connectionsByProfile: {},
    sentByProfile: {},
    sendingProfileId: '',
    modalProfile: null,
    modalError: '',
  });
  const [filters, setFilters] = useState({ university: '', school: '', major: '', course: '', skill: '' });

  useEffect(() => {
    let alive = true;

    Promise.all([getDiscoverProfiles(), getActiveTeamRequests()])
      .then(async ([profiles, activeRequests]) => {
        const visibleProfiles = profiles.filter((profile) => profile.id !== currentProfileId);
        const connectionEntries = currentProfileId
          ? await Promise.all(
            visibleProfiles.map(async (profile) => {
              try {
                return [profile.id, await getConnectionBetween(currentProfileId, profile.id)];
              } catch {
                return [profile.id, null];
              }
            }),
          )
          : [];
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: '',
            profiles,
            activeRequests,
            connectionsByProfile: Object.fromEntries(connectionEntries),
          }));
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: "We couldn't load students right now. Please try again.",
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [currentProfileId]);

  const requestsByProfile = state.activeRequests.reduce((map, request) => {
    map[request.profile_id] = [...(map[request.profile_id] || []), request];
    return map;
  }, {});
  const discoverCourseOptions = (filters.school
    ? getCoursesForSchool(filters.school)
    : getAllCourses()
  ).filter((course, index, list) => list.findIndex((item) => item.code === course.code) === index);
  const filteredProfiles = state.profiles
    .filter((profile) => profile.id !== currentProfileId)
    .filter((profile) => !filters.university || (profile.university || 'RMIT University') === filters.university)
    .filter((profile) => !filters.school || profile.school === filters.school)
    .filter((profile) => !filters.major || profile.major === filters.major)
    .filter((profile) => !filters.course || requestsByProfile[profile.id]?.some((request) => courseMatchesFilter(request, filters.course)))
    .filter((profile) => !filters.skill || profile.skills?.includes(filters.skill));

  const availableMajors = filters.school
    ? majorsBySchool[filters.school] || []
    : [...new Set(Object.values(majorsBySchool).flat())];
  const discoverSkillOptions = getAllSkills().filter((skill) => skill !== 'Other');

  const sendDiscoverConnect = async (introMessage) => {
    if (!state.modalProfile) return;
    setState((current) => ({ ...current, sendingProfileId: state.modalProfile.id, modalError: '' }));

    try {
      const connection = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: state.modalProfile.id,
        senderTeamRequestId: null,
        introMessage,
      });
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        modalProfile: null,
        sentByProfile: {
          ...current.sentByProfile,
          [state.modalProfile.id]: connection,
        },
      }));
    } catch {
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        modalError: "We couldn't send your connection request. Please try again.",
      }));
    }
  };

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">Discover</p>
          <h2>Explore students across schools</h2>
          <p>Discover is for networking and future projects, not a course-specific team request.</p>
        </div>
      </div>

      <section className="filter-panel">
        <label>
          University
          <select
            value={filters.university}
            onChange={(event) => setFilters((current) => ({ ...current, university: event.target.value }))}
          >
            <option value="">All universities</option>
            {universityOptions.map((university) => (
              <option value={university.value} key={university.value}>{university.label}</option>
            ))}
          </select>
        </label>
        <label>
          School
          <select
            value={filters.school}
            onChange={(event) => setFilters({ school: event.target.value, major: '', course: '', skill: filters.skill })}
          >
            <option value="">All schools</option>
            {schoolOptions.map((school) => (
              <option value={school.value} key={school.value}>{school.label}</option>
            ))}
          </select>
        </label>
        <label>
          Major
          <select value={filters.major} onChange={(event) => setFilters((current) => ({ ...current, major: event.target.value }))}>
            <option value="">All majors</option>
            {availableMajors.map((major) => (
              <option value={major} key={major}>{major}</option>
            ))}
          </select>
        </label>
        <label>
          Course
          <select value={filters.course} onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}>
            <option value="">All courses</option>
            {discoverCourseOptions.map((course) => (
              <option value={course.code} key={course.code}>{formatCourseOption(course)}</option>
            ))}
          </select>
        </label>
        <label>
          Skills
          <select value={filters.skill} onChange={(event) => setFilters((current) => ({ ...current, skill: event.target.value }))}>
            <option value="">All skills</option>
            {discoverSkillOptions.map((skill) => (
              <option value={skill} key={skill}>{skill}</option>
            ))}
          </select>
        </label>
      </section>

      {state.loading && <p className="loading">Loading students...</p>}
      {state.error && <p className="error">{state.error}</p>}
      {!state.loading && filteredProfiles.length === 0 && (
        <section className="empty-state">
          <p>No students match these filters yet.</p>
        </section>
      )}

      {!state.loading && filteredProfiles.length > 0 && (
        <div className="discover-grid">
          {filteredProfiles.map((profile) => {
            const disabledReason = !currentProfileId
                ? 'Create a profile before connecting.'
                : '';
            const connection = state.sentByProfile[profile.id] || state.connectionsByProfile[profile.id];
            const connectionState = getConnectionState(connection, currentProfileId);

            return (
              <article className="discover-card" key={profile.id}>
                <div className="avatar">{displayInitial(profile.full_name)}</div>
                <h3>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />}</h3>
                <p>{universityLabel(profile.university)}</p>
                <p>{schoolLabel(profile.school)}</p>
                <p>{profile.major}</p>
                <p className="note">{profile.is_available === false ? 'Unavailable' : reviewSummaryLabel(profile)}</p>
                {requestsByProfile[profile.id]?.[0] && (
                  <p>{getCourseDisplay(requestsByProfile[profile.id][0])}</p>
                )}
                <p>{profile.short_bio || 'No bio added yet.'}</p>
                <div className="mini-detail">
                  <strong>Skills they have</strong>
                  <span>{joinList(profile.skills)}</span>
                </div>
                <ConnectionStateBadge state={connectionState} />
                <ConnectionRelationshipBadge connection={connection} />
                <div className="hero-actions">
                  <button
                    className="secondary"
                    onClick={() => onOpenProfile(profile.id)}
                  >
                    View Profile
                  </button>
                  {disabledReason ? (
                    <button className="disabled-contact compact-disabled" disabled>
                      <UserPlus size={18} />
                      Connect
                    </button>
                  ) : connectionState === 'accepted' ? (
                    <button className="connected-button" disabled>
                      <CheckCircle2 size={18} />
                      {connectedButtonLabel(connection)}
                    </button>
                  ) : connectionState === 'sent_pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>Request Sent</button>
                  ) : connectionState === 'received_pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>Respond to Request</button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => setState((current) => ({ ...current, modalProfile: profile, modalError: '' }))}
                    >
                      <UserPlus size={18} />
                      Connect
                    </button>
                  )}
                </div>
                {disabledReason && <p className="connection-hint">{disabledReason}</p>}
              </article>
            );
          })}
        </div>
      )}

      {state.modalProfile && (
        <ConnectModal
          receiverName={displayName(state.modalProfile.full_name)}
          sending={state.sendingProfileId === state.modalProfile.id}
          error={state.modalError}
          onClose={() => setState((current) => ({ ...current, modalProfile: null, modalError: '' }))}
          onSend={sendDiscoverConnect}
        />
      )}
    </main>
  );
}

function DiscoverProfileDetail({ profileId, currentProfileId, onBack, onOpenChat, onOpenConnections }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    profile: null,
    activeRequest: null,
    connection: null,
    reviews: [],
    modalOpen: false,
    sending: false,
    simulating: false,
    actionError: '',
    actionSuccess: '',
    unmatchOpen: false,
    unmatchSaving: false,
  });

  useEffect(() => {
    let alive = true;

    getProfileById(profileId)
      .then(async (profile) => {
        const [connection, activeRequests] = await Promise.all([
          currentProfileId ? getConnectionBetween(currentProfileId, profile.id) : Promise.resolve(null),
          getActiveTeamRequests().catch(() => []),
        ]);
        const reviews = await listProfileReviews(profile.id).catch(() => []);
        const activeRequest = activeRequests.find((request) => request.profile_id === profile.id) || null;
        if (alive) {
          setState((current) => ({ ...current, loading: false, error: '', profile, activeRequest, connection, reviews }));
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: "We couldn't load this profile right now. Please try again.",
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [profileId, currentProfileId]);

  if (state.loading) {
    return <main className="screen compact"><p className="loading">Loading profile...</p></main>;
  }

  if (state.error) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const profile = state.profile;
  const isOwnProfile = profile.id === currentProfileId;
  const connectionState = getConnectionState(state.connection, currentProfileId);
  const reviewTeamRequestId = state.connection?.connection_context === 'team_request' && state.connection?.relationship_type === 'teammate'
    ? state.connection.sender_team_request_id || state.connection.receiver_team_request_id || state.activeRequest?.id
    : null;
  const disabledReason = isOwnProfile
      ? 'This is your profile.'
      : !currentProfileId
        ? 'Create a profile before connecting.'
        : '';

  const sendConnect = async (introMessage) => {
    setState((current) => ({ ...current, sending: true, actionError: '' }));

    try {
      const connection = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: profile.id,
        senderTeamRequestId: null,
        introMessage,
      });
      setState((current) => ({
        ...current,
        sending: false,
        modalOpen: false,
        connection: {
          ...connection,
          sender_profile_id: currentProfileId,
          receiver_profile_id: profile.id,
        },
      }));
    } catch {
      setState((current) => ({
        ...current,
        sending: false,
        actionError: "We couldn't send your connection request. Please try again.",
      }));
    }
  };

  const simulateAcceptance = async () => {
    setState((current) => ({ ...current, simulating: true, actionError: '' }));

    try {
      const accepted = await simulateDemoAcceptance(state.connection.id, currentProfileId);
      setState((current) => ({
        ...current,
        simulating: false,
        connection: { ...current.connection, ...accepted, status: 'accepted' },
      }));
    } catch {
      setState((current) => ({
        ...current,
        simulating: false,
        actionError: "We couldn't simulate demo acceptance. Please try again.",
      }));
    }
  };

  const resetDemo = async () => {
    if (!state.connection) return;
    await resetDemoConnection(state.connection.id, currentProfileId);
    setState((current) => ({ ...current, connection: null, actionError: '' }));
  };

  const unmatch = async (reason, note) => {
    setState((current) => ({ ...current, unmatchSaving: true, actionError: '' }));

    try {
      const updated = await unmatchConnectionRequest({
        connectionId: state.connection.id,
        currentProfileId,
        reason,
        note,
      });
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        unmatchOpen: false,
        connection: { ...current.connection, ...updated, status: 'unmatched' },
        actionSuccess: `You are no longer connected with ${displayName(profile.full_name)}.`,
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: "We couldn't unmatch this connection. Please try again.",
      }));
    }
  };

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to Discover
      </button>
      <section className="profile-panel standalone">
        <div className="avatar">{displayInitial(profile.full_name)}</div>
        <p className="eyebrow">Discover Profile</p>
        <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />}</h2>
        <p>{profile.short_bio || 'No bio added yet.'}</p>
        <dl>
          <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
          <div><dt>University</dt><dd>{universityLabel(profile.university)}</dd></div>
          <div><dt>Major</dt><dd>{profile.major}</dd></div>
          <div><dt>Availability</dt><dd>{profile.is_available === false ? 'Unavailable' : 'Available for collaboration'}</dd></div>
          <div><dt>Skills they have</dt><dd>{joinList(profile.skills)}</dd></div>
          <div>
            <dt>Contact</dt>
            <dd>
              {profile.contact_value
                ? `${contactLabel(profile.contact_type)}: ${profile.contact_value}`
                : state.connection?.status === 'accepted'
                  ? 'Not specified'
                  : 'Visible after connecting'}
            </dd>
          </div>
        </dl>
        <ReviewsSection profile={profile} reviews={state.reviews} />
        {state.activeRequest && (
          <div className="request-summary-box">
            <p className="eyebrow">Looking for a Teammate</p>
            <h3>{getCourseDisplay(state.activeRequest)}</h3>
            <dl>
              <div><dt>Class / Session</dt><dd>{getSessionDisplay(state.activeRequest)}</dd></div>
              <div><dt>Skills Needed</dt><dd>{joinList(state.activeRequest.skills_needed)}</dd></div>
              <div><dt>Work Style</dt><dd>{joinList(getWorkStyles(state.activeRequest))}</dd></div>
              <div><dt>Requirements</dt><dd>{describeRequirements(state.activeRequest)}</dd></div>
              <div><dt>Team Size</dt><dd>{getTotalTeamSize(state.activeRequest)}</dd></div>
              <div><dt>Looking For</dt><dd>{getInitialNeeded(state.activeRequest)} {getInitialNeeded(state.activeRequest) === 1 ? 'spot' : 'spots'}</dd></div>
              <PortfolioReference request={state.activeRequest} />
            </dl>
          </div>
        )}
        <TeammateFeedbackPanel
          connection={state.connection}
          currentProfileId={currentProfileId}
          reviewedProfileId={profile.id}
          teamRequestId={reviewTeamRequestId}
        />
        {state.actionError && <p className="error">{state.actionError}</p>}
        {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
        {disabledReason ? (
          <div className="stacked-actions">
            <button className="disabled-contact" disabled>
              <UserPlus size={18} />
              Connect
            </button>
            <p className="connection-hint">{disabledReason}</p>
          </div>
        ) : connectionState === 'accepted' ? (
          <div className="stacked-actions">
            <button className="connected-button" disabled>
              <CheckCircle2 size={18} />
              {connectedButtonLabel(state.connection)}
            </button>
            <ConnectionRelationshipBadge connection={state.connection} />
            <button className="primary link-button" onClick={() => onOpenChat(state.connection.id)}>
              <MessageCircle size={18} />
              Message
            </button>
            <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
              Unmatch
            </button>
          </div>
        ) : connectionState === 'sent_pending' ? (
          <button className="disabled-contact" disabled>Request Sent</button>
        ) : connectionState === 'received_pending' ? (
          <button className="secondary link-button" onClick={onOpenConnections}>Respond to Request</button>
        ) : (
          <button className="primary link-button" onClick={() => setState((current) => ({ ...current, modalOpen: true, actionError: '' }))}>
            <UserPlus size={18} />
            Connect
          </button>
        )}
        {profile.is_demo && (
          <DemoSimulationPanel
            connection={state.connection}
            accepting={state.simulating}
            onAccept={simulateAcceptance}
            onStartChat={() => onOpenChat(state.connection.id)}
            onViewConnection={null}
            onReset={resetDemo}
          />
        )}
      </section>

      {state.modalOpen && (
        <ConnectModal
          receiverName={displayName(profile.full_name)}
          sending={state.sending}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, modalOpen: false, actionError: '' }))}
          onSend={sendConnect}
        />
      )}
      {state.unmatchOpen && (
        <UnmatchModal
          teammateName={displayName(profile.full_name)}
          saving={state.unmatchSaving}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, unmatchOpen: false, actionError: '' }))}
          onConfirm={unmatch}
        />
      )}
    </main>
  );
}

function ReviewsSection({ reviews = [], profile, title = 'Existing Reviews' }) {
  return (
    <section className="request-summary-box">
      <p className="eyebrow">{title}</p>
      <h3>{reviewSummaryLabel(profile, reviews)}</h3>
      {reviews.length === 0 ? (
        <p className="note">No teammate reviews yet.</p>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              {review.is_demo && <span className="status-badge pending">Demo Review</span>}
              <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
              {review.review_text && <p>"{review.review_text}"</p>}
              {review.course_name && <span>Course: {review.course_name}</span>}
              {review.review_context && <span>Reviewed after: {review.review_context}</span>}
              <span>{review.reviewer_name || 'A teammate'}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TeammateFeedbackPanel({ connection, currentProfileId, reviewedProfileId, teamRequestId }) {
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!connection || connection.status !== 'accepted' || connection.relationship_type !== 'teammate' || !teamRequestId) {
    return null;
  }

  const submitReview = async (event) => {
    event.preventDefault();
    setSaving('review');
    setMessage('');
    setError('');

    try {
      await createReview({
        reviewerProfileId: currentProfileId,
        reviewedProfileId,
        connectionId: connection.id,
        teamRequestId,
        rating: Number(reviewRating),
        reviewText,
      });
      setMessage('Teammate review saved.');
    } catch (err) {
      setError(getFriendlyError(err, "We couldn't save your review. Please try again."));
    } finally {
      setSaving('');
    }
  };

  return (
    <section className="request-summary-box">
      <p className="eyebrow">Write a Teammate Review</p>
      <form className="feedback-form" onSubmit={submitReview}>
        <h3>How was it working with this teammate?</h3>
        <div>
          <strong>Teammate rating</strong>
          <div className="star-rating" role="radiogroup" aria-label="Teammate rating">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                className={Number(reviewRating) >= rating ? 'selected' : ''}
                key={rating}
                type="button"
                onClick={() => setReviewRating(rating)}
                aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
              >
                <Star size={22} fill="currentColor" strokeWidth={2.2} />
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={reviewText}
          onChange={(event) => setReviewText(event.target.value)}
          rows="4"
          placeholder="e.g. Reliable, communicates clearly, and completed tasks on time."
        />
        <button className="secondary" type="submit" disabled={saving === 'review'}>
          {saving === 'review' ? 'Saving...' : 'Submit Teammate Review'}
        </button>
      </form>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function MatchUsefulnessPanel({ request, currentProfileId, teamComplete }) {
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!request || !currentProfileId || !teamComplete) return null;

  const labels = {
    1: 'Not useful',
    2: 'Not very useful',
    3: 'Okay',
    4: 'Useful',
    5: 'Very useful',
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      await createMatchFeedback({
        connectionId: null,
        teamRequestId: request.id,
        reviewerProfileId: currentProfileId,
        score: Number(rating),
        feedbackText,
      });
      setMessage('Match usefulness rating saved.');
    } catch (err) {
      setError(getFriendlyError(err, "We couldn't save match usefulness rating. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="request-summary-box">
      <p className="eyebrow">Match Usefulness Rating</p>
      <h3>How useful were Teamergency’s matches in helping you form this team?</h3>
      <p className="note">This rating is about the quality of Teamergency’s match recommendation, not the other person.</p>
      <form className="feedback-form" onSubmit={submit}>
        <div className="star-rating" role="radiogroup" aria-label="Match usefulness rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              className={Number(rating) >= value ? 'selected' : ''}
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} stars - ${labels[value]}`}
            >
              <Star size={22} fill="currentColor" strokeWidth={2.2} />
            </button>
          ))}
        </div>
        <strong>{labels[rating]}</strong>
        <textarea
          value={feedbackText}
          onChange={(event) => setFeedbackText(event.target.value)}
          rows="3"
          placeholder="What worked well or what could improve?"
        />
        <button className="secondary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Submit Match Usefulness Rating'}
        </button>
      </form>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function ProfileDetail({
  requestId,
  currentProfileId,
  currentRequestId,
  matchScore,
  onBack,
  onOpenChat,
  onOpenConnections,
}) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    request: null,
    connection: null,
    reviews: [],
    actionError: '',
    actionSuccess: '',
    actionLoading: false,
    connectModalOpen: false,
    simulating: false,
    unmatchOpen: false,
    unmatchSaving: false,
  });

  useEffect(() => {
    let alive = true;

    getTeamRequestById(requestId)
      .then(async (request) => {
        const connection = currentProfileId
          ? await getConnectionBetween(currentProfileId, request.profile.id, 'team_request')
          : null;
        const reviews = await listProfileReviews(request.profile.id).catch(() => []);

        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: '',
            request,
            connection,
            reviews,
          }));
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: "We couldn't load teammates right now. Please try again.",
            request: null,
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId]);

  if (state.loading) {
    return <main className="screen compact"><p className="loading">Loading profile...</p></main>;
  }

  if (state.error) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const request = state.request;
  const profile = request.profile;
  const isOwnProfile = currentProfileId === profile.id;
  const canSendConnection = currentProfileId && !isOwnProfile;
  const connection = state.connection;
  const connectionState = getConnectionState(connection, currentProfileId);
  const feedbackTeamRequestId = connection?.relationship_type === 'teammate'
    ? (
        connection?.sender_profile_id === currentProfileId
          ? connection.sender_team_request_id
          : connection?.receiver_team_request_id || request.id
      )
    : null;

  const connect = async (introMessage) => {
    setState((current) => ({ ...current, actionLoading: true, actionError: '' }));

    try {
      const created = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: profile.id,
        senderTeamRequestId: currentRequestId || null,
        introMessage,
      });
      setState((current) => ({
        ...current,
        actionLoading: false,
        connectModalOpen: false,
        connection: {
          ...created,
          sender_profile_id: currentProfileId,
          receiver_profile_id: profile.id,
        },
      }));
    } catch {
      setState((current) => ({
        ...current,
        actionLoading: false,
        actionError: "We couldn't send your connection request. Please try again.",
      }));
    }
  };

  const simulateAcceptance = async () => {
    setState((current) => ({ ...current, simulating: true, actionError: '' }));

    try {
      const accepted = await simulateDemoAcceptance(connection.id, currentProfileId);
      setState((current) => ({
        ...current,
        simulating: false,
        connection: { ...current.connection, ...accepted, status: 'accepted' },
      }));
    } catch {
      setState((current) => ({
        ...current,
        simulating: false,
        actionError: "We couldn't simulate demo acceptance. Please try again.",
      }));
    }
  };

  const resetDemo = async () => {
    if (!connection) return;
    await resetDemoConnection(connection.id, currentProfileId);
    setState((current) => ({ ...current, connection: null, actionError: '' }));
  };

  const unmatch = async (reason, note) => {
    setState((current) => ({ ...current, unmatchSaving: true, actionError: '' }));

    try {
      const updated = await unmatchConnectionRequest({
        connectionId: connection.id,
        currentProfileId,
        reason,
        note,
      });
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        unmatchOpen: false,
        connection: { ...current.connection, ...updated, status: 'unmatched' },
        actionSuccess: `You are no longer connected with ${displayName(profile.full_name)}.`,
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: "We couldn't unmatch this connection. Please try again.",
      }));
    }
  };

  const renderConnectionAction = () => {
    if (isOwnProfile) {
      return (
        <div className="stacked-actions">
          <button className="disabled-contact" disabled>
            <UserPlus size={18} />
            Connect
          </button>
          <p className="connection-hint">This is your profile.</p>
        </div>
      );
    }

    if (!currentProfileId) {
      return (
        <div className="stacked-actions">
          <button className="disabled-contact" disabled>
            <UserPlus size={18} />
            Connect
          </button>
          <p className="connection-hint">Create a profile before connecting.</p>
        </div>
      );
    }

    if (connectionState === 'none') {
      return (
        <button
          className="primary link-button"
          onClick={() => setState((current) => ({ ...current, connectModalOpen: true, actionError: '' }))}
          disabled={!canSendConnection || state.actionLoading}
        >
          <UserPlus size={18} />
          Connect
        </button>
      );
    }

    if (connectionState === 'sent_pending') {
      return <button className="disabled-contact" disabled>Request Sent</button>;
    }

    if (connectionState === 'received_pending') {
      return (
        <button className="secondary link-button" onClick={onOpenConnections}>
          Respond to Request
        </button>
      );
    }

    if (connectionState === 'accepted') {
      return (
        <div className="stacked-actions">
          <button className="connected-button" disabled>
            <CheckCircle2 size={18} />
            {connectedButtonLabel(connection)}
          </button>
          <ConnectionRelationshipBadge connection={connection} />
          <button className="primary link-button" onClick={() => onOpenChat(connection.id)}>
            <MessageCircle size={18} />
            Message
          </button>
          <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
            Unmatch
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <main className="screen detail">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to Matches
      </button>

      <section className="detail-layout">
        <div className="profile-panel">
          <div className="avatar">{displayInitial(profile.full_name)}</div>
          <p className="eyebrow">Profile Data</p>
          <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />}</h2>
          <p>{profile.short_bio || 'No bio added yet.'}</p>
          <dl>
            <div><dt>University</dt><dd>{universityLabel(profile.university)}</dd></div>
            <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
            <div><dt>Major</dt><dd>{profile.major}</dd></div>
            <div><dt>Availability</dt><dd>{profile.is_available === false ? 'Unavailable' : 'Available for collaboration'}</dd></div>
            <div><dt>Reviews</dt><dd>{reviewSummaryLabel(profile)}</dd></div>
            <div>
              <dt>Contact</dt>
              <dd>
                {profile.contact_value
                  ? `${contactLabel(profile.contact_type)}: ${profile.contact_value}`
                  : connection?.status === 'accepted'
                    ? 'Not specified'
                    : 'Visible after connecting'}
              </dd>
            </div>
          </dl>
          <div className="mini-detail">
            <strong>Skills they have</strong>
            <span>{joinList(profile.skills)}</span>
          </div>
          {state.actionError && <p className="error">{state.actionError}</p>}
          {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
          {renderConnectionAction()}
          <ReviewsSection profile={profile} reviews={state.reviews} />
          {profile.is_demo && (
            <DemoSimulationPanel
              connection={connection}
              accepting={state.simulating}
              onAccept={simulateAcceptance}
              onStartChat={() => onOpenChat(connection.id)}
              onViewConnection={null}
              onReset={resetDemo}
            />
          )}
        </div>

        <div className="request-panel">
          <p className="eyebrow">Looking for a Teammate</p>
          <h3>{getCourseDisplay(request)}</h3>
          <dl>
            {typeof matchScore === 'number' && <div><dt>Match Score</dt><dd>{matchScore}% Match</dd></div>}
            <div><dt>School</dt><dd>{schoolLabel(request.school || profile.school)}</dd></div>
            <div><dt>Major</dt><dd>{request.major || profile.major}</dd></div>
            <div><dt>Class / Session</dt><dd>{getSessionDisplay(request)}</dd></div>
            <div><dt>Skills Needed</dt><dd>{joinList(request.skills_needed)}</dd></div>
            <div><dt>Team Size</dt><dd>{getTotalTeamSize(request)}</dd></div>
            <div><dt>Looking For</dt><dd>{getInitialNeeded(request)} {getInitialNeeded(request) === 1 ? 'spot' : 'spots'}</dd></div>
            <div><dt>Work Style</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
            <div><dt>Requirements</dt><dd>{describeRequirements(request)}</dd></div>
            <PortfolioReference request={request} />
          </dl>
          {currentRequestId === request.id && <p className="note">This is your current request.</p>}
          <TeammateFeedbackPanel
            connection={connection}
            currentProfileId={currentProfileId}
            reviewedProfileId={profile.id}
            teamRequestId={feedbackTeamRequestId}
          />
        </div>
      </section>
      {state.connectModalOpen && (
        <ConnectModal
          receiverName={displayName(profile.full_name)}
          sending={state.actionLoading}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, connectModalOpen: false, actionError: '' }))}
          onSend={connect}
        />
      )}
      {state.unmatchOpen && (
        <UnmatchModal
          teammateName={displayName(profile.full_name)}
          saving={state.unmatchSaving}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, unmatchOpen: false, actionError: '' }))}
          onConfirm={unmatch}
        />
      )}
    </main>
  );
}

function CurrentRequest({
  requestId,
  currentProfileId,
  profile,
  onBack,
  onOpenChat,
  onViewProfile,
  onSelectRequest,
  onCreateNew,
}) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    requests: [],
    progressById: {},
    selectedId: requestId || '',
    editingRequest: null,
    cancelTarget: null,
    saving: false,
    success: '',
    dismissedComplete: false,
    dismissedReopen: false,
  });

  const loadRequests = () => {
    let alive = true;

    if (!currentProfileId) {
      setState((current) => ({ ...current, loading: false, requests: [], progressById: {} }));
      return () => { alive = false; };
    }

    listMyTeamRequests(currentProfileId)
      .then(async (requests) => {
        const progressEntries = await Promise.all(
          requests.map(async (request) => {
            try {
              return [request.id, await getTeamRequestProgress(request.id, currentProfileId)];
            } catch {
              return [request.id, { found_count: 0, teammates: [] }];
            }
          }),
        );

        if (alive) {
          const stillSelected = requests.some((request) => request.id === (requestId || state.selectedId));
          const currentMatchRequest = requests.find((request) => request.id === requestId && request.status === 'looking');
          const nextMatchRequest = currentMatchRequest || requests.find((request) => request.status === 'looking') || null;
          const nextSelectedId = stillSelected
            ? requestId || state.selectedId
            : nextMatchRequest?.id || requests[0]?.id || '';

          setState((current) => ({
            ...current,
            loading: false,
            error: '',
            requests,
            progressById: Object.fromEntries(progressEntries),
            selectedId: nextSelectedId,
            saving: false,
          }));

          if ((nextMatchRequest?.id || '') !== requestId) {
            onSelectRequest(nextMatchRequest?.id || '');
          }
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: "We couldn't load teammates right now. Please try again.",
            saving: false,
          }));
        }
      });

    return () => { alive = false; };
  };

  useEffect(() => {
    return loadRequests();
  }, [requestId, currentProfileId]);

  const markFound = async () => {
    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      const updated = await markTeamRequestFound(state.selectedId, {
        editToken: getStoredRequestEditToken(),
      });
      setState((current) => ({
        ...current,
        saving: false,
        requests: current.requests.map((request) =>
          request.id === updated.id ? { ...request, ...updated } : request,
        ),
        success: 'Your request is marked as complete.',
      }));
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: "We couldn't update your request. Please try again.",
      }));
    }
  };

  const reopenRequest = async () => {
    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      const updated = await reopenTeamRequest(state.selectedId, currentProfileId);
      setState((current) => ({
        ...current,
        saving: false,
        requests: current.requests.map((request) =>
          request.id === updated.id ? { ...request, ...updated } : request,
        ),
        dismissedReopen: true,
        success: 'Your request is open again.',
      }));
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: "We couldn't reopen your request. Please try again.",
      }));
    }
  };

  const cancelRequest = async () => {
    const target = state.cancelTarget;
    if (!target) return;

    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      const updated = await cancelTeamRequest(target.id, currentProfileId);
      const updatedRequests = state.requests.map((request) =>
        request.id === updated.id ? { ...request, ...updated } : request,
      );
      const nextActiveRequest = updatedRequests.find((request) => request.status === 'looking');

      setState((current) => ({
        ...current,
        requests: updatedRequests,
        saving: false,
        cancelTarget: null,
        selectedId: current.selectedId === target.id ? nextActiveRequest?.id || target.id : current.selectedId,
        success: 'Request cancelled.',
      }));

      if (state.selectedId === target.id) {
        onSelectRequest(nextActiveRequest?.id || '');
      }
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: "We couldn't cancel this request. Please try again.",
      }));
    }
  };

  const selectRequest = (request) => {
    setState((current) => ({
      ...current,
      selectedId: request.id,
      dismissedComplete: false,
      dismissedReopen: false,
      success: '',
      error: '',
    }));
  };

  if (state.loading) {
    return <main className="screen compact"><p className="loading">Loading requests...</p></main>;
  }

  if (state.error && state.requests.length === 0) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const selectedRequest = state.requests.find((request) => request.id === state.selectedId) || state.requests[0] || null;
  const progress = selectedRequest ? state.progressById[selectedRequest.id] || { found_count: 0, teammates: [] } : { found_count: 0, teammates: [] };
  const teammates = progress.teammates || [];
  const metrics = getTeamProgress(selectedRequest, progress);
  const foundCount = metrics.found;
  const teamComplete = metrics.complete;
  const skillGap = calculateSkillGap(selectedRequest, profile, teammates);
  const noLongerComplete = selectedRequest?.status === 'found' && !teamComplete;
  const groupedRequests = {
    active: state.requests.filter((request) => request.status === 'looking'),
    completed: state.requests.filter((request) => request.status === 'found'),
    cancelled: state.requests.filter((request) => request.status === 'cancelled'),
  };

  const RequestRow = ({ request }) => {
    const requestProgress = state.progressById[request.id] || { found_count: 0 };
    const requestMetrics = getTeamProgress(request, requestProgress);
    const isSelected = selectedRequest?.id === request.id;

    return (
      <article className={isSelected ? 'request-list-row selected' : 'request-list-row'}>
        <div>
          <h3>{getCourseDisplay(request)}</h3>
          <p>{getSessionDisplay(request)} | {titleCase(request.status)}</p>
          <p className="note">
            {progressSummary(requestMetrics)}
            {request.status === 'looking' ? ` | ${remainingSummary(requestMetrics)}` : ''}
          </p>
        </div>
        <div className="request-row-actions">
          <button className="secondary" onClick={() => selectRequest(request)}>View Details</button>
          <button className="secondary" onClick={() => setState((current) => ({ ...current, editingRequest: request, success: '', error: '' }))}>
            <Pencil size={18} />
            Edit Request
          </button>
          {request.status === 'looking' && (
            <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, cancelTarget: request, success: '', error: '' }))}>
              <Trash2 size={18} />
              Cancel Request
            </button>
          )}
        </div>
      </article>
    );
  };

  const RequestSection = ({ title, requests }) => (
    <section className="request-list-section">
      <h3>{title}</h3>
      {requests.length === 0 ? (
        <p className="note">No {title.toLowerCase()} requests.</p>
      ) : (
        <div className="request-list">
          {requests.map((request) => <RequestRow request={request} key={request.id} />)}
        </div>
      )}
    </section>
  );

  if (state.editingRequest && profile) {
    return (
      <RequestForm
        profile={profile}
        request={state.editingRequest}
        mode="edit"
        onBack={() => setState((current) => ({ ...current, editingRequest: null, error: '', success: '' }))}
        onUpdated={async (updatedRequest) => {
          const updatedProgress = await getTeamRequestProgress(updatedRequest.id, currentProfileId)
            .catch(() => ({ found_count: 0, teammates: [] }));
          setState((current) => ({
            ...current,
            editingRequest: null,
            requests: current.requests.map((request) =>
              request.id === updatedRequest.id ? { ...request, ...updatedRequest } : request,
            ),
            progressById: {
              ...current.progressById,
              [updatedRequest.id]: updatedProgress,
            },
            selectedId: updatedRequest.id,
            success: 'Request updated successfully.',
          }));
          if (updatedRequest.status === 'looking') {
            onSelectRequest(updatedRequest.id);
          }
        }}
      />
    );
  }

  if (!selectedRequest) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>No team requests yet.</p>
          <button className="primary" onClick={onCreateNew}>
            <Plus size={18} />
            New Request
          </button>
        </section>
      </main>
    );
  }

  const request = selectedRequest;

  return (
    <main className="screen">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>
      <div className="results-header">
        <div>
          <p className="eyebrow">My Request</p>
          <h2>Your team searches</h2>
        </div>
        <button className="primary" onClick={onCreateNew}>
          <Plus size={18} />
          New Request
        </button>
      </div>

      <div className="request-management-grid">
        <section className="request-list-panel">
          <RequestSection title="Active" requests={groupedRequests.active} />
          <RequestSection title="Completed" requests={groupedRequests.completed} />
          <RequestSection title="Cancelled" requests={groupedRequests.cancelled} />
        </section>

      <section className="request-panel standalone">
        <p className="eyebrow">Selected Request</p>
        <h2>{getCourseDisplay(request)}</h2>
        <dl>
          <div><dt>School</dt><dd>{schoolLabel(request.school || request.profile?.school)}</dd></div>
          <div><dt>Major</dt><dd>{request.major || request.profile?.major || 'Not specified'}</dd></div>
          <div><dt>Class / Session</dt><dd>{getSessionDisplay(request)}</dd></div>
          <div><dt>Skills Needed</dt><dd>{joinList(request.skills_needed)}</dd></div>
          <div><dt>Total Team Size</dt><dd>{getTotalTeamSize(request)}</dd></div>
          <div><dt>Initially Looking For</dt><dd>{getInitialNeeded(request)}</dd></div>
          <div><dt>Work Style</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
          <div><dt>Requirements</dt><dd>{describeRequirements(request)}</dd></div>
          <PortfolioReference request={request} />
          <div><dt>Status</dt><dd>{titleCase(request.status)}</dd></div>
        </dl>
        <div className="hero-actions">
          <button className="secondary" onClick={() => setState((current) => ({ ...current, editingRequest: request, success: '', error: '' }))}>
            <Pencil size={18} />
            Edit Request
          </button>
          {request.status === 'looking' && (
            <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, cancelTarget: request, success: '', error: '' }))}>
              <Trash2 size={18} />
              Cancel Request
            </button>
          )}
        </div>
        <section className="progress-panel">
          <div className="progress-header">
            <strong>Progress</strong>
            <span>{progressSummary(metrics)}</span>
          </div>
          <div className="progress-track" aria-label="Team formation progress">
            <div className="progress-fill" style={{ width: `${metrics.percent}%` }} />
          </div>
          {teamComplete ? <p className="success">Team complete 🎉</p> : <p className="note">{remainingSummary(metrics)}</p>}
          {metrics.matchedCount > 0 && !teamComplete && <p className="note">You found another teammate! {remainingSummary(metrics)}</p>}
        </section>

        <MatchUsefulnessPanel
          request={request}
          currentProfileId={currentProfileId}
          teamComplete={teamComplete}
        />

        <section className="progress-panel">
          <div className="progress-header">
            <strong>Skill Coverage</strong>
            <span>{skillGap.covered.length} / {skillGap.total} skills covered</span>
          </div>
          <div className="connection-context">
            <div className="mini-detail">
              <strong>Covered Skills</strong>
              <span>{joinList(skillGap.covered)}</span>
            </div>
            <div className="mini-detail">
              <strong>Missing Skills</strong>
              <span>{joinList(skillGap.missing)}</span>
            </div>
          </div>
        </section>

        <section className="matched-list">
          <h3>Matched Teammates ({metrics.matchedCount})</h3>
          {teammates.length === 0 ? (
            <p className="note">No teammates matched yet.</p>
          ) : (
            teammates.map((teammate) => (
              <article className="matched-row" key={teammate.profile_id}>
                <div>
                  <strong>✓ {displayName(teammate.full_name)} {teammate.is_demo && <DemoBadge />}</strong>
                  <span>{teammate.major || 'Not specified'}</span>
                </div>
                <div className="hero-actions">
                  <button className="secondary" onClick={() => onOpenChat(teammate.connection_id)}>
                    <MessageCircle size={18} />
                    Message
                  </button>
                  {teammate.active_request_id && (
                    <button className="secondary" onClick={() => onViewProfile(teammate.active_request_id)}>
                      View Profile
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {teamComplete && request.status === 'looking' && !state.dismissedComplete && (
          <section className="inline-prompt">
            <h3>Your team is complete.</h3>
            <p>You've found all the teammates you need. Mark this request as complete?</p>
            <div className="hero-actions">
              <button className="primary" onClick={markFound} disabled={state.saving}>
                {state.saving ? 'Updating...' : 'Mark as Complete'}
              </button>
              <button className="secondary" onClick={() => setState((current) => ({ ...current, dismissedComplete: true }))}>
                Keep Looking
              </button>
            </div>
          </section>
        )}

        {noLongerComplete && !state.dismissedReopen && (
          <section className="inline-prompt warning-prompt">
            <h3>Your team is no longer complete.</h3>
            <p>Reopen this request?</p>
            <div className="hero-actions">
              <button className="primary" onClick={reopenRequest} disabled={state.saving}>
                {state.saving ? 'Reopening...' : 'Reopen Request'}
              </button>
              <button className="secondary" onClick={() => setState((current) => ({ ...current, dismissedReopen: true }))}>
                Keep Closed
              </button>
            </div>
          </section>
        )}

        {state.success && <p className="success">{state.success}</p>}
        {state.error && <p className="error">{state.error}</p>}
      </section>
      </div>

      {state.cancelTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Cancel request confirmation">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Cancel Request</p>
                <h2>Cancel this request?</h2>
              </div>
              <button className="ghost" onClick={() => setState((current) => ({ ...current, cancelTarget: null }))} type="button">Close</button>
            </div>
            <p className="note">Are you sure you no longer want to look for teammates for this request?</p>
            <div className="hero-actions">
              <button className="secondary" onClick={() => setState((current) => ({ ...current, cancelTarget: null }))} type="button">
                Keep Request
              </button>
              <button className="primary danger-action" onClick={cancelRequest} disabled={state.saving}>
                {state.saving ? 'Cancelling...' : 'Cancel Request'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function FoundConfirmation({ onCreateAnother, onHome }) {
  return (
    <main className="screen compact">
      <section className="confirmation">
        <CheckCircle2 size={42} />
        <p className="eyebrow">Team Found Confirmation</p>
        <h2>Your search is marked as found.</h2>
        <p>Your profile is still saved on this device, so you can create another request later.</p>
        <div className="hero-actions center">
          <button className="primary" onClick={onCreateAnother}>Create Another Request</button>
          <button className="secondary" onClick={onHome}>Home</button>
        </div>
      </section>
    </main>
  );
}

function ConnectionsPage({ currentProfileId, currentRequestId, onOpenChat, onViewProfile, onNotificationsChanged }) {
  const [tab, setTab] = useState('received');
  const [state, setState] = useState({
    loading: true,
    error: '',
    received: [],
    sent: [],
    connected: [],
    declined: [],
    currentRequest: null,
    actionLoadingId: '',
    actionError: '',
    actionSuccess: '',
    unmatchTarget: null,
    unmatchSaving: false,
  });

  const loadConnections = async () => {
    if (!currentProfileId) {
      setState((current) => ({ ...current, loading: false, received: [], sent: [], connected: [] }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const [received, sent, connected, currentRequest] = await Promise.all([
        getConnectionRequests(currentProfileId, 'received'),
        getConnectionRequests(currentProfileId, 'sent'),
        getConnectionRequests(currentProfileId, 'connected'),
        currentRequestId ? getTeamRequestById(currentRequestId).catch(() => null) : Promise.resolve(null),
      ]);
      const [declined, unmatched] = await Promise.all([
        getConnectionRequests(currentProfileId, 'declined'),
        getConnectionRequests(currentProfileId, 'unmatched'),
      ]);
      const declinedRows = [...declined, ...unmatched]
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      await markNotificationsRead(currentProfileId, 'connections').catch(() => {});
      onNotificationsChanged?.();
      setState((current) => ({
        ...current,
        loading: false,
        received,
        sent,
        connected,
        declined: declinedRows,
        currentRequest,
      }));
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: "We couldn't load connection requests right now. Please try again.",
      }));
    }
  };

  useEffect(() => {
    loadConnections();
  }, [currentProfileId, currentRequestId]);

  const respond = async (connectionId, status) => {
    setState((current) => ({ ...current, actionLoadingId: connectionId, error: '' }));

    try {
      await respondConnectionRequest({
        connectionId,
        receiverProfileId: currentProfileId,
        status,
      });
      await loadConnections();
    } catch {
      setState((current) => ({
        ...current,
        actionLoadingId: '',
        error: "We couldn't update this connection request. Please try again.",
      }));
    }
  };

  const cancel = async (connectionId) => {
    setState((current) => ({ ...current, actionLoadingId: connectionId, error: '' }));

    try {
      await cancelConnectionRequest(connectionId, currentProfileId);
      await loadConnections();
    } catch {
      setState((current) => ({
        ...current,
        actionLoadingId: '',
        error: "We couldn't cancel this connection request. Please try again.",
      }));
    }
  };

  const unmatch = async (reason, note) => {
    const target = state.unmatchTarget;
    if (!target) return;
    setState((current) => ({ ...current, unmatchSaving: true, actionError: '' }));

    try {
      await unmatchConnectionRequest({
        connectionId: target.id,
        currentProfileId,
        reason,
        note,
      });
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        unmatchTarget: null,
        actionSuccess: `You are no longer connected with ${displayName(target.teammate_full_name)}.`,
      }));
      await loadConnections();
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: "We couldn't unmatch this connection. Please try again.",
      }));
    }
  };

  const tabs = [
    { id: 'received', label: 'Received', rows: state.received },
    { id: 'sent', label: 'Sent', rows: state.sent },
    { id: 'connected', label: 'Connected', rows: state.connected },
    { id: 'declined', label: 'Declined', rows: state.declined },
  ];
  const activeRows = tabs.find((item) => item.id === tab)?.rows || [];
  const emptyCopy = {
    received: 'No connection requests yet.',
    sent: 'No pending sent requests yet.',
    connected: 'No connected teammates yet.',
    declined: 'No declined or ended connections.',
  };

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">Connections</p>
          <h2>Connection requests</h2>
        </div>
        <div className="segmented">
          {tabs.map((item) => (
            <button className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)} key={item.id}>
              {item.label}{item.rows.length ? ` (${item.rows.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {!currentProfileId && (
        <section className="empty-state">
          <p>Create a profile before using connections.</p>
        </section>
      )}

      {currentProfileId && state.loading && <p className="loading">Loading connections...</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}

      {currentProfileId && !state.loading && activeRows.length === 0 && (
        <section className="empty-state">
          <p>{emptyCopy[tab]}</p>
        </section>
      )}

      {currentProfileId && !state.loading && activeRows.length > 0 && (
        <div className="connection-list">
          {activeRows.map((request) => (
            <article className="connection-row" key={request.id}>
              <div>
                <p className="eyebrow">
                  {tab === 'received' && `Received from ${displayName(request.teammate_full_name)}`}
                  {tab === 'sent' && `Sent to ${displayName(request.teammate_full_name)}`}
                  {tab === 'connected' && `${connectionRelationshipLabel(request)} · Connected with ${displayName(request.teammate_full_name)}`}
                  {tab === 'declined' && (
                    request.status === 'unmatched'
                      ? `Connection ended with ${displayName(request.teammate_full_name)}`
                      : `Declined with ${displayName(request.teammate_full_name)}`
                  )}
                </p>
                <h3>{displayName(request.teammate_full_name)} {(request.teammate_is_demo || request.teammate_full_name?.includes('(Demo)')) && <DemoBadge />}</h3>
                <p>{schoolLabel(request.teammate_school)} | {request.teammate_major}</p>
                {getCourseFilterValue(request) ? (
                  <p>{getCourseDisplay(request)} | {getSessionDisplay(request)}</p>
                ) : (
                  <p>Discover connection</p>
                )}
                {request.intro_message && <blockquote className="intro-message">{request.intro_message}</blockquote>}
                {request.sender_team_request_id && state.currentRequest && (
                  <div className="score inline-score">
                    <Sparkles size={16} />
                    {calculateMatchScore(state.currentRequest.profile, state.currentRequest, {
                      school: request.teammate_school,
                      major: request.teammate_major,
                      course: request.course,
                      course_name: request.course_name,
                      course_code: request.course_code,
                      class_session: request.class_session,
                      skills_needed: request.skills_needed,
                      work_styles: request.work_styles,
                      created_at: request.created_at,
                      profile: {
                        school: request.teammate_school,
                        major: request.teammate_major,
                        skills: request.teammate_skills,
                      },
                    })}% Match
                  </div>
                )}
                <div className="connection-context">
                  <div className="mini-detail">
                    <strong>Skills they have</strong>
                    <span>{joinList(request.teammate_skills)}</span>
                  </div>
                  <div className="mini-detail">
                    <strong>Looking for</strong>
                    <span>{joinList(request.skills_needed)}</span>
                  </div>
                </div>
              </div>
              <div className="connection-actions">
                <span className={`status-badge ${request.status}`}>{connectionStatusLabel(request.status, tab)}</span>
                {request.status === 'accepted' && <ConnectionRelationshipBadge connection={request} />}
                {tab === 'received' && (
                  <>
                    <button
                      className="primary"
                      onClick={() => respond(request.id, 'accepted')}
                      disabled={state.actionLoadingId === request.id}
                    >
                      Accept
                    </button>
                    <button
                      className="secondary"
                      onClick={() => respond(request.id, 'declined')}
                      disabled={state.actionLoadingId === request.id}
                    >
                      <XCircle size={18} />
                      Decline
                    </button>
                  </>
                )}
                {tab === 'sent' && request.status === 'pending' && (
                  <button
                    className="secondary"
                    onClick={() => cancel(request.id)}
                    disabled={state.actionLoadingId === request.id}
                  >
                    Cancel Request
                  </button>
                )}
                {request.status === 'accepted' && (
                  <button className="secondary" onClick={() => onOpenChat(request.id)}>
                    <MessageCircle size={18} />
                    Message
                  </button>
                )}
                <button className="secondary" onClick={() => onViewProfile(request.teammate_profile_id)}>
                  View Profile
                </button>
                {tab === 'connected' && (
                  <button
                    className="secondary quiet-action"
                    onClick={() => setState((current) => ({ ...current, unmatchTarget: request, actionError: '' }))}
                  >
                    Unmatch
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {currentProfileId && !currentRequestId && (
        <p className="note">Create a current teammate search before sending new Connect requests.</p>
      )}
      {state.unmatchTarget && (
        <UnmatchModal
          teammateName={displayName(state.unmatchTarget.teammate_full_name)}
          saving={state.unmatchSaving}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, unmatchTarget: null, actionError: '' }))}
          onConfirm={unmatch}
        />
      )}
    </main>
  );
}

function FriendsPage({ currentProfileId, onOpenChat, onViewProfile }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    friends: [],
    requests: [],
    removeTarget: null,
    matchTarget: null,
    selectedMatchIndex: 0,
    saving: false,
    success: '',
  });

  const loadFriends = () => {
    if (!currentProfileId) {
      setState((current) => ({ ...current, loading: false, friends: [], requests: [] }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));
    Promise.all([
      listFriends(currentProfileId),
      listMyTeamRequests(currentProfileId),
    ])
      .then(([friends, requests]) => setState((current) => ({
        ...current,
        loading: false,
        friends,
        requests: (requests || []).filter((request) => request.status === 'looking'),
      })))
      .catch(() => setState((current) => ({
        ...current,
        loading: false,
        error: "We couldn't load friends right now. Please try again.",
      })));
  };

  useEffect(() => {
    loadFriends();
  }, [currentProfileId]);

  const removeFriend = async (reason = 'Our project needs have changed') => {
    const target = state.removeTarget;
    if (!target) return;
    setState((current) => ({ ...current, saving: true, error: '' }));

    try {
      await unmatchConnectionRequest({
        connectionId: target.connection_id,
        currentProfileId,
        reason,
        note: 'Removed from Friends',
      });
      setState((current) => ({
        ...current,
        saving: false,
        removeTarget: null,
        success: `Removed ${displayName(target.teammate_full_name)} from Friends.`,
      }));
      loadFriends();
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: "We couldn't remove this friend. Please try again.",
      }));
    }
  };

  const confirmMatchPlus = async () => {
    const target = state.matchTarget;
    const option = target?.match_options?.[state.selectedMatchIndex] || target?.match_options?.[0];
    if (!target || !option) return;

    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      await confirmFriendMatch({
        connectionId: target.connection_id,
        currentProfileId,
        currentRequestId: option.current_request_id,
        friendRequestId: option.friend_request_id,
      });
      setState((current) => ({
        ...current,
        saving: false,
        matchTarget: null,
        selectedMatchIndex: 0,
        success: `Matched with ${displayName(target.teammate_full_name)} for ${option.course_name || 'this request'}.`,
      }));
      loadFriends();
    } catch (err) {
      setState((current) => ({
        ...current,
        saving: false,
        error: getFriendlyError(err, "We couldn't create this teammate match. Please try again."),
      }));
    }
  };

  const friendLooksSuitableForRequest = (friend, request) => {
    const friendSkills = new Set((friend.teammate_skills || []).map(normalizeFilterValue));
    const neededSkills = (request.skills_needed || []).map(normalizeFilterValue);
    const skillOverlap = neededSkills.some((skill) => friendSkills.has(skill));
    const sameSchool = normalizeFilterValue(friend.teammate_school) === normalizeFilterValue(request.school);
    const sameMajor = normalizeFilterValue(friend.teammate_major) === normalizeFilterValue(request.major);
    return skillOverlap || sameSchool || sameMajor;
  };

  const getFriendMatchOptions = (friend) => {
    const serverOptions = Array.isArray(friend.match_options) ? friend.match_options : [];
    const optionsByRequest = new Map(
      serverOptions.map((option) => [option.current_request_id, option]),
    );

    state.requests.forEach((request) => {
      if (optionsByRequest.has(request.id)) return;
      optionsByRequest.set(request.id, {
        current_request_id: request.id,
        friend_request_id: null,
        course_name: request.course_name || request.course,
        course_code: request.course_code,
        class_day: request.class_day || parseClassSession(request.class_session).day,
        class_start_time: request.class_start_time || parseClassSession(request.class_session).startTime,
        class_end_time: request.class_end_time || parseClassSession(request.class_session).endTime,
        class_session: request.class_session,
        is_suitable: friendLooksSuitableForRequest(friend, request),
      });
    });

    return [...optionsByRequest.values()];
  };

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">Friends</p>
          <h2>Discover connections</h2>
        </div>
      </div>
      {!currentProfileId && <section className="empty-state"><p>Create a profile before adding Friends.</p></section>}
      {state.loading && currentProfileId && <p className="loading">Loading friends...</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">{state.success}</p>}
      {!state.loading && currentProfileId && state.friends.length === 0 && (
        <section className="empty-state">
          <p>No Friends yet. Discover students and connect for networking.</p>
        </section>
      )}
      {!state.loading && state.friends.length > 0 && (
        <div className="discover-grid">
          {state.friends.map((friend) => (
            <article className="discover-card" key={friend.connection_id}>
              {(() => {
                const matchOptions = getFriendMatchOptions(friend);
                const canMatch = matchOptions.length > 0;
                const hasSuitableOption = matchOptions.some((option) => option.is_suitable);

                return (
                  <>
              <div className="avatar">{displayInitial(friend.teammate_full_name)}</div>
              <h3>
                {displayName(friend.teammate_full_name)} {friend.teammate_is_demo && <DemoBadge />}
                {hasSuitableOption && <span className="status-badge suitable">Suitable</span>}
              </h3>
              <p>{universityLabel(friend.teammate_university)}</p>
              <p>{schoolLabel(friend.teammate_school)} | {friend.teammate_major}</p>
              <div className="mini-detail">
                <strong>Skills they have</strong>
                <span>{joinList(friend.teammate_skills)}</span>
              </div>
              <div className="hero-actions">
                <button
                  className={canMatch ? 'primary match-plus-button' : 'secondary'}
                  disabled={!canMatch}
                  title={canMatch ? 'Add this friend as a teammate for one of your active requests.' : 'Create an active team request before using Match+.'}
                  onClick={() => setState((current) => ({
                    ...current,
                    matchTarget: { ...friend, match_options: matchOptions },
                    selectedMatchIndex: 0,
                    error: '',
                    success: '',
                  }))}
                >
                  <Sparkles size={18} />
                  Match+
                </button>
                <button className="primary" onClick={() => onOpenChat(friend.connection_id)}>
                  <MessageCircle size={18} />
                  Message
                </button>
                <button className="secondary" onClick={() => onViewProfile(friend.teammate_profile_id)}>
                  View Profile
                </button>
                <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, removeTarget: friend }))}>
                  Remove Friend
                </button>
              </div>
              {!canMatch && <p className="note">Create an active team request to use Match+.</p>}
              {canMatch && !hasSuitableOption && <p className="note">No suitability label yet, but you can still match them if they fit your team.</p>}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}
      {state.matchTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Match plus confirmation">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Match+</p>
                <h2>Match with {displayName(state.matchTarget.teammate_full_name)}?</h2>
              </div>
              <button
                className="ghost"
                onClick={() => setState((current) => ({ ...current, matchTarget: null, selectedMatchIndex: 0 }))}
                type="button"
              >
                Close
              </button>
            </div>
            {(state.matchTarget.match_options || []).length > 1 && (
              <label>
                Choose your request
                <select
                  value={state.selectedMatchIndex}
                  onChange={(event) => setState((current) => ({ ...current, selectedMatchIndex: Number(event.target.value) }))}
                >
                  {state.matchTarget.match_options.map((option, index) => (
                    <option value={index} key={`${option.current_request_id}-${option.friend_request_id || 'friend-optional'}`}>
                      {option.course_name || 'Course'} {option.course_code ? `(${option.course_code})` : ''} | {option.class_day} {option.class_start_time}{option.is_suitable ? ' · Suitable' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(() => {
              const option = state.matchTarget.match_options?.[state.selectedMatchIndex] || state.matchTarget.match_options?.[0];
              return option ? (
                <div className="request-summary-box">
                  <p className="eyebrow">{option.is_suitable ? 'Suitable for this request' : 'Your selected request'}</p>
                  <h3>{option.course_name || 'Selected course'} {option.course_code ? `(${option.course_code})` : ''}</h3>
                  <p>{option.class_day} · {option.class_start_time}{option.class_end_time ? `-${option.class_end_time}` : ''}</p>
                  {!option.is_suitable && <p className="note">Teamergency does not see a strong automatic signal yet. You can still choose this friend if they fit your team.</p>}
                </div>
              ) : null;
            })()}
            <div className="hero-actions">
              <button
                className="secondary"
                onClick={() => setState((current) => ({ ...current, matchTarget: null, selectedMatchIndex: 0 }))}
                type="button"
              >
                Cancel
              </button>
              <button className="primary match-plus-button" onClick={confirmMatchPlus} disabled={state.saving}>
                {state.saving ? 'Matching...' : 'Confirm Match'}
              </button>
            </div>
          </section>
        </div>
      )}
      {state.removeTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label="Remove friend confirmation">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Remove Friend</p>
                <h2>Remove {displayName(state.removeTarget.teammate_full_name)} from your friends?</h2>
              </div>
              <button className="ghost" onClick={() => setState((current) => ({ ...current, removeTarget: null }))} type="button">Close</button>
            </div>
            <p className="note">This only ends the Discover friendship. It does not delete old messages.</p>
            <div className="hero-actions">
              <button className="secondary" onClick={() => setState((current) => ({ ...current, removeTarget: null }))} type="button">
                Cancel
              </button>
              <button className="primary danger-action" onClick={() => removeFriend()} disabled={state.saving}>
                {state.saving ? 'Removing...' : 'Remove Friend'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function MessagesList({ currentProfileId, onOpenChat, onViewProfile, onNotificationsChanged }) {
  const [state, setState] = useState({ loading: true, error: '', threads: [] });

  useEffect(() => {
    let alive = true;

    if (!currentProfileId) {
      setState({ loading: false, error: '', threads: [] });
      return;
    }

    Promise.all([
      getMessageThreads(currentProfileId),
      markNotificationsRead(currentProfileId, 'messages').catch(() => null),
    ])
      .then(([threads]) => {
        if (alive) setState({ loading: false, error: '', threads });
        onNotificationsChanged?.();
      })
      .catch(() => {
        if (alive) {
          setState({
            loading: false,
            error: "We couldn't load messages right now. Please try again.",
            threads: [],
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [currentProfileId]);

  return (
    <main className="screen compact">
      <div className="results-header">
        <div>
          <p className="eyebrow">Messages</p>
          <h2>Accepted connections</h2>
        </div>
      </div>

      {!currentProfileId && (
        <section className="empty-state">
          <p>Create a profile before using messages.</p>
        </section>
      )}

      {currentProfileId && state.loading && <p className="loading">Loading messages...</p>}
      {state.error && <p className="error">{state.error}</p>}

      {currentProfileId && !state.loading && state.threads.length === 0 && (
        <section className="empty-state">
          <p>No messages yet. Say hello!</p>
        </section>
      )}

      {currentProfileId && !state.loading && state.threads.length > 0 && (
        <div className="thread-list">
          {state.threads.map((thread) => (
            <article className="thread-row" key={thread.connection_id}>
              <div>
                <strong>{displayName(thread.teammate_full_name)}</strong>
                <span>{thread.last_message || 'No messages yet. Say hello!'}</span>
              </div>
              <div className="thread-actions">
                <time>{formatThreadTime(thread.last_message_at || thread.updated_at)}</time>
                <button className="secondary" onClick={() => onOpenChat(thread.connection_id)}>
                  <MessageCircle size={18} />
                  Message
                </button>
                <button className="secondary" onClick={() => onViewProfile(thread.teammate_profile_id)}>
                  View Profile
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function ChatPage({ connectionId, currentProfileId, currentRequestId, onBack, onViewProfile, onNotificationsChanged }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    detail: null,
    messages: [],
    sending: false,
    actionError: '',
    actionSuccess: '',
    unmatchOpen: false,
    unmatchSaving: false,
  });
  const [messageText, setMessageText] = useState('');
  const bottomRef = useRef(null);

  const loadChat = async (quiet = false) => {
    if (!currentProfileId || !connectionId) return;
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const [detail, messages] = await Promise.all([
        getConnectionDetail(connectionId, currentProfileId),
        getMessages(connectionId, currentProfileId),
      ]);
      await markNotificationsRead(currentProfileId, 'messages').catch(() => {});
      onNotificationsChanged?.();

      if (!detail || !['accepted', 'unmatched'].includes(detail.status)) {
        setState((current) => ({
          ...current,
          loading: false,
          error: 'You need to connect before messaging this teammate.',
          detail,
          messages: [],
        }));
        return;
      }

      setState((current) => ({
        ...current,
        loading: false,
        error: '',
        detail,
        messages: mergeMessagesById(current.messages, messages),
      }));
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: "We couldn't load this conversation right now. Please try again.",
      }));
    }
  };

  useEffect(() => {
    loadChat();
    const intervalId = setInterval(() => loadChat(true), 4000);
    return () => clearInterval(intervalId);
  }, [connectionId, currentProfileId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages.length]);

  const send = async () => {
    const body = messageText.trim();
    if (!body || state.sending || state.detail?.status !== 'accepted') return;

    setState((current) => ({ ...current, sending: true, error: '' }));

    try {
      const message = await sendChatMessage({
        connectionId,
        senderProfileId: currentProfileId,
        messageText: body,
      });
      setMessageText('');
      setState((current) => ({
        ...current,
        sending: false,
        messages: mergeMessagesById(current.messages, [message]),
      }));

      if (state.detail?.teammate_is_demo) {
        const replyText = demoReplyPool[state.messages.length % demoReplyPool.length];
        window.setTimeout(async () => {
          try {
            const reply = await sendDemoReply({
              connectionId,
              currentProfileId,
              replyText,
            });
            setState((current) => ({
              ...current,
              messages: mergeMessagesById(current.messages, [reply]),
            }));
          } catch {
            setState((current) => ({
              ...current,
              error: 'Demo reply could not be sent. Please try again.',
            }));
          }
        }, 900);
      }
    } catch {
      setState((current) => ({
        ...current,
        sending: false,
        error: 'Message could not be sent. Please try again.',
      }));
    }
  };

  const unmatch = async (reason, note) => {
    setState((current) => ({ ...current, unmatchSaving: true, actionError: '' }));

    try {
      const updated = await unmatchConnectionRequest({
        connectionId,
        currentProfileId,
        reason,
        note,
      });
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        unmatchOpen: false,
        detail: { ...current.detail, ...updated, status: 'unmatched' },
        actionSuccess: `You are no longer connected with ${displayName(current.detail?.teammate_full_name) || 'this teammate'}.`,
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: "We couldn't unmatch this connection. Please try again.",
      }));
    }
  };

  const chatEnded = state.detail?.status === 'unmatched';

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>

      <section className="chat-shell">
        <div className="chat-header">
          <div>
            <h2>{displayName(state.detail?.teammate_full_name) || 'Conversation'}</h2>
            <p>
              {state.detail?.teammate_is_demo
                ? 'Demo Conversation'
                : state.detail?.status === 'accepted'
                  ? connectedButtonLabel(state.detail)
                  : chatEnded
                    ? 'Connection ended'
                    : 'Connection required'}
            </p>
          </div>
          <div className="chat-header-actions">
            {state.detail?.teammate_profile_id && (
              <button className="secondary" onClick={() => onViewProfile(state.detail.teammate_profile_id)}>
                View Profile
              </button>
            )}
            {state.detail?.status === 'accepted' && (
              <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
                Unmatch
              </button>
            )}
          </div>
        </div>

        {chatEnded && <p className="note">This connection has ended.</p>}
        {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
        {state.actionError && <p className="error">{state.actionError}</p>}
        {state.loading && <p className="loading">Loading chat...</p>}
        {state.error && <p className="error">{state.error}</p>}

        {!state.loading && !state.error && (
          <>
            <div className="message-window">
              {state.messages.length === 0 && (
                <div className="empty-state inline-empty">
                  <p>No messages yet. Say hello!</p>
                </div>
              )}
              {state.messages.map((message) => {
                const mine = message.sender_profile_id === currentProfileId;
                return (
                  <div className={mine ? 'message-bubble mine' : 'message-bubble'} key={message.id}>
                    <span>{mine ? 'You' : displayName(state.detail.teammate_full_name)}</span>
                    <p>{message.message_text}</p>
                    <time>{formatTime(message.created_at)}</time>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="message-compose">
              <input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={chatEnded ? 'This connection has ended.' : 'Type a message...'}
                disabled={chatEnded}
              />
              <button className="primary" onClick={send} disabled={!messageText.trim() || state.sending || chatEnded}>
                <SendHorizontal size={18} />
                {state.sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </section>
      {state.unmatchOpen && (
        <UnmatchModal
          teammateName={displayName(state.detail?.teammate_full_name) || 'this teammate'}
          saving={state.unmatchSaving}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, unmatchOpen: false, actionError: '' }))}
          onConfirm={unmatch}
        />
      )}
    </main>
  );
}

function MyProfile({ profile, onCreateProfile, onCreateSearch, onProfileUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyProfile);
  const [reviewsState, setReviewsState] = useState({ loading: false, error: '', reviews: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const profileSkillOptions = mergeOptionSets(getSkillsForSchool(form.school), form.skills);
  const profileSchoolOptions = getSchoolsForUniversity(form.university);

  useEffect(() => {
    let alive = true;

    if (!profile?.id) {
      setReviewsState({ loading: false, error: '', reviews: [] });
      return () => {
        alive = false;
      };
    }

    setReviewsState((current) => ({ ...current, loading: true, error: '' }));

    listProfileReviews(profile.id)
      .then((reviews) => {
        if (alive) {
          setReviewsState({ loading: false, error: '', reviews });
        }
      })
      .catch(() => {
        if (alive) {
          setReviewsState({
            loading: false,
            error: "We couldn't load reviews about you right now.",
            reviews: [],
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [profile?.id]);

  const startEdit = () => {
    const school = schoolOptions.some((option) => option.value === profile.school) ? profile.school : '';
    setForm({
      full_name: profile.full_name || '',
      university: profile.university || 'RMIT University',
      school,
      major: school && majorsBySchool[school]?.includes(profile.major) ? profile.major : '',
      skills: profile.skills || [],
      other_skill: '',
      contact_type: profile.contact_type || 'email',
      contact_value: profile.contact_value || '',
      short_bio: profile.short_bio || '',
      is_available: profile.is_available ?? true,
      consent_public_visibility: profile.consent_public_visibility ?? true,
    });
    setMessage('');
    setError('');
    setEditing(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateSchool = (value) => {
    setForm((current) => ({
      ...current,
      school: value,
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
      skills: filterSkillsForSchool(current.skills, value),
    }));
  };

  const toggleProfileSkill = (skill) => {
    setForm((current) => ({
      ...current,
      skills: toggleValue(current.skills, skill),
      other_skill: skill === 'Other' && current.skills.includes('Other') ? '' : current.other_skill,
    }));
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const skills = getProfileSkillsFromForm(form);

    if (!form.full_name || !form.school || !form.major || skills.length === 0 || !form.contact_value || !form.short_bio) {
      setError("Please fill in your profile's required fields.");
      return;
    }

    setSaving(true);

    try {
      const updated = await updateProfile(profile.id, {
        full_name: form.full_name.trim(),
        university: form.university || 'RMIT University',
        school: form.school.trim(),
        major: form.major.trim(),
        skills,
        contact_type: form.contact_type,
        contact_value: form.contact_value.trim(),
        short_bio: form.short_bio.trim(),
        is_available: form.is_available,
      });
      onProfileUpdated(updated);
      setEditing(false);
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(getFriendlyError(err, "We couldn't update your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen compact">
      <section className="profile-panel">
        <p className="eyebrow">My Profile</p>
        {!profile ? (
          <>
            <h2>No profile saved on this device.</h2>
            <p>Create a profile before searching, connecting, or chatting.</p>
            <button className="primary" onClick={onCreateProfile}>Create Profile</button>
          </>
        ) : editing ? (
          <form className="edit-profile-form" onSubmit={saveChanges}>
            <h2>Edit Profile</h2>
            <div className="form-grid single">
              <label>
                Full Name
                <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
              </label>
              <label>
                University
                <select value={form.university} onChange={(event) => updateField('university', event.target.value)} required>
                  {universityOptions.map((university) => (
                    <option value={university.value} key={university.value}>{university.label}</option>
                  ))}
                </select>
              </label>
              <label>
                School
                <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
                  <option value="">Select school</option>
                  {profileSchoolOptions.map((school) => (
                    <option value={school.value} key={school.value}>{school.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Major
                <select value={form.major} onChange={(event) => updateField('major', event.target.value)} required>
                  <option value="">Select major</option>
                  {(majorsBySchool[form.school] || []).map((major) => (
                    <option value={major} key={major}>{major}</option>
                  ))}
                </select>
              </label>
              <fieldset className="wide">
                <legend>Skills & Technologies</legend>
                <p className="field-helper">Suggested skills update based on your school. You can still add a custom skill.</p>
                <CheckboxGrid
                  options={profileSkillOptions}
                  selected={form.skills}
                  onToggle={toggleProfileSkill}
                />
                {form.skills.includes('Other') && (
                  <input
                    value={form.other_skill}
                    onChange={(event) => updateField('other_skill', event.target.value)}
                    placeholder="Add another skill"
                  />
                )}
              </fieldset>
              <label>
                Contact Method
                <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
                  {contactTypes.map((type) => (
                    <option value={type} key={type}>{contactLabel(type)}</option>
                  ))}
                </select>
              </label>
              <label>
                Contact Information
                <input
                  value={form.contact_value}
                  onChange={(event) => updateField('contact_value', event.target.value)}
                  required
                />
              </label>
              <label>
                Short Bio
                <textarea
                  value={form.short_bio}
                  onChange={(event) => updateField('short_bio', event.target.value)}
                  rows="4"
                  required
                />
              </label>
              <label className={form.is_available ? 'consent-box selected wide' : 'consent-box wide'}>
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={() => updateField('is_available', !form.is_available)}
                />
                <span>Available for collaboration</span>
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="hero-actions">
              <button className="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="secondary" type="button" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="avatar">{displayInitial(profile.full_name)}</div>
            <h2>{displayName(profile.full_name)}</h2>
            <dl>
              <div><dt>University</dt><dd>{universityLabel(profile.university)}</dd></div>
              <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
              <div><dt>Major</dt><dd>{profile.major}</dd></div>
              <div><dt>Availability</dt><dd>{profile.is_available === false ? 'Unavailable' : 'Available for collaboration'}</dd></div>
              <div>
                <dt>Reviews</dt>
                <dd>{reviewsState.loading ? 'Loading reviews...' : reviewSummaryLabel(profile, reviewsState.reviews)}</dd>
              </div>
              <div><dt>Contact</dt><dd>{contactLabel(profile.contact_type)}: {profile.contact_value}</dd></div>
              <div><dt>Bio</dt><dd>{profile.short_bio || 'Not specified'}</dd></div>
            </dl>
            <PillList items={profile.skills} />
            {reviewsState.loading && <p className="loading">Loading reviews...</p>}
            {reviewsState.error && <p className="error">{reviewsState.error}</p>}
            {!reviewsState.loading && !reviewsState.error && (
              <ReviewsSection
                profile={profile}
                reviews={reviewsState.reviews}
                title="Reviews About You"
              />
            )}
            {message && <p className="success">{message}</p>}
            <div className="stacked-actions">
              <button className="primary link-button" onClick={startEdit}>Edit Profile</button>
              <button className="secondary link-button" onClick={onCreateSearch}>Create New Search</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [view, setView] = useState('home');
  const [viewHistory, setViewHistory] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [profile, setProfile] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedMatchScore, setSelectedMatchScore] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedDiscoverProfileId, setSelectedDiscoverProfileId] = useState('');
  const [bootError, setBootError] = useState('');
  const [notificationCounts, setNotificationCounts] = useState({ connections: 0, messages: 0 });

  useEffect(() => {
    const storedProfileId = getStoredProfileId();
    const storedRequestId = getStoredRequestId();

    setProfileId(storedProfileId || '');
    setRequestId(storedRequestId || '');

    if (storedProfileId && hasSupabaseConfig) {
      getProfileById(storedProfileId, { claimLegacy: true })
        .then(setProfile)
        .catch(() => setProfileId(''));
    }
  }, []);

  const refreshNotificationCounts = async () => {
    if (!profileId) {
      setNotificationCounts({ connections: 0, messages: 0 });
      return;
    }

    try {
      const counts = await getNotificationCounts(profileId);
      setNotificationCounts(counts);
    } catch {
      setNotificationCounts({ connections: 0, messages: 0 });
    }
  };

  useEffect(() => {
    refreshNotificationCounts();
    const intervalId = setInterval(refreshNotificationCounts, 10000);
    return () => clearInterval(intervalId);
  }, [profileId, view]);

  const configWarning = useMemo(() => {
    if (hasSupabaseConfig) return '';
    return 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to run the MVP.';
  }, []);

  const startRequest = async () => {
    setBootError('');

    if (!profileId) {
      navigate('profile');
      return;
    }

    if (profile) {
      navigate('request');
      return;
    }

    try {
      const loadedProfile = await getProfileById(profileId, { claimLegacy: true });
      setProfile(loadedProfile);
      navigate('request');
    } catch {
      setBootError("We couldn't load your saved profile. Please create a profile again on this device.");
      navigate('profile');
    }
  };

  const findMatches = () => {
    if (!requestId) {
      startRequest();
      return;
    }
    navigate('matches');
  };

  const selectCurrentRequest = (nextRequestId) => {
    if (nextRequestId) {
      storeCurrentRequest(nextRequestId);
    } else {
      clearCurrentRequest();
    }
    setRequestId(nextRequestId || '');
  };

  const openChat = (connectionId) => {
    setSelectedConnectionId(connectionId);
    navigate('chat');
  };

  const navigate = (nextView) => {
    setViewHistory((current) => (
      nextView === view ? current : [...current, view].slice(-20)
    ));
    setView(nextView);
  };

  const goBack = (fallbackView = 'home') => {
    setViewHistory((current) => {
      const previousView = current[current.length - 1];
      setView(previousView || fallbackView);
      return current.slice(0, -1);
    });
  };

  return (
    <div className={view === 'home' ? 'app landing-mode' : 'app'}>
      <header className="topbar">
        <button className="logo-button" onClick={() => navigate('home')}>
          <span className="brand-logo">
            <span>TEA</span><span>M</span><span>ERGENCY</span>
          </span>
        </button>
        <div className="top-actions">
          {view === 'home' ? (
            <>
              <button className="ghost" onClick={() => navigate('discover')}>Discovery</button>
              <button className="ghost" onClick={findMatches}>Find Teammates</button>
              <button className="ghost nav-outline" onClick={() => navigate('my-profile')}>Log In</button>
              <button className="ghost" onClick={() => navigate('profile')}>Sign Up</button>
            </>
          ) : (
            <>
              <button className="ghost" onClick={() => navigate('discover')}>Discover</button>
              {requestId && <button className="ghost" onClick={findMatches}>Find Teammates</button>}
              {profileId && <button className="ghost" onClick={() => navigate('current-request')}>My Request</button>}
              <button className="ghost" onClick={() => navigate('connections')}>Connections{notificationCounts.connections > 0 && <span className="nav-badge">{notificationCounts.connections}</span>}</button>
              <button className="ghost" onClick={() => navigate('friends')}>Friends</button>
              <button className="ghost" onClick={() => navigate('messages')}>Messages{notificationCounts.messages > 0 && <span className="nav-badge">{notificationCounts.messages}</span>}</button>
              <button className="ghost" onClick={() => navigate('my-profile')}>My Profile</button>
            </>
          )}
        </div>
      </header>

      {configWarning && <div className="banner">{configWarning}</div>}
      {bootError && <div className="banner error-banner">{bootError}</div>}

      {view === 'home' && (
        <Home
          profileId={profileId}
          requestId={requestId}
          onStartProfile={() => navigate('profile')}
          onStartRequest={startRequest}
          onFindMatches={findMatches}
        />
      )}

      {view === 'profile' && (
        <ProfileForm
          onSaved={(savedProfile) => {
            setProfile(savedProfile);
            setProfileId(savedProfile.id);
            navigate('profile-saved');
          }}
        />
      )}

      {view === 'profile-saved' && (
        <ProfileSaved profile={profile} onContinue={() => navigate('request')} />
      )}

      {view === 'request' && profile && (
        <RequestForm
          profile={profile}
          onBack={() => goBack('home')}
          onCreated={(request) => {
            setRequestId(request.id);
            navigate('matches');
          }}
        />
      )}

      {view === 'matches' && requestId && (
        <MatchResults
          requestId={requestId}
          currentProfileId={profileId}
          onCreateNew={startRequest}
          onSelectRequest={selectCurrentRequest}
          onViewCurrent={() => navigate('current-request')}
          onViewProfile={(id, score) => {
            setSelectedRequestId(id);
            setSelectedMatchScore(score);
            navigate('profile-detail');
          }}
        />
      )}

      {view === 'profile-detail' && selectedRequestId && (
        <ProfileDetail
          currentProfileId={profileId}
          currentRequestId={requestId}
          matchScore={selectedMatchScore}
          requestId={selectedRequestId}
          onBack={() => goBack('matches')}
          onOpenChat={openChat}
          onOpenConnections={() => navigate('connections')}
        />
      )}

      {view === 'current-request' && profileId && (
        <CurrentRequest
          requestId={requestId}
          currentProfileId={profileId}
          profile={profile}
          onBack={() => goBack(requestId ? 'matches' : 'home')}
          onOpenChat={openChat}
          onViewProfile={(id) => {
            setSelectedRequestId(id);
            setSelectedMatchScore(null);
            navigate('profile-detail');
          }}
          onSelectRequest={selectCurrentRequest}
          onCreateNew={startRequest}
        />
      )}

      {view === 'found' && (
        <FoundConfirmation
          onCreateAnother={startRequest}
          onHome={() => navigate('home')}
        />
      )}

      {view === 'connections' && (
        <ConnectionsPage
          currentProfileId={profileId}
          currentRequestId={requestId}
          onOpenChat={openChat}
          onViewProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
          }}
          onNotificationsChanged={refreshNotificationCounts}
        />
      )}

      {view === 'discover' && (
        <DiscoverPage
          currentProfileId={profileId}
          onOpenProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
          }}
        />
      )}

      {view === 'friends' && (
        <FriendsPage
          currentProfileId={profileId}
          onOpenChat={openChat}
          onViewProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
          }}
        />
      )}

      {view === 'discover-profile' && selectedDiscoverProfileId && (
        <DiscoverProfileDetail
          profileId={selectedDiscoverProfileId}
          currentProfileId={profileId}
          onBack={() => goBack('discover')}
          onOpenChat={openChat}
          onOpenConnections={() => navigate('connections')}
        />
      )}

      {view === 'messages' && (
        <MessagesList
          currentProfileId={profileId}
          onOpenChat={openChat}
          onViewProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
          }}
          onNotificationsChanged={refreshNotificationCounts}
        />
      )}

      {view === 'chat' && (
        <ChatPage
          connectionId={selectedConnectionId}
          currentProfileId={profileId}
          currentRequestId={requestId}
          onBack={() => goBack('messages')}
          onViewProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
          }}
          onNotificationsChanged={refreshNotificationCounts}
        />
      )}

      {view === 'my-profile' && (
        <MyProfile
          profile={profile}
          onCreateProfile={() => navigate('profile')}
          onCreateSearch={startRequest}
          onProfileUpdated={(updatedProfile) => setProfile(updatedProfile)}
        />
      )}
    </div>
  );
}
