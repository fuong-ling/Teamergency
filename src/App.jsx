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
  Languages,
  XCircle,
} from 'lucide-react';
import {
  cancelConnectionRequest,
  cancelTeamRequest,
  closeClassTeamFormation,
  confirmClassTeamProposals,
  confirmFriendMatch,
  createLecturerClass,
  createProfile,
  createMatchFeedback,
  createReview,
  createTeamRequest,
  getClassByJoinCode,
  getConnectionBetween,
  getConnectionDetail,
  getConnectionRequests,
  getDemoClassForProfile,
  getDemoLecturerDashboards,
  getDiscoverProfiles,
  getNotificationCounts,
  joinClassById,
  getMatchesForRequest,
  getMyProfile,
  getProfileByContactEmail,
		  getMessages,
	  getMessageThreads,
	  getMyClassTeamStatus,
  getActiveTeamRequests,
  getProfileById,
  listMyTeamRequests,
  joinDemoClassByCode,
  joinClassByCode,
  listMyClasses,
  listMyClassesWithStatus,
  getTeamRequestProgress,
  getTeamRequestById,
  getPortfolioReferenceUrl,
  markNotificationsRead,
  markTeamRequestFound,
  listFriends,
  listProfileReviews,
  openLecturerStudentThread,
  respondConnectionRequest,
  resetDemoConnection,
  reopenTeamRequest,
  sendDemoReply,
  sendChatMessage,
  sendConnectionRequest,
  sendLecturerReminder,
  saveClassTeamStatus,
  simulateDemoAcceptance,
  unmatchConnectionRequest,
  updateProfile,
  updatePendingConnectionMessage,
  updateTeamRequest,
  uploadPortfolioReference,
} from './lib/database';
import {
  getCurrentSession,
  hasSupabaseConfig,
  signInWithGoogle,
  signOut,
  supabase,
} from './lib/supabase';
import { REVIEW_WAIT_DAYS } from './lib/config';
import {
  connectMessageSuggestions,
  contactTypes,
  demoReplyPool,
  getAllCourses,
  getAllSkills,
  getCoursesForSchool,
  getRequestSkillOptions,
  getSessionsForCourse,
  getSchoolsForUniversity,
  getSkillsForSchool,
  majorsBySchool,
  opportunityFields,
  opportunityTypes,
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
  getStoredClassId,
  getStoredActiveRole,
  getStoredLanguage,
  getStoredLecturerSession,
  getStoredLoggedOut,
  getStoredPendingRole,
  clearActiveRole,
  clearCurrentRequest,
  clearLoggedOut,
  clearLecturerSession,
  clearPendingRole,
  storeCurrentRequest,
  storeActiveRole,
  storeClassId,
  storeLanguage,
  storeLecturerSession,
  storeLoggedOut,
  storePendingRole,
  storeProfileId,
} from './lib/storage';
import { calculateMatchScore } from './lib/matching';
import { languages, translate } from './lib/i18n';

const classDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const networkStatusOptions = [
	  {
	    value: 'already_have_team',
	    labelKey: 'join.optionAlreadyHaveTeam',
	  },
	  {
	    value: 'need_some_teammates',
	    labelKey: 'join.optionNeedSome',
	  },
	  {
	    value: 'no_preferred_teammates',
	    labelKey: 'join.optionNoPreferred',
	  },
	];

const demoClassCodes = ['200206', '676767', '88889999'];

const demoLecturerAccounts = [
  {
    university: 'RMIT University',
    lecturerId: 'v123456',
    lecturerName: 'Tom Anderson',
  },
  {
    university: 'University of Economics Ho Chi Minh City',
    lecturerId: 'v234567',
    lecturerName: 'Patrick Hartono',
  },
  {
    university: 'University of Technology Ho Chi Minh City',
    lecturerId: 'v345678',
    lecturerName: 'Sarah Nguyen',
  },
];

const lecturerContactMethods = ['Email', 'Microsoft Teams', 'University Email', 'Other'];

const findDemoLecturerAccount = (university, lecturerId) =>
  demoLecturerAccounts.find((account) =>
    account.university === university &&
    account.lecturerId.toLowerCase() === String(lecturerId || '').trim().toLowerCase(),
  );

const lecturerSessionFromProfile = (profile) => {
  if (!profile || getProfileRole(profile) !== 'lecturer') return null;
  return {
    university: profile.university || 'RMIT University',
    lecturerId: profile.lecturer_id || '',
    lecturerName: profile.full_name || 'Lecturer',
  };
};

const demoLecturerHelperText = demoLecturerAccounts
  .map((account) => `${account.lecturerId} - ${account.university}`)
  .join(' | ');

const selectOrOther = (value, options) => {
  if (!value) return '';
  return options.includes(value) ? value : 'Other';
};

const customOptionValue = (value, options) =>
  value && !options.includes(value) ? value : '';

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
  role: 'student',
  full_name: '',
  university: 'RMIT University',
  school: '',
  major: '',
  skills: [],
  other_skill: '',
  contact_type: 'email',
  contact_value: '',
  avatar_url: '',
  work_styles: [],
	  short_bio: '',
	  lecturer_title: '',
	  lecturer_id: '',
	  academic_field: '',
	  lecturer_contact_method: 'Email',
	  lecturer_contact_detail: '',
	  student_id: '',
	  is_available: true,
  consent_public_visibility: false,
};

const createProfileFormState = (initialRole = 'student', initialData = {}) => {
  const role = initialRole === 'lecturer' ? 'lecturer' : 'student';
  return {
    ...emptyProfile,
    ...initialData,
    role,
    university: initialData.university || emptyProfile.university,
    school: initialData.school || '',
    major: role === 'lecturer' ? 'Lecturer' : initialData.major || '',
    skills: Array.isArray(initialData.skills) ? initialData.skills : [],
    work_styles: Array.isArray(initialData.work_styles) ? initialData.work_styles : [],
    contact_type: initialData.contact_type || 'email',
    contact_value: initialData.contact_value || '',
    lecturer_contact_method: initialData.lecturer_contact_method || 'Email',
    lecturer_contact_detail: initialData.lecturer_contact_detail || initialData.contact_value || '',
    student_id: initialData.student_id || '',
    short_bio: initialData.short_bio || '',
    consent_public_visibility: initialData.consent_public_visibility ?? Boolean(initialData.id),
  };
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

const getSessionCodeFromValue = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^session\s*0?(\d{1,2})$/i) || normalized.match(/^0?(\d{1,2})$/);
  if (!match) return '';
  return match[1].padStart(2, '0');
};

const formatSessionCode = (code = '') => {
  const normalized = getSessionCodeFromValue(code);
  return normalized ? `Session ${normalized}` : '';
};

const isTimetableSession = (session = '') => {
  const parsed = parseClassSession(session);
  return Boolean(parsed.day && parsed.startTime);
};

const formatClassSession = ({ session_code, class_session }) =>
  formatSessionCode(session_code) || formatSessionCode(class_session) || '';

const emptyRequest = {
  class_id: '',
  school: '',
  major: '',
  course_name: '',
  course_code: '',
  session_code: '',
  class_session: '',
  class_day: '',
  class_start_time: '',
	  class_end_time: '',
		  request_scope: 'open_opportunity',
		  opportunity_type: '',
		  other_opportunity_type: '',
		  opportunity_field: '',
		  other_opportunity_field: '',
		  opportunity_name: '',
	  deadline: '',
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

const buildRequestFormState = (profile, request = null, classContext = null) => {
  const parsedSession = parseClassSession(request?.class_session);
  const sessionCode = getSessionCodeFromValue(request?.session_code || request?.class_session);

  if (!request) {
	    const baseState = {
	      ...emptyRequest,
	      request_scope: classContext ? 'class' : 'open_opportunity',
	      school: schoolOptions.some((school) => school.value === profile.school) ? profile.school : '',
	      major: profile.major || '',
	    };

    return classContext ? applyClassToRequestState(baseState, classContext) : baseState;
  }

  const requirementsData = request.requirements_data || {};
  return {
    ...emptyRequest,
    school: request.school || profile.school || '',
    major: request.major || profile.major || '',
    class_id: request.class_id || '',
    course_name: request.course_name || request.course || '',
    course_code: request.course_code || '',
    session_code: sessionCode,
	    class_session: request.class_session || '',
	    request_scope: request.request_scope || (request.class_id ? 'class' : 'open_opportunity'),
		    opportunity_type: selectOrOther(request.opportunity_type || (!request.class_id ? request.course_code : ''), opportunityTypes),
		    other_opportunity_type: customOptionValue(request.opportunity_type || (!request.class_id ? request.course_code : ''), opportunityTypes),
		    opportunity_field: selectOrOther(request.opportunity_field || (!request.class_id ? request.major || profile.major : ''), opportunityFields),
		    other_opportunity_field: customOptionValue(request.opportunity_field || (!request.class_id ? request.major || profile.major : ''), opportunityFields),
	    opportunity_name: request.opportunity_name || (!request.class_id ? request.course_name || request.course || '' : ''),
	    deadline: request.deadline || '',
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

const applyClassToRequestState = (current, classItem) => {
  const teamStatus = classItem.teamStatus || null;
  const requiredMembers = Number(teamStatus?.required_members || classItem.required_members_per_team || current.total_team_size || 4);
  const missingMembers = Math.max(1, Number(teamStatus?.remaining_members || requiredMembers - Number(teamStatus?.current_members || 1)));

  return {
    ...current,
    class_id: classItem.id,
    school: classItem.school || current.school,
    major: classItem.major || current.major,
    course_name: classItem.course_name || classItem.course || current.course_name,
    course_code: classItem.course_code || current.course_code,
    session_code: classItem.session_code || getSessionCodeFromValue(classItem.class_session),
    class_session: classItem.class_session || formatSessionCode(classItem.session_code),
    class_day: '',
    class_start_time: '',
    class_end_time: '',
    total_team_size: requiredMembers,
    teammates_needed_initial: missingMembers,
    members_needed: missingMembers,
    request_scope: 'class',
  };
};

const getStoredInviteCode = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('classCode') || '';
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
    return 'The team size/class request database fix has not been applied yet. Run supabase/fix_current_request_team_size_and_class_rpc.sql in Supabase.';
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

  if (error?.message?.includes('does not match your current academic profile')) {
    return 'This class does not match your current academic profile.';
  }

  if (error?.message?.includes('class_id') && error?.message?.includes('ambiguous')) {
    return 'The demo class join database fix has not been applied yet. Run supabase/fix_join_demo_class_ambiguous.sql in Supabase, then refresh this app.';
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

const isProfileOwnershipError = (error) =>
  String(error?.message || '').includes('Profile ownership required');

const classMatchesProfile = (classItem = {}, profile = {}) => {
  if (!classItem || !profile) return false;
  const sameUniversity = normalizeFilterValue(classItem.university || 'RMIT University') === normalizeFilterValue(profile.university || 'RMIT University');
  const sameSchool = normalizeFilterValue(classItem.school) === normalizeFilterValue(profile.school);
  const sameMajor = normalizeFilterValue(classItem.major) === normalizeFilterValue(profile.major);
  return sameUniversity && sameSchool && sameMajor;
};

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

const reviewSummaryLabel = (profile = {}, reviews = null, t = translate.bind(null, 'en')) => {
  const summary = Array.isArray(reviews) && reviews.length > 0
    ? getReviewSummaryFromReviews(reviews)
    : getReviewSummary(profile);

  return summary.count > 0
    ? t('profile.reviewSummary', {
        average: summary.average.toFixed(1),
        count: summary.count,
        label: summary.count === 1 ? t('profile.review') : t('profile.reviewsLower'),
      })
    : t('profile.noReviews');
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
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.opportunity_name || request.course_name || request.course || 'Collab';
  }
  if (request.course_name && request.course_code) return `${request.course_name} (${request.course_code})`;
  if (request.course_name) return request.course_name;
  return request.course || 'Not specified';
};

const getOpportunityMeta = (request) =>
  [request?.opportunity_type, request?.opportunity_field]
    .filter(Boolean)
    .join(' | ') || 'Collab';

const getSessionDisplay = (request = {}) => {
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.deadline ? `Deadline ${request.deadline}` : 'Outside class';
  }

  const sessionLabel = formatSessionCode(request.session_code || request.class_session);
  if (sessionLabel) return sessionLabel;
  if (request.class_session && !isTimetableSession(request.class_session)) return request.class_session;
  return request.class_session ? 'Legacy session' : 'Not specified';
};

const getLocalizedSessionDisplay = (request = {}, t = translate.bind(null, 'en')) => {
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.deadline ? `${t('request.deadline')} ${request.deadline}` : t('request.outsideClass');
  }

  const session = getSessionDisplay(request);
  if (session === 'Not specified') return t('common.notSpecified');
  if (session === 'Legacy session') return t('class.session');
  return session;
};

const requestStatusLabel = (status, t = translate.bind(null, 'en')) => {
  if (status === 'looking') return t('status.looking');
  if (status === 'found') return t('common.completed');
  if (status === 'cancelled') return t('common.cancelled');
  return titleCase(status);
};

const getClassDisplay = (classItem = {}) => {
  const course = classItem.course_name || classItem.course || 'Course';
  const code = classItem.course_code ? ` (${classItem.course_code})` : '';
  return `${course}${code} · ${getSessionDisplay(classItem)}`;
};

const getAcademicPeriodDisplay = (item = {}) =>
  [item.semester, item.academic_year].filter(Boolean).join(', ') || 'Academic period not specified';

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

const progressSummary = (metrics, t = translate.bind(null, 'en')) =>
  `${metrics.found} / ${metrics.total} ${t('common.completed').toLowerCase()}`;

const remainingSummary = (metrics, t = translate.bind(null, 'en')) =>
  metrics.complete
    ? t('status.teamComplete')
    : t('status.stillLookingCount', { count: metrics.remaining });

const teammateCountSummary = (metrics, t = translate.bind(null, 'en')) =>
  `${metrics.found} / ${metrics.total} ${t('status.members')}`;

const classNetworkStatusLabel = (status, t = translate.bind(null, 'en')) => {
  if (status === 'already_have_team') return t('join.alreadyHaveTeam');
  if (status === 'need_some_teammates') return t('join.needSomeTeammates');
  if (status === 'no_preferred_teammates') return t('join.noPreferredTeammates');
  return t('join.notAnswered');
};

const classTeamStatus = (classItem, request, metrics = null, t = translate.bind(null, 'en')) => {
  if (!request) {
    if (classItem?.network_status === 'already_have_team') {
      return {
        label: t('status.alreadyComplete'),
        detail: t('status.teamComplete'),
        tone: 'complete',
        complete: true,
      };
    }

    return {
      label: t('status.noRequest'),
      detail: t('class.createRequestHelp'),
      tone: 'idle',
      complete: false,
    };
  }

  if (request.status === 'found' || metrics?.complete) {
    return {
      label: t('status.teamComplete'),
      detail: metrics ? teammateCountSummary(metrics, t) : t('status.requiredReached'),
      tone: 'complete',
      complete: true,
    };
  }

  if (!metrics || metrics.found <= 1) {
    return {
      label: t('status.looking'),
      detail: metrics ? teammateCountSummary(metrics, t) : t('status.noFound'),
      tone: 'looking',
      complete: false,
    };
  }

  return {
    label: t('status.stillLookingCount', { count: metrics.remaining }),
    detail: teammateCountSummary(metrics, t),
    tone: 'looking',
    complete: false,
  };
};

const translateStatusText = (text, t) => {
  if (!text) return '';
  if (text === 'Team complete') return t('status.teamComplete');
  if (text === 'You already have a complete team') return t('status.alreadyComplete');
  if (text === 'Looking for teammates') return t('status.looking');
  if (text === 'No request / not looking') return t('status.noRequest');
  if (text === 'Required team size reached') return t('status.requiredReached');
  if (text === 'No teammates found yet') return t('status.noFound');
  return text.replace('Still looking for', t('status.stillLooking'));
};

const getTeamStatusFromEditableTeam = (teamStatus, t = translate.bind(null, 'en')) => {
  if (!teamStatus) return null;

  const total = Math.max(2, Number(teamStatus.required_members || 2));
  const found = Math.min(total, Math.max(1, Number(teamStatus.current_members || 1)));
  const remaining = Math.max(0, total - found);

  return {
    label: remaining === 0
      ? t('status.teamComplete')
      : found <= 1 ? t('status.looking') : t('status.stillLookingCount', { count: remaining }),
    detail: remaining === 0 ? t('status.requiredReached') : `${found} / ${total} ${t('status.members')}`,
    tone: remaining === 0 ? 'complete' : 'looking',
    complete: remaining === 0,
    metrics: {
      total,
      found,
      remaining,
      complete: remaining === 0,
      percent: total ? Math.min(100, (found / total) * 100) : 0,
    },
  };
};

const buildTeamStatusForm = (classItem, teamStatus = null) => ({
  teamName: teamStatus?.team_name || '',
  requiredMembers: teamStatus?.required_members || classItem?.required_members_per_team || 4,
  currentMembers: teamStatus?.current_members || 1,
  externalStudentIds: (teamStatus?.members || [])
    .map((member) => member.student_identifier)
    .filter(Boolean)
    .join('\n'),
});

const pickClassRequest = (requests = [], classId = '') => {
  const classRequests = requests
    .filter((request) => request.class_id === classId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return classRequests.find((request) => request.status === 'looking')
    || classRequests.find((request) => request.status === 'found')
    || classRequests[0]
    || null;
};

const getProfileSkillsFromForm = (form) => [
  ...form.skills.filter((skill) => skill !== 'Other'),
  ...splitList(form.other_skill),
];

const getGoogleProfileSeed = (authSession, role = 'student') => {
  const user = authSession?.user;
  if (!user || user.is_anonymous) return {};

  const metadata = user.user_metadata || {};
  const email = user.email || metadata.email || '';

  return {
    role: role === 'lecturer' ? 'lecturer' : 'student',
    full_name: metadata.full_name || metadata.name || '',
    avatar_url: metadata.avatar_url || metadata.picture || '',
    contact_type: 'email',
    contact_value: email,
    lecturer_contact_method: 'Email',
    lecturer_contact_detail: email,
  };
};

const getAuthSessionEmail = (session) =>
  session?.user?.email || session?.user?.user_metadata?.email || '';

const hasGoogleAuthSession = (session) =>
  Boolean(getAuthSessionEmail(session) && !session?.user?.is_anonymous);

const profileRequiredLabels = {
  full_name: 'profile.fullName',
  university: 'profile.university',
  school: 'profile.department',
  major: 'profile.major',
  skills: 'profile.skills',
  contact_value: 'profile.contactInfo',
  short_bio: 'profile.shortBio',
  work_styles: 'profile.workStyle',
  student_id: 'profile.studentId',
  academic_field: 'profile.academicField',
  lecturer_id: 'profile.lecturerId',
  lecturer_contact_detail: 'profile.contactDetail',
};

const getProfileRequiredFields = (role) =>
  role === 'lecturer'
    ? ['full_name', 'university', 'school', 'academic_field', 'lecturer_id', 'lecturer_contact_detail']
    : ['full_name', 'university', 'school', 'major', 'student_id', 'skills', 'contact_value', 'short_bio'];

const getProfileFieldErrors = (form, t = translate.bind(null, 'en')) => {
  const role = form.role === 'lecturer' ? 'lecturer' : 'student';
  const isFilled = (field) => {
    const value = field === 'skills' ? getProfileSkillsFromForm(form) : form[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
  };
  return getProfileRequiredFields(role).reduce((errors, field) => {
    if (!isFilled(field)) {
      const specificKey = `validation.${field}`;
      errors[field] = t(specificKey) === specificKey
        ? t('validation.required', { field: t(profileRequiredLabels[field] || field) })
        : t(specificKey);
    }
    return errors;
  }, {});
};

const isProfileCompleteForRole = (profile, role) => {
  if (!profile) return false;
  const normalizedRole = role === 'lecturer' ? 'lecturer' : 'student';
  const profileLikeForm = {
    ...profile,
    role: normalizedRole,
    skills: Array.isArray(profile.skills) ? profile.skills : [],
  };
  const errors = getProfileFieldErrors(profileLikeForm, (key) => key);
  return Object.keys(errors).length === 0;
};

const FieldError = ({ message }) =>
  message ? <span className="validation-message">{message}</span> : null;

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

const getProfileRole = (profile) => (profile?.role === 'lecturer' ? 'lecturer' : 'student');

const isLecturerProfile = (profile) => getProfileRole(profile) === 'lecturer';

const lecturerDepartmentLabel = (school) => schoolLabel(school).replace(/\s*\([^)]*\)\s*$/, '');

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

function ConnectModal({ receiverName, sending, error, onClose, onSend, t = translate.bind(null, 'en') }) {
  const [introMessage, setIntroMessage] = useState('');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('connect.title')}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{t('matches.connect')}</p>
            <h2>{t('connect.title')}</h2>
          </div>
          <button className="ghost" onClick={onClose} type="button">{t('common.close')}</button>
        </div>
        <p className="note">{t('connect.to')}: {receiverName}</p>
        <label>
          {t('connect.addMessage')}
          <textarea
            value={introMessage}
            onChange={(event) => setIntroMessage(event.target.value)}
            placeholder={t('connect.placeholder')}
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
            {sending ? t('matches.sending') : t('connect.send')}
          </button>
          <button className="secondary" onClick={onClose} type="button">{t('common.cancel')}</button>
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

function Home({
  selectedRole,
  onSelectRole,
  onStartProfile,
  onGoogleSignIn,
  googleSigningIn,
  authSession,
  t = translate.bind(null, 'en'),
}) {
  const activeRole = selectedRole === 'lecturer' ? 'lecturer' : selectedRole === 'student' ? 'student' : '';
  const roleCards = [
    {
      value: 'student',
      title: t('home.studentTitle'),
      body: t('home.studentBody'),
      icon: GraduationCap,
    },
    {
      value: 'lecturer',
      title: t('home.lecturerTitle'),
      body: t('home.lecturerBody'),
      icon: UsersRound,
    },
  ];
  const email = getAuthSessionEmail(authSession);

  return (
    <main className="home-grid">
      <section className="intro">
        <p className="eyebrow">{t('home.titleA')}</p>
        <h1>
          <span className="hero-line">{t('home.titleB')}</span>
        </h1>
        <p className="lead">
          {t('home.lead')}
        </p>
        <div className="landing-role-grid" aria-label={t('home.chooseRole')}>
          {roleCards.map((role) => {
            const Icon = role.icon;
            return (
              <button
                className={activeRole === role.value ? 'landing-role-card selected' : 'landing-role-card'}
                key={role.value}
                type="button"
                onClick={() => onSelectRole(role.value)}
              >
                <Icon size={24} />
                <span>
                  <strong>{role.title}</strong>
                  <small>{role.body}</small>
                  {activeRole === role.value && <em>{t('home.roleSelected')}</em>}
                </span>
              </button>
            );
          })}
        </div>
        {activeRole && (
          <section className="landing-auth-card">
            <div>
	              <p className="eyebrow">{t('home.googleFirst')}</p>
	              <h2>{t('profile.googleContinue')}</h2>
	              <p className="note">
	                {email
	                  ? `${t('profile.googleSignedIn')} · ${email}`
	                  : `${t('home.selectedRole')}: ${activeRole === 'lecturer' ? t('profile.lecturer') : t('profile.student')}`}
	              </p>
            </div>
            <div className="hero-actions">
              <button
                className="primary google-button"
                type="button"
                onClick={() => onGoogleSignIn(activeRole)}
                disabled={!hasSupabaseConfig || googleSigningIn}
              >
                <UserRound size={18} />
                {googleSigningIn ? t('profile.googleSaving') : t('profile.googleContinue')}
              </button>
              <button className="secondary" type="button" onClick={() => onStartProfile(activeRole)}>
                {t('home.continueDemo')}
                <ArrowRight size={18} />
              </button>
            </div>
            {!hasSupabaseConfig && <p className="field-helper">{t('profile.googleUnavailable')}</p>}
          </section>
        )}
      </section>
    </main>
  );
}

function JoinClassPage({ profile, profileId, onCreateProfile, onJoined, t = translate.bind(null, 'en') }) {
  const [joinCode, setJoinCode] = useState(() => getStoredInviteCode());
  const [networkStatus, setNetworkStatus] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const previewClass = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setPreview(null);

    if (!joinCode.trim()) {
	      setError(t('join.enterCode'));
      return;
    }

	    const normalizedCode = joinCode.trim();
	    setLoading(true);
	    try {
	      let foundClass = null;
	      if (demoClassCodes.includes(normalizedCode)) {
	        try {
	          foundClass = await getDemoClassForProfile(profileId, normalizedCode);
	        } catch (demoError) {
	          if (
	            isProfileOwnershipError(demoError)
	            || demoError?.message?.includes('does not match your current academic profile')
	          ) {
	            throw demoError;
	          }
	          console.error('Demo class preview lookup failed, trying generic lookup fallback', demoError);
	        }
	      }

	      if (!foundClass) {
	        foundClass = await getClassByJoinCode(normalizedCode);
	        if (foundClass && demoClassCodes.includes(normalizedCode) && !classMatchesProfile(foundClass, profile)) {
	          throw new Error('This class does not match your current academic profile.');
	        }
	      }

	      if (!foundClass) {
		        setError(t('join.invalidCode'));
	        return;
	      }
	      setPreview(foundClass);
	    } catch (err) {
	      console.error('Class preview failed', err);
	      if (isProfileOwnershipError(err)) {
	        setError(t('join.profileOwnership'));
	      } else {
	        setError(t(err?.message?.includes('does not match your current academic profile')
	          ? 'join.profileMismatch'
	          : 'join.invalidCode'));
	      }
	    } finally {
	      setLoading(false);
	    }
  };

  const confirmJoin = async () => {
    if (!profileId || !preview) return;

    setJoining(true);
    setError('');
    setMessage('');

    try {
      let membership;

      try {
        membership = await joinClassById({
          profileId,
          classItem: preview,
          networkStatus,
        });
      } catch (directJoinError) {
        console.error('Direct class join failed, trying code-based join fallback', directJoinError);
        membership = preview.is_demo
          ? await joinDemoClassByCode({
              profileId,
              classCode: preview.class_code || preview.demo_class_code || joinCode.trim(),
              networkStatus,
            })
          : await joinClassByCode({
              profileId,
              joinCode: preview.join_code || preview.class_code || joinCode.trim(),
              networkStatus,
            });
      }

      const joinedClassId = membership.class_id || preview.id;
      storeClassId(joinedClassId);
      setMessage(t('join.joined', { className: getClassDisplay(membership.class_data || preview) }));
      onJoined?.(joinedClassId);
    } catch (err) {
      console.error('Join class failed', err);
      setError(t(err?.message?.includes('does not match your current academic profile')
        ? 'join.profileMismatch'
        : 'join.joinFail'));
    } finally {
      setJoining(false);
    }
  };

  if (!profileId) {
    return (
      <main className="screen compact">
        <section className="empty-state">
	          <p>{t('join.needProfile')}</p>
	          <button className="primary" onClick={onCreateProfile}>{t('profile.createProfile')}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="form-shell">
        <div className="form-heading">
          <UsersRound size={28} />
          <div>
	            <p className="eyebrow">{t('join.title')}</p>
	            <h2>{t('join.subtitle')}</h2>
          </div>
        </div>

        <form className="form-grid" onSubmit={previewClass}>
          <label className="wide">
	            {t('join.classCode')}
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="200206"
            />
	            <span className="field-helper">{t('join.demoCodes')}</span>
          </label>
          <button className="secondary wide" type="submit" disabled={loading}>
	            {loading ? t('join.checking') : t('join.preview')}
          </button>
        </form>

        {preview && (
          <section className="request-summary-box">
	            <p className="eyebrow">{t('join.classPreview')}</p>
            <h3>{getClassDisplay(preview)}</h3>
            <p>{preview.university} · {getAcademicPeriodDisplay(preview)}</p>
            <p>{schoolLabel(preview.school)} · {preview.major}</p>
	            {preview.lecturer_name && <p>{t('join.lecturer')}: {preview.lecturer_name}</p>}
            <label>
	              {t('join.question')}
              <select value={networkStatus} onChange={(event) => setNetworkStatus(event.target.value)}>
	                <option value="">{t('join.preferNoAnswer')}</option>
	                {networkStatusOptions.map((option) => (
	                  <option value={option.value} key={option.value}>{t(option.labelKey)}</option>
	                ))}
              </select>
            </label>
            <button className="primary" onClick={confirmJoin} disabled={joining}>
	              {joining ? t('join.joining') : t('join.joinClass')}
            </button>
          </section>
        )}

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

function MyClassesPage({ profileId, onCreateProfile, onJoinClass, onOpenClass, t = translate.bind(null, 'en') }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
	    classes: [],
	    requests: [],
	    progressByRequest: {},
	    teamStatusByClass: {},
	  });

  useEffect(() => {
    let alive = true;

    if (!profileId) {
	      setState({ loading: false, error: '', classes: [], requests: [], progressByRequest: {}, teamStatusByClass: {} });
      return () => {
        alive = false;
      };
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

    Promise.all([listMyClassesWithStatus(profileId), listMyTeamRequests(profileId)])
      .then(async ([classes, requests]) => {
        const classRequests = requests.filter((request) => request.class_id);
        const progressEntries = await Promise.all(
          classRequests.map(async (request) => {
            try {
              return [request.id, await getTeamRequestProgress(request.id, profileId)];
            } catch {
              return [request.id, { found_count: 0, teammates: [] }];
            }
          }),
        );

	        const teamStatusEntries = await Promise.all(
	          classes.map(async (classItem) => {
	            try {
	              return [classItem.id, await getMyClassTeamStatus(profileId, classItem.id)];
	            } catch {
	              return [classItem.id, null];
	            }
	          }),
	        );

	        if (alive) {
	          setState({
	            loading: false,
	            error: '',
	            classes: classes.filter((classItem) => classItem.status === 'active'),
	            requests,
	            progressByRequest: Object.fromEntries(progressEntries),
	            teamStatusByClass: Object.fromEntries(teamStatusEntries),
	          });
	        }
      })
      .catch((err) => {
        if (alive) {
          setState({
            loading: false,
            error: getFriendlyError(err, "We couldn't load your classes right now. Please try again."),
	            classes: [],
	            requests: [],
	            progressByRequest: {},
	            teamStatusByClass: {},
	          });
        }
      });

    return () => {
      alive = false;
    };
  }, [profileId]);

  if (!profileId) {
    return (
      <main className="screen compact">
        <section className="empty-state">
	          <p>{t('join.needProfile')}</p>
	          <button className="primary" onClick={onCreateProfile}>{t('profile.createProfile')}</button>
        </section>
      </main>
    );
  }

  if (state.loading) {
	    return <main className="screen compact"><p className="loading">{t('classes.loading')}</p></main>;
  }

  return (
    <main className="screen">
      <div className="results-header">
        <div>
	          <p className="eyebrow">{t('classes.academic')}</p>
	          <h2>{t('classes.title')}</h2>
	          <p>{t('classes.subtitle')}</p>
        </div>
        <button className="primary" onClick={onJoinClass}>
          <UserPlus size={18} />
	          {t('join.joinClass')}
        </button>
      </div>

      {state.error && <p className="error">{state.error}</p>}

      {state.classes.length === 0 ? (
        <section className="empty-state">
	          <p>{t('classes.none')}</p>
	          <button className="primary" onClick={onJoinClass}>{t('join.joinClass')}</button>
        </section>
      ) : (
        <div className="match-grid">
          {state.classes.map((classItem) => {
            const request = pickClassRequest(state.requests, classItem.id);
	            const requestMetrics = request ? getTeamProgress(request, state.progressByRequest[request.id]) : null;
	            const editableStatus = getTeamStatusFromEditableTeam(state.teamStatusByClass[classItem.id], t);
	            const metrics = editableStatus?.metrics || requestMetrics;
	            const status = editableStatus || classTeamStatus(classItem, request, requestMetrics, t);

            return (
              <article className="match-card" key={classItem.id}>
	                <span className={`status-badge ${status.tone}`}>{translateStatusText(status.label, t)}</span>
                <h3>{getClassDisplay(classItem)}</h3>
                <p>{classItem.university} | {schoolLabel(classItem.school)} | {classItem.major}</p>
	                <p>{getAcademicPeriodDisplay(classItem)} | {t('join.lecturer')}: {classItem.lecturer_name || t('common.notSpecified')}</p>
                <div className="mini-detail">
	                  <strong>{t('classes.classCode')}</strong>
                  <span>{classItem.class_code || classItem.demo_class_code || classItem.join_code}</span>
                </div>
                <div className="mini-detail">
	                  <strong>{t('classes.teamStatus')}</strong>
	                  <span>{metrics ? `${teammateCountSummary(metrics, t)} | ${translateStatusText(status.detail, t)}` : translateStatusText(status.detail, t)}</span>
                </div>
                <button className="secondary" onClick={() => onOpenClass(classItem.id)}>
	                  {t('classes.open')}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function TeamStatusEditor({ classItem, teamStatus, saving, error, onSave, onCancel, t = translate.bind(null, 'en') }) {
  const [form, setForm] = useState(() => buildTeamStatusForm(classItem, teamStatus));

  useEffect(() => {
    setForm(buildTeamStatusForm(classItem, teamStatus));
  }, [classItem?.id, teamStatus?.id]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const requiredMembers = Math.max(2, Number(form.requiredMembers || 2));
  const currentMembers = Math.min(requiredMembers, Math.max(1, Number(form.currentMembers || 1)));
  const remaining = Math.max(0, requiredMembers - currentMembers);

  return (
    <section className="request-panel standalone">
	      <p className="eyebrow">{t('class.editStatus')}</p>
      <div className="form-grid">
        <label>
	          {t('teamStatus.groupName')}
          <input
            value={form.teamName}
            onChange={(event) => updateField('teamName', event.target.value)}
            placeholder="Pixel Pioneers"
          />
        </label>
        <label>
	          {t('teamStatus.requiredMembers')}
          <input
            min="2"
            type="number"
            value={form.requiredMembers}
            onChange={(event) => updateField('requiredMembers', event.target.value)}
          />
        </label>
        <label>
	          {t('teamStatus.currentMembers')}
          <input
            min="1"
            max={requiredMembers}
            type="number"
            value={form.currentMembers}
            onChange={(event) => updateField('currentMembers', event.target.value)}
          />
        </label>
	        <label>
	          {t('teamStatus.stillNeeded')}
	          <input value={remaining === 0 ? t('class.complete') : t('status.stillLookingCount', { count: remaining })} readOnly />
        </label>
        <label className="wide">
	          {t('teamStatus.studentIds')}
          <textarea
            value={form.externalStudentIds}
            onChange={(event) => updateField('externalStudentIds', event.target.value)}
            rows="4"
            placeholder={'s1234567\ns2345678'}
          />
	          <span className="field-helper">{t('teamStatus.helper')}</span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="hero-actions">
        <button
          className="primary"
          type="button"
          disabled={saving}
          onClick={() => onSave({
            teamName: form.teamName,
            requiredMembers,
            currentMembers,
            externalStudentIds: form.externalStudentIds
              .split(/\n|,/)
              .map((item) => item.trim())
              .filter(Boolean),
          })}
        >
	          {saving ? t('request.saving') : t('teamStatus.save')}
	        </button>
	        <button className="secondary" type="button" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </section>
  );
}

function ClassDetailPage({
  classId,
  profile,
  profileId,
  onBack,
  onJoinClass,
  onFindTeammates,
	  onViewMatches,
	  onOpenChat,
	  t = translate.bind(null, 'en'),
	}) {
	  const [state, setState] = useState({
	    loading: true,
	    error: '',
	    actionError: '',
	    actionSuccess: '',
	    classItem: null,
	    requests: [],
	    progressByRequest: {},
		    teamStatus: null,
		    editingTeamStatus: false,
		    savingTeamStatus: false,
		    editingRequest: null,
		    deleteRequestTarget: null,
		    savingRequest: false,
		  });

  useEffect(() => {
    let alive = true;

	    if (!profileId || !classId) {
	      setState({
	        loading: false,
	        error: '',
	        actionError: '',
	        actionSuccess: '',
	        classItem: null,
	        requests: [],
	        progressByRequest: {},
		        teamStatus: null,
		        editingTeamStatus: false,
		        savingTeamStatus: false,
		        editingRequest: null,
		        deleteRequestTarget: null,
		        savingRequest: false,
		      });
      return () => {
        alive = false;
      };
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

	    Promise.all([
	      listMyClassesWithStatus(profileId),
	      listMyTeamRequests(profileId),
	      getMyClassTeamStatus(profileId, classId).catch(() => null),
	    ])
	      .then(async ([classes, requests, teamStatus]) => {
        const classItem = classes.find((item) => item.id === classId) || null;
        const classRequests = requests.filter((request) => request.class_id === classId);
        const progressEntries = await Promise.all(
          classRequests.map(async (request) => {
            try {
              return [request.id, await getTeamRequestProgress(request.id, profileId)];
            } catch {
              return [request.id, { found_count: 0, teammates: [] }];
            }
          }),
        );

        if (alive) {
          setState({
            loading: false,
	            error: '',
	            actionError: '',
	            classItem,
	            requests: classRequests,
	            progressByRequest: Object.fromEntries(progressEntries),
	            teamStatus,
	          });
        }
      })
      .catch((err) => {
        if (alive) {
          setState({
            loading: false,
	            error: getFriendlyError(err, "We couldn't load this class right now. Please try again."),
	            actionError: '',
	            actionSuccess: '',
	            classItem: null,
	            requests: [],
	            progressByRequest: {},
		            teamStatus: null,
		            editingTeamStatus: false,
		            savingTeamStatus: false,
		            editingRequest: null,
		            deleteRequestTarget: null,
		            savingRequest: false,
		          });
        }
      });

    return () => {
      alive = false;
    };
  }, [profileId, classId]);

  if (!profileId) {
    return (
      <main className="screen compact">
        <section className="empty-state">
	          <p>{t('profile.createFirst')}</p>
        </section>
      </main>
    );
  }

  if (state.loading) {
	    return <main className="screen compact"><p className="loading">{t('classes.loading')}</p></main>;
  }

  if (state.error || !state.classItem) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>{state.error || t('class.notAvailable')}</p>
	          <button className="primary" onClick={onJoinClass}>{t('join.joinClass')}</button>
        </section>
      </main>
    );
  }

	  const activeRequest = state.requests.find((request) => request.status === 'looking') || null;
	  const selectedRequest = activeRequest || pickClassRequest(state.requests, state.classItem.id);
	  const progress = selectedRequest ? state.progressByRequest[selectedRequest.id] || { found_count: 0, teammates: [] } : null;
	  const requestMetrics = selectedRequest ? getTeamProgress(selectedRequest, progress) : null;
	  const editableStatus = getTeamStatusFromEditableTeam(state.teamStatus, t);
	  const metrics = editableStatus?.metrics || requestMetrics;
	  const status = editableStatus || classTeamStatus(state.classItem, selectedRequest, requestMetrics, t);
	  const teammates = progress?.teammates || [];
	  const classClosed = state.classItem.formation_status === 'formation_complete' || state.classItem.status === 'closed';

		  const saveTeamStatus = async (values) => {
	    setState((current) => ({ ...current, savingTeamStatus: true, actionError: '', actionSuccess: '' }));

	    try {
	      const saved = await saveClassTeamStatus({
	        profileId,
	        classId: state.classItem.id,
	        ...values,
	      });
	      setState((current) => ({
	        ...current,
	        savingTeamStatus: false,
	        editingTeamStatus: false,
	        teamStatus: saved,
	        actionSuccess: t('teamStatus.saved'),
	      }));
	    } catch (err) {
	      setState((current) => ({
	        ...current,
	        savingTeamStatus: false,
	        actionError: getFriendlyError(err, t('teamStatus.saveFail')),
	      }));
	    }
		  };

		  const updateClassRequest = async (updatedRequest) => {
		    const updatedProgress = await getTeamRequestProgress(updatedRequest.id, profileId)
		      .catch(() => ({ found_count: 0, teammates: [] }));

		    setState((current) => ({
		      ...current,
		      editingRequest: null,
		      requests: current.requests.map((request) =>
		        request.id === updatedRequest.id ? { ...request, ...updatedRequest } : request,
		      ),
		      progressByRequest: {
		        ...current.progressByRequest,
		        [updatedRequest.id]: updatedProgress,
		      },
		      actionSuccess: t('opportunities.updated'),
		      actionError: '',
		    }));
		  };

		  const deleteClassRequest = async () => {
		    const target = state.deleteRequestTarget;
		    if (!target) return;

		    setState((current) => ({ ...current, savingRequest: true, actionError: '', actionSuccess: '' }));

		    try {
		      const updated = await cancelTeamRequest(target.id, profileId);
		      setState((current) => ({
		        ...current,
			        savingRequest: false,
			        deleteRequestTarget: null,
			        requests: current.requests.filter((request) => request.id !== updated.id),
			        actionSuccess: t('request.deleted'),
			        actionError: '',
			      }));
		    } catch (err) {
		      console.error('Class request delete failed', err);
		      setState((current) => ({
		        ...current,
		        savingRequest: false,
		        actionError: t('request.deleteFail'),
		      }));
		    }
		  };

		  if (state.editingRequest && profile) {
		    return (
		      <RequestForm
		        profile={profile}
		        request={state.editingRequest}
		        mode="edit"
		        classContext={state.classItem}
		        onBack={() => setState((current) => ({ ...current, editingRequest: null, actionError: '', actionSuccess: '' }))}
		        onUpdated={updateClassRequest}
		        t={t}
		      />
		    );
		  }

	  return (
    <main className="screen">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
	        {t('classes.title')}
      </button>

      <div className="results-header">
        <div>
	          <p className="eyebrow">{t('class.detail')}</p>
          <h2>{getClassDisplay(state.classItem)}</h2>
          <p>{state.classItem.university} | {schoolLabel(state.classItem.school)} | {state.classItem.major}</p>
        </div>
      </div>

      <div className="request-management-grid">
        <section className="request-panel standalone">
	          <p className="eyebrow">{t('class.info')}</p>
          <dl>
	            <div><dt>{t('class.course')}</dt><dd>{state.classItem.course_name || state.classItem.course}</dd></div>
	            <div><dt>{t('class.courseCode')}</dt><dd>{state.classItem.course_code}</dd></div>
		            <div><dt>{t('class.session')}</dt><dd>{getSessionDisplay(state.classItem)}</dd></div>
		            <div><dt>{t('join.lecturer')}</dt><dd>{state.classItem.lecturer_name || t('common.notSpecified')}</dd></div>
		            <div><dt>{t('classes.classCode')}</dt><dd>{state.classItem.class_code || state.classItem.demo_class_code || state.classItem.join_code}</dd></div>
		            <div><dt>{t('class.requiredSize')}</dt><dd>{state.classItem.required_members_per_team || 4}</dd></div>
		            <div><dt>{t('class.deadline')}</dt><dd>{state.classItem.team_formation_deadline || t('common.notSpecified')}</dd></div>
		            <div><dt>{t('class.joinStatus')}</dt><dd>{classNetworkStatusLabel(state.classItem.network_status, t)}</dd></div>
	          </dl>
	        </section>

        <section className="request-panel standalone">
	          <p className="eyebrow">{t('class.teamStatus')}</p>
	          <span className={`status-badge ${status.tone}`}>{translateStatusText(status.label, t)}</span>
	          {metrics ? (
	            <>
	              <div className="progress-header">
	                <strong>{teammateCountSummary(metrics, t)}</strong>
		                <span>{metrics.complete ? t('class.complete') : `${metrics.remaining} ${t('class.missing')}`}</span>
              </div>
              <div className="progress-track" aria-label="Class team formation progress">
                <div className="progress-fill" style={{ width: `${metrics.percent}%` }} />
              </div>
	              <p className={metrics.complete ? 'success' : 'note'}>{translateStatusText(status.detail, t)}</p>
            </>
          ) : (
		              <p className="note">{translateStatusText(status.detail, t)}</p>
	          )}

	          {state.teamStatus?.team_name && (
		            <p className="note">{t('class.teamName')}: {state.teamStatus.team_name}</p>
	          )}

	          {state.teamStatus?.members?.length > 0 && (
	            <section className="matched-list compact-list">
		              <h3>{t('class.existing')}</h3>
	              {state.teamStatus.members.map((member) => (
	                <article className="matched-row" key={member.id || member.student_identifier}>
	                  <div>
	                    <strong>{member.display_name || member.student_identifier}</strong>
	                    <span>
	                      {member.is_on_teamergency
		                        ? t('class.linked')
		                        : t('class.notOnApp')}
	                    </span>
	                  </div>
	                </article>
	              ))}
	            </section>
	          )}

		          {classClosed && <p className="note">{t('class.closed')}</p>}
	
	          <div className="hero-actions">
	            <button
	              className="secondary"
	              type="button"
	              onClick={() => setState((current) => ({ ...current, editingTeamStatus: true, actionError: '', actionSuccess: '' }))}
	            >
	              <Pencil size={18} />
		              {t('class.editStatus')}
	            </button>
	            {activeRequest ? (
	              <button className="primary" onClick={() => onViewMatches(activeRequest.id)}>
		                {t('class.viewMatches')}
	              </button>
	            ) : !status.complete && !classClosed && (
	              <button className="primary" onClick={() => onFindTeammates(state.classItem, state.teamStatus)}>
		                {t('class.findTeammates')}
	              </button>
	            )}
	          </div>
	        </section>
	      </div>

	      {state.editingTeamStatus && (
	        <TeamStatusEditor
	          classItem={state.classItem}
	          teamStatus={state.teamStatus}
	          saving={state.savingTeamStatus}
	          error={state.actionError}
	          onSave={saveTeamStatus}
		          onCancel={() => setState((current) => ({ ...current, editingTeamStatus: false, actionError: '' }))}
		          t={t}
		        />
	      )}
	
	      {selectedRequest && (
        <section className="request-panel standalone">
          <div className="results-header compact-header">
            <div>
	              <p className="eyebrow">{t('class.currentRequest')}</p>
              <h2>{getCourseDisplay(selectedRequest)}</h2>
            </div>
	            {activeRequest && (
	              <div className="hero-actions">
	                <button className="secondary" onClick={() => setState((current) => ({ ...current, editingRequest: activeRequest, actionError: '', actionSuccess: '' }))}>
	                  <Pencil size={18} />
		                  {t('request.editClass')}
	                </button>
	                <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, deleteRequestTarget: activeRequest, actionError: '', actionSuccess: '' }))}>
	                  <Trash2 size={18} />
		                  {t('request.deleteClass')}
	                </button>
	                <button className="secondary" onClick={() => onViewMatches(activeRequest.id)}>
		                  {t('class.findMatches')}
	                </button>
	              </div>
	            )}
          </div>
          <dl>
            <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(selectedRequest.skills_needed)}</dd></div>
            <div><dt>{t('request.teamSize')}</dt><dd>{getTotalTeamSize(selectedRequest)}</dd></div>
            <div><dt>{t('opportunities.initiallyLooking')}</dt><dd>{getInitialNeeded(selectedRequest)}</dd></div>
            <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(selectedRequest))}</dd></div>
            <div><dt>{t('matches.teamStatus')}</dt><dd>{requestStatusLabel(selectedRequest.status, t)}</dd></div>
            <div><dt>{t('request.anythingElse')}</dt><dd>{selectedRequest.requirements || t('common.notSpecified')}</dd></div>
          </dl>

          <section className="matched-list">
	            <h3>{t('class.teamMembersFound')} ({metrics?.matchedCount || 0})</h3>
            {teammates.length === 0 ? (
	              <p className="note">{t('class.noConnected')}</p>
            ) : (
              teammates.map((teammate) => (
                <article className="matched-row" key={teammate.profile_id}>
                  <div>
                    <strong>{displayName(teammate.full_name)} {teammate.is_demo && <DemoBadge />}</strong>
                    <span>{teammate.major || t('common.notSpecified')}</span>
                  </div>
                  <button className="secondary" onClick={() => onOpenChat(teammate.connection_id)}>
                    <MessageCircle size={18} />
	                    {t('common.message')}
                  </button>
                </article>
              ))
            )}
	          </section>
	        </section>
	      )}

		      {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
		      {state.actionError && !state.editingTeamStatus && <p className="error">{state.actionError}</p>}
		      {state.deleteRequestTarget && (
		        <div className="modal-backdrop" role="presentation">
		          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('request.deleteClassTitle')}>
		            <div className="modal-header">
		              <div>
		                <p className="eyebrow">{t('request.deleteClassTitle')}</p>
		                <h2>{t('request.deleteClassQuestion')}</h2>
		              </div>
		              <button className="ghost" onClick={() => setState((current) => ({ ...current, deleteRequestTarget: null }))} type="button">{t('common.close')}</button>
		            </div>
		            <p className="note">{t('request.deleteClassHelper')}</p>
		            <div className="hero-actions">
		              <button className="secondary" onClick={() => setState((current) => ({ ...current, deleteRequestTarget: null }))} type="button">
		                {t('common.cancel')}
		              </button>
		              <button className="primary danger-action" onClick={deleteClassRequest} disabled={state.savingRequest}>
		                {state.savingRequest ? t('common.updating') : t('request.deleteClassConfirm')}
		              </button>
		            </div>
		          </section>
		        </div>
		      )}
	
	      {!selectedRequest && status.complete && (
        <section className="request-panel standalone">
	          <p className="success">{t('class.alreadyComplete')}</p>
        </section>
      )}
    </main>
  );
}

function LecturerDashboard({ activeRole, lecturerSession, profileId, onOpenProfile, onOpenChat, t = translate.bind(null, 'en') }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);
  const [confirmingTeams, setConfirmingTeams] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [classForm, setClassForm] = useState({
    course_name: 'Digital Media Studio 4',
    course_code: 'COMM2784',
    major: 'Digital Media',
    school: 'SCD',
    session_code: '01',
    approximate_student_count: 28,
    required_members_per_team: 4,
    team_formation_deadline: '2026-09-15',
  });
  const [closingState, setClosingState] = useState(null);

  useEffect(() => {
    let alive = true;

    if (activeRole !== 'lecturer' || !lecturerSession) {
      setLoading(false);
      setClasses([]);
      setSelectedClassId('');
      return () => {
        alive = false;
      };
    }

    const loadDashboards = () => {
      setLoading(true);
      setError('');
      getDemoLecturerDashboards({
      university: lecturerSession.university,
      lecturerId: lecturerSession.lecturerId,
      })
        .then((rows) => {
          if (!alive) return;
          setClasses(rows);
          setSelectedClassId((current) => current || rows[0]?.id || '');
        })
        .catch((err) => {
          if (alive) {
            setClasses([]);
            setError(getFriendlyError(err, "We couldn't load lecturer dashboard data. Please run the Phase 2 demo migration and try again."));
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };

    loadDashboards();

    return () => {
      alive = false;
    };
  }, [activeRole, lecturerSession?.university, lecturerSession?.lecturerId]);

  if (activeRole !== 'lecturer') {
    return (
      <main className="screen compact">
        <section className="empty-state">
	          <p>{t('lecturer.needLecturerRole')}</p>
	          <button className="primary" onClick={onOpenProfile}>{t('profile.myProfile')}</button>
        </section>
      </main>
    );
  }

  if (!lecturerSession) {
    return (
      <main className="screen compact">
        <section className="empty-state">
	          <p>{t('lecturer.needProfile')}</p>
	          <button className="primary" onClick={onOpenProfile}>{t('profile.myProfile')}</button>
        </section>
      </main>
    );
  }

  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId) || classes[0] || null;
  const teamCompleteCount = Number(selectedClass?.students_in_teams || 0);
  const stillFormingCount = Number(selectedClass?.students_looking || 0);
  const studentsNeedingAttentionCount = Number(selectedClass?.students_without_team || 0);
  const noRequestCount = Math.max(0, studentsNeedingAttentionCount - stillFormingCount);
  const attentionStudents = (selectedClass?.students || []).filter((student) => {
    const status = String(student.status || '').toLowerCase();
    const remaining = Number(student.remaining_teammates || 0);
    return remaining > 0 || status.includes('looking') || status.includes('joined') || status.includes('no request');
  });
  const unresolvedCount = attentionStudents.length;
  const proposedTeams = attentionStudents.length
    ? attentionStudents.reduce((groups, student, index) => {
        const groupIndex = Math.floor(index / Math.max(2, Number(selectedClass?.required_members_per_team || 4)));
        groups[groupIndex] = [...(groups[groupIndex] || []), student];
        return groups;
      }, [])
    : [];

  const updateClassForm = (field, value) => {
    setClassForm((current) => ({ ...current, [field]: value }));
  };

  const createClass = async (event) => {
    event.preventDefault();
    setActionError('');
    setActionMessage('');
    setCreatingClass(true);

    try {
      const created = await createLecturerClass({
        ...classForm,
        lecturer_profile_id: profileId,
        university: lecturerSession.university,
        lecturer_name: lecturerSession.lecturerName,
        lecturer_id: lecturerSession.lecturerId,
      });
      setClasses((current) => [created, ...current]);
      setSelectedClassId(created.id);
      setCreateOpen(false);
      setActionMessage(`Class created. Class code: ${created.join_code || created.lecturer_access_code}`);
    } catch (err) {
      setActionError(getFriendlyError(err, 'Could not create class. Run supabase/class_team_status_open_opportunities_phase.sql in Supabase and try again.'));
    } finally {
      setCreatingClass(false);
    }
  };

  const remindStudent = async (student) => {
    setActionError('');
    setActionMessage('');
    try {
      await sendLecturerReminder({
        lecturerProfileId: profileId,
        studentProfileId: student.profile_id,
        classId: selectedClass.id,
        message: `Your lecturer noticed that you have not started looking for teammates for ${selectedClass.course_name}. Do you need help forming a team?`,
      });
      setActionMessage(`Reminder sent to ${displayName(student.full_name)}.`);
    } catch (err) {
      setActionError(getFriendlyError(err, 'Could not send reminder yet. Run supabase/class_team_status_open_opportunities_phase.sql in Supabase and try again.'));
    }
  };

  const messageStudent = async (student) => {
    setActionError('');
    setActionMessage('');
    try {
      const thread = await openLecturerStudentThread({
        lecturerProfileId: profileId,
        studentProfileId: student.profile_id,
        classId: selectedClass.id,
        message: `Hi, I noticed your team is still incomplete for ${selectedClass.course_name}. Are you having difficulty finding teammates or do you need help?`,
      });
      onOpenChat(thread.id);
    } catch (err) {
      setActionError(getFriendlyError(err, 'Could not open lecturer message thread yet. Run supabase/class_team_status_open_opportunities_phase.sql in Supabase and try again.'));
    }
  };

  const closeFormation = async () => {
    if (!selectedClass) return;
    setActionError('');
    setActionMessage('');

    try {
      const result = await closeClassTeamFormation({ lecturerProfileId: profileId, classId: selectedClass.id });
      setClosingState(result);
      setActionMessage(result.unresolved_count > 0
        ? t('lecturer.unresolvedWarning', { count: result.unresolved_count })
        : t('lecturer.closeComplete'));
    } catch (err) {
      setActionError(getFriendlyError(err, 'Could not close team formation yet. Run supabase/class_team_status_open_opportunities_phase.sql in Supabase and try again.'));
    }
  };

  const confirmProposedTeams = async () => {
    if (!selectedClass || proposedTeams.length === 0) return;
    setActionError('');
    setActionMessage('');
    setConfirmingTeams(true);

    const proposalPayload = proposedTeams.map((team, index) => ({
      team_name: `Lecturer-assisted Team ${index + 1}`,
      students: team.map((student) => ({
        profile_id: student.profile_id,
        full_name: student.full_name,
        student_id: student.student_id || null,
      })),
    }));

    try {
      const result = await confirmClassTeamProposals({
        lecturerProfileId: profileId,
        classId: selectedClass.id,
        proposals: proposalPayload,
      });
      setClasses((current) =>
        current.map((classItem) =>
          classItem.id === selectedClass.id
            ? {
                ...classItem,
                formation_status: result.formation_status,
                formation_rate: 100,
                students_looking: 0,
                students_without_team: 0,
                students_in_teams: classItem.approximate_student_count || classItem.total_students || classItem.students_in_teams,
                students: [],
              }
            : classItem,
        ),
      );
      setClosingState({ ...result, unresolved_count: 0, showProposal: false });
      setActionMessage('Proposed teams confirmed. Team formation is now complete for this class.');
    } catch (err) {
      setActionError(getFriendlyError(err, 'Could not confirm proposed teams yet. Run supabase/class_team_status_open_opportunities_phase.sql in Supabase and try again.'));
    } finally {
      setConfirmingTeams(false);
    }
  };

  return (
    <main className="screen">
	      <div className="results-header">
	        <div>
		          <p className="eyebrow">{t('lecturer.dashboard')}</p>
	          <h2>{lecturerSession.lecturerName}'s demo classes</h2>
	          <p>{lecturerSession.university} · Demo lecturer ID {lecturerSession.lecturerId}</p>
	        </div>
	        <button className="primary" type="button" onClick={() => setCreateOpen((current) => !current)}>
	          <Plus size={18} />
		          {t('lecturer.createClass')}
	        </button>
	      </div>

	      {createOpen && (
	        <section className="request-panel standalone">
		          <p className="eyebrow">{t('lecturer.createClass')}</p>
	          <form className="form-grid" onSubmit={createClass}>
	            <label>
		              Course / Subject Name
	              <input value={classForm.course_name} onChange={(event) => updateClassForm('course_name', event.target.value)} required />
	            </label>
	            <label>
	              Course Code
	              <input value={classForm.course_code} onChange={(event) => updateClassForm('course_code', event.target.value.toUpperCase())} required />
	            </label>
	            <label>
	              Academic Field / Major
	              <select value={classForm.major} onChange={(event) => updateClassForm('major', event.target.value)} required>
	                {Object.values(majorsBySchool).flat().map((major) => (
	                  <option value={major} key={major}>{major}</option>
	                ))}
	              </select>
	            </label>
	            <label>
	              Session
	              <input value={classForm.session_code} onChange={(event) => updateClassForm('session_code', event.target.value)} placeholder="01" required />
	            </label>
	            <label>
	              Approx. Number of Students
	              <input min="0" type="number" value={classForm.approximate_student_count} onChange={(event) => updateClassForm('approximate_student_count', event.target.value)} required />
	            </label>
	            <label>
	              Required Members Per Team
	              <input min="2" type="number" value={classForm.required_members_per_team} onChange={(event) => updateClassForm('required_members_per_team', event.target.value)} required />
	            </label>
	            <label className="wide">
		              {t('class.deadline')}
	              <input type="date" value={classForm.team_formation_deadline} onChange={(event) => updateClassForm('team_formation_deadline', event.target.value)} />
	            </label>
	            <button className="primary wide" type="submit" disabled={creatingClass}>
		              {creatingClass ? t('request.creating') : t('lecturer.createClass')}
	            </button>
	          </form>
	        </section>
	      )}

      <div className="request-management-grid">
        <section className="request-panel standalone">
	          <p className="eyebrow">{t('lecturer.myClasses')}</p>
          <div className="request-summary-box">
	            <p>{t('lecturer.demoOnly')}</p>
          </div>
	          {loading && <p className="loading">{t('classes.loading')}</p>}
          {error && <p className="error">{error}</p>}
	          {!loading && !error && classes.length === 0 && <p className="note">{t('lecturer.noClasses')}</p>}
          <div className="request-list">
            {classes.map((classItem) => (
              <article className={selectedClassId === classItem.id ? 'request-list-row selected' : 'request-list-row'} key={classItem.id}>
                <div>
                  <h3>{getClassDisplay(classItem)}</h3>
                  <p>{schoolLabel(classItem.school)} · {classItem.major}</p>
                  <p className="note">Class code: {classItem.class_code}</p>
                </div>
                <button className="secondary" type="button" onClick={() => setSelectedClassId(classItem.id)}>
	                  {t('classes.open')}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="request-panel standalone">
          {!selectedClass ? (
            <section className="empty-state inline-empty">
	              <p>{t('lecturer.selectClass')}</p>
            </section>
          ) : (
            <section className="progress-panel">
	              <div className="progress-header">
	                <strong>{getClassDisplay(selectedClass)}</strong>
	                <span>{selectedClass.formation_rate ?? selectedClass.team_formation_rate ?? 0}% formed</span>
	              </div>
	              <div className="stats-grid">
		                <div><strong>{selectedClass.approximate_student_count || selectedClass.total_students}</strong><span>{t('lecturer.totalStudents')}</span></div>
		                <div><strong>{teamCompleteCount}</strong><span>{t('lecturer.teamComplete')}</span></div>
		                <div><strong>{stillFormingCount}</strong><span>{t('lecturer.stillForming')}</span></div>
		                <div><strong>{noRequestCount}</strong><span>{t('lecturer.noRequest')}</span></div>
		                <div><strong>{selectedClass.teams_formed || 0}</strong><span>{t('lecturer.teamsFormed')}</span></div>
		                <div><strong>{selectedClass.average_match_usefulness || 0} / 5</strong><span>{t('lecturer.matchUsefulness')}</span></div>
	              </div>
	              <div className="hero-actions">
	                <button className="secondary" type="button" onClick={closeFormation}>
		                  {t('lecturer.closeFormation')}
	                </button>
	              </div>
		              {closingState?.unresolved_count > 0 && (
		                <section className="inline-prompt warning-prompt">
		                  <h3>{t('lecturer.unresolvedWarning', { count: closingState.unresolved_count })}</h3>
		                  <p>{t('lecturer.closeHelper')}</p>
		                  <div className="hero-actions">
	                    <button className="secondary" type="button" onClick={() => attentionStudents.forEach((student) => remindStudent(student))}>
		                      {t('lecturer.messageStudents')}
	                    </button>
	                    <button className="primary" type="button" onClick={() => setClosingState((current) => ({ ...current, showProposal: true }))}>
		                      {t('lecturer.autoForm')}
	                    </button>
	                  </div>
	                </section>
	              )}
	              {closingState?.showProposal && (
	                <section className="request-summary-box">
		                  <p className="eyebrow">{t('lecturer.proposedTeams')}</p>
		                  {proposedTeams.map((team, index) => (
		                    <p key={`proposal-${index}`}>
		                      {t('lecturer.teamLabel', { number: index + 1 })}: {team.map((student) => displayName(student.full_name)).join(', ')}
		                    </p>
		                  ))}
	                  <button className="primary" type="button" onClick={confirmProposedTeams} disabled={confirmingTeams}>
		                    {confirmingTeams ? t('lecturer.confirming') : t('lecturer.confirmFormation')}
	                  </button>
		                  <p className="field-helper">{t('lecturer.proposalHelper')}</p>
	                </section>
	              )}
	              <div className="matched-list">
		                <h3>{t('lecturer.studentsAttention')} ({studentsNeedingAttentionCount || attentionStudents.length})</h3>
	                {studentsNeedingAttentionCount > attentionStudents.length && (
		                  <p className="note">{t('lecturer.representative')}</p>
	                )}
		                {attentionStudents.length === 0 && <p className="note">{t('lecturer.noIntervention')}</p>}
	                {attentionStudents.map((student) => (
	                  <article className="matched-row" key={student.profile_id}>
	                    <div>
	                      <strong>{displayName(student.full_name)}</strong>
		                      <span>{student.major || t('common.notSpecified')} · {student.status}</span>
	                      {Number(student.total_team_size) > 0 && (
	                        <span>
	                          {t('status.memberProgress', { current: student.found_count || 0, total: student.total_team_size })}
	                          {Number(student.remaining_teammates) > 0 ? ` · ${t('lecturer.missingCount', { count: student.remaining_teammates })}` : ''}
	                        </span>
		                      )}
		                      <span>{student.network_status || t('lecturer.noPreference')}</span>
	                    </div>
	                    <div className="hero-actions">
	                      <button className="secondary" type="button" onClick={() => remindStudent(student)}>
		                        {t('lecturer.remind')}
	                      </button>
	                      <button className="primary" type="button" onClick={() => messageStudent(student)}>
	                        <MessageCircle size={18} />
		                        {t('lecturer.messageStudent')}
	                      </button>
	                    </div>
	                  </article>
	                ))}
	              </div>
	              {actionMessage && <p className="success">{actionMessage}</p>}
	              {actionError && <p className="error">{actionError}</p>}
	            </section>
	          )}
        </section>
      </div>
    </main>
  );
}

function ProfileForm({ initialRole = 'student', initialData = {}, onSaved, t = translate.bind(null, 'en') }) {
  const initialDataSignature = JSON.stringify(initialData || {});
  const [form, setForm] = useState(() => createProfileFormState(initialRole, initialData));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isLecturer = form.role === 'lecturer';
  const profileSkillOptions = mergeOptionSets(getSkillsForSchool(form.school), form.skills);
  const profileSchoolOptions = getSchoolsForUniversity(form.university);

  useEffect(() => {
    setForm(createProfileFormState(initialRole, initialData));
    setFieldErrors({});
    setError('');
  }, [initialRole, initialDataSignature]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const updateSchool = (value) => {
    setForm((current) => ({
      ...current,
      school: value,
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
      skills: filterSkillsForSchool(current.skills, value),
    }));
    setFieldErrors((current) => ({ ...current, school: '', major: '', skills: '' }));
  };

  const toggleProfileSkill = (skill) => {
    setForm((current) => ({
      ...current,
      skills: toggleValue(current.skills, skill),
      other_skill: skill === 'Other' && current.skills.includes('Other') ? '' : current.other_skill,
    }));
    setFieldErrors((current) => ({ ...current, skills: '' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const skills = getProfileSkillsFromForm(form);
    const nextFieldErrors = getProfileFieldErrors({ ...form, skills }, t);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError(t('validation.fixMissing'));
      return;
    }

    if (!form.consent_public_visibility) {
      setError(t('validation.consent'));
      return;
    }

    setSaving(true);

    try {
      const role = isLecturer ? 'lecturer' : 'student';
      const profilePayload = {
        full_name: form.full_name.trim(),
        university: form.university || 'RMIT University',
        school: form.school.trim(),
        major: isLecturer ? 'Lecturer' : form.major.trim(),
        skills: isLecturer ? ['Teaching'] : skills,
        avatar_url: form.avatar_url || null,
        availability: [],
        preferred_active_time: null,
        work_styles: isLecturer ? [] : form.work_styles,
	        contact_type: isLecturer ? 'email' : form.contact_type,
	        contact_value: isLecturer ? form.lecturer_contact_detail.trim() : form.contact_value.trim() || null,
        short_bio: isLecturer
          ? form.short_bio.trim() || 'Lecturer profile for class team-formation monitoring.'
          : form.short_bio.trim(),
        is_available: !isLecturer,
        consent_public_visibility: true,
	        role,
	        lecturer_title: isLecturer ? form.lecturer_title.trim() || null : null,
	        lecturer_id: isLecturer ? form.lecturer_id.trim() : null,
	        academic_field: isLecturer ? form.academic_field.trim() : form.major.trim(),
	        lecturer_contact_method: isLecturer ? form.lecturer_contact_method : null,
	        lecturer_contact_detail: isLecturer ? form.lecturer_contact_detail.trim() : null,
	        student_id: isLecturer ? null : form.student_id.trim() || null,
	      };
      let profile;
      try {
        profile = form.id
          ? await updateProfile(form.id, profilePayload)
          : await createProfile(profilePayload);
      } catch (updateError) {
        if (!form.id) throw updateError;
        console.error('Existing profile could not be updated; creating an owned Google profile instead.', updateError);
        profile = await createProfile(profilePayload);
      }
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
	            <p className="eyebrow">{t('profile.createUserProfile')}</p>
	            <h2>{t('profile.completeTitle')}</h2>
              <p className="note">{isLecturer ? t('profile.lecturerProfileHint') : t('profile.studentProfileHint')}</p>
              <p className="signed-in-line">{t('profile.role')}: {isLecturer ? t('profile.lecturer') : t('profile.student')}</p>
          </div>
        </div>

        <div className="form-grid">
          <label>
	            {t('profile.fullName')}
            <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
            <FieldError message={fieldErrors.full_name} />
          </label>
          <label>
	            {t('profile.university')}
            <select value={form.university} onChange={(event) => updateField('university', event.target.value)} required>
              {universityOptions.map((university) => (
                <option value={university.value} key={university.value}>{university.label}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.university} />
          </label>
          <label>
	            {isLecturer ? t('profile.department') : t('profile.school')}
            <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
	              <option value="">{isLecturer ? t('profile.selectDepartment') : t('profile.selectSchool')}</option>
              {profileSchoolOptions.map((school) => (
                <option value={school.value} key={school.value}>{school.label}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.school} />
          </label>
	          {isLecturer ? (
	            <>
	              <label>
	                {t('profile.lecturerTitle')}
	                <input
	                  value={form.lecturer_title}
	                  onChange={(event) => updateField('lecturer_title', event.target.value)}
	                  placeholder="Course coordinator, lecturer, tutor..."
	                />
	              </label>
	              <label>
	                {t('profile.academicField')}
	                  <select
	                    value={form.academic_field}
	                    onChange={(event) => updateField('academic_field', event.target.value)}
	                    required
	                  >
		                  <option value="">{t('request.field')}</option>
	                  {opportunityFields.map((field) => (
	                    <option value={field} key={field}>{field}</option>
	                  ))}
	                </select>
                    <FieldError message={fieldErrors.academic_field} />
	              </label>
	              <label>
	                {t('profile.lecturerId')}
	                <input
	                  value={form.lecturer_id}
	                  onChange={(event) => updateField('lecturer_id', event.target.value)}
	                  placeholder="v123456"
	                  required
	                />
	                <span className="field-helper">{t('profile.demoLecturerIds')}: {demoLecturerHelperText}</span>
                    <FieldError message={fieldErrors.lecturer_id} />
	              </label>
	              <label>
		                {t('profile.preferredContact')}
	                <select
	                  value={form.lecturer_contact_method}
	                  onChange={(event) => updateField('lecturer_contact_method', event.target.value)}
	                  required
	                >
	                  {lecturerContactMethods.map((method) => (
	                    <option value={method} key={method}>{method}</option>
	                  ))}
	                </select>
	              </label>
	              <label className="wide">
		                {t('profile.contactDetail')}
	                <input
	                  value={form.lecturer_contact_detail}
	                  onChange={(event) => updateField('lecturer_contact_detail', event.target.value)}
	                  placeholder="name@university.edu or Microsoft Teams handle"
	                  required
	                />
                    <FieldError message={fieldErrors.lecturer_contact_detail} />
	              </label>
	            </>
	          ) : (
	            <>
	              <label>
		                {t('profile.major')}
	                <select value={form.major} onChange={(event) => updateField('major', event.target.value)} required>
	                  <option value="">{t('profile.major')}</option>
                  {(majorsBySchool[form.school] || []).map((major) => (
                    <option value={major} key={major}>{major}</option>
                  ))}
	                </select>
                    <FieldError message={fieldErrors.major} />
	              </label>
	              <label>
		                {t('profile.studentId')}
	                <input
	                  value={form.student_id}
	                  onChange={(event) => updateField('student_id', event.target.value)}
	                  placeholder="s1234567"
                    required
	                />
                    <FieldError message={fieldErrors.student_id} />
	              </label>
	              <fieldset className="wide">
	                <legend>{t('profile.skills')}</legend>
	                <p className="field-helper">{t('profile.skillHelper')}</p>
                    <FieldError message={fieldErrors.skills} />
                <CheckboxGrid
                  options={profileSkillOptions}
                  selected={form.skills}
                  onToggle={toggleProfileSkill}
                />
                {form.skills.includes('Other') && (
                  <input
                    value={form.other_skill}
                    onChange={(event) => updateField('other_skill', event.target.value)}
	                    placeholder={t('profile.addSkill')}
                  />
                )}
	              </fieldset>
                <fieldset className="wide">
                  <legend>{t('profile.workStyle')}</legend>
                  <CheckboxGrid
                    options={workStyleOptions}
                    selected={form.work_styles}
                    onToggle={(style) => updateField('work_styles', toggleValue(form.work_styles, style))}
                  />
                </fieldset>
            </>
          )}
	          {!isLecturer && (
	            <>
	              <label>
		                {t('profile.contactMethod')}
	                <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
	                  {contactTypes.map((type) => (
	                    <option value={type} key={type}>{contactLabel(type)}</option>
	                  ))}
	                </select>
	              </label>
	              <label>
		                {t('profile.contactInfo')}
	                <input
	                  value={form.contact_value}
	                  onChange={(event) => updateField('contact_value', event.target.value)}
	                  placeholder="name@email.com or @handle"
	                  required
	                />
                    <FieldError message={fieldErrors.contact_value} />
	              </label>
	            </>
	          )}
          <label className="wide">
	            {isLecturer ? t('profile.bioNote') : t('profile.shortBio')}
            <textarea
              value={form.short_bio}
              onChange={(event) => updateField('short_bio', event.target.value)}
              rows="4"
              required={!isLecturer}
            />
            {!isLecturer && <FieldError message={fieldErrors.short_bio} />}
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
	            {t('profile.consent')}
          </span>
        </label>
        <p className="field-helper">{t('profile.completeLead')}</p>

        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={saving || !form.consent_public_visibility}>
	          {saving ? t('request.creating') : t('profile.createProfile')}
        </button>
      </form>
    </main>
  );
}

function ProfileSaved({ profile, onContinue, t = translate.bind(null, 'en') }) {
  const isLecturer = isLecturerProfile(profile);

  return (
    <main className="screen compact">
      <StepRail step={1} />
      <section className="confirmation">
        <CheckCircle2 size={42} />
	        <p className="eyebrow">{t('profile.saved')}</p>
	        <h2>{displayName(profile?.full_name) || 'Your profile'} {t('profile.ready')}</h2>
	        <p>
	          {isLecturer
	            ? t('profile.lecturerSaved')
	            : t('profile.studentSaved')}
	        </p>
	        <button className="primary" onClick={onContinue}>
	          {isLecturer ? t('profile.openLecturer') : t('classes.title')}
	        </button>
      </section>
    </main>
  );
}

function RequestForm({ profile, onCreated, onUpdated, onBack, request = null, mode = 'create', classContext = null, t = translate.bind(null, 'en') }) {
  const [form, setForm] = useState(() => buildRequestFormState(profile, request, classContext));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [classesError, setClassesError] = useState('');
  const courseOptions = getCoursesForSchool(form.school);
  const sessionOptions = getSessionsForCourse(form.course_code);
  const selectedSession = sessionOptions.find((session) => session.code === form.session_code);
  const selectedClass = classContext || joinedClasses.find((classItem) => classItem.id === form.class_id);
  const isClassLocked = Boolean(classContext?.id);
  const requestSkillOptions = mergeOptionSets(getRequestSkillOptions(profile), form.skills_needed);

  useEffect(() => {
    setForm(buildRequestFormState(profile, request, classContext));
  }, [profile.id, request?.id, classContext?.id]);

  useEffect(() => {
    let alive = true;
    setClassesError('');

    listMyClasses(profile.id)
      .then((classes) => {
        if (!alive) return;

        const activeClasses = classes.filter((classItem) => classItem.status === 'active');
        const nextClasses = classContext?.id && !activeClasses.some((classItem) => classItem.id === classContext.id)
          ? [classContext, ...activeClasses]
          : activeClasses;
        setJoinedClasses(nextClasses);

        if (mode === 'create' && classContext) {
          const preferredClass = classContext;
          if (preferredClass) {
            setForm((current) => (
              current.class_id ? current : applyClassToRequestState(current, preferredClass)
            ));
          }
        }
      })
      .catch(() => {
        if (alive) {
          setJoinedClasses([]);
          setClassesError('Class selection is not available until the Phase 2 database migration is run.');
        }
      });

    return () => {
      alive = false;
    };
  }, [profile.id, classContext?.id]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateOpportunityType = (value) => {
    setForm((current) => ({
      ...current,
      opportunity_type: value,
      other_opportunity_type: value === 'Other' ? current.other_opportunity_type : '',
    }));
  };

  const updateOpportunityField = (value) => {
    setForm((current) => ({
      ...current,
      opportunity_field: value,
      other_opportunity_field: value === 'Other' ? current.other_opportunity_field : '',
    }));
  };

  const updateCourse = (courseCode) => {
    const selectedCourse = findCourseByCode(courseCode);
    setForm((current) => ({
      ...current,
      course_name: selectedCourse?.name || '',
      course_code: selectedCourse?.code || '',
      session_code: '',
      class_session: '',
      class_day: '',
      class_start_time: '',
      class_end_time: '',
    }));
  };

  const updateClass = (classId) => {
    const classItem = joinedClasses.find((item) => item.id === classId);

    if (!classItem) {
      setForm((current) => ({
        ...current,
        class_id: '',
      }));
      return;
    }

    setForm((current) => applyClassToRequestState(current, classItem));
  };

  const updateSession = (sessionCode) => {
    setForm((current) => ({
      ...current,
      session_code: sessionCode,
      class_session: formatSessionCode(sessionCode),
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
    const opportunityType = form.opportunity_type === 'Other'
      ? form.other_opportunity_type.trim()
      : form.opportunity_type;
    const opportunityField = form.opportunity_field === 'Other'
      ? form.other_opportunity_field.trim()
      : form.opportunity_field;

    const portfolioFileError = validatePortfolioFile(form.portfolio_file);
    const totalTeamSize = Number(form.total_team_size);
    const teammatesNeededInitial = Number(form.teammates_needed_initial);

    const classSession = isClassLocked ? formatClassSession(form) : 'Collab';
    const opportunityName = form.opportunity_name.trim();
    const hasRequiredContext = isClassLocked
      ? form.school && form.major && form.course_name && form.course_code && classSession
	      : opportunityType && opportunityField && opportunityName;

    if (!hasRequiredContext || skillsNeeded.length === 0 || totalTeamSize < 2 || teammatesNeededInitial < 1) {
      setError(isClassLocked
        ? t('request.classRequired')
        : t('request.collabRequired'));
      return;
    }

    if (teammatesNeededInitial >= totalTeamSize) {
      setError(t('request.tooManyTeammates'));
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
      const portfolioReferencePath = requiresPortfolio
        ? portfolioUpload?.path || form.portfolio_reference_path || null
        : null;
      const portfolioReferenceName = requiresPortfolio
        ? portfolioUpload?.name || form.portfolio_reference_name || null
        : null;

      const payload = {
        school: form.school || profile.school,
        major: form.major || profile.major,
        class_id: form.class_id || null,
        request_scope: isClassLocked ? 'class' : 'open_opportunity',
        opportunity_type: isClassLocked ? null : opportunityType,
        opportunity_field: isClassLocked ? null : opportunityField,
        opportunity_name: isClassLocked ? null : opportunityName,
        deadline: isClassLocked ? null : form.deadline || null,
        course: isClassLocked ? form.course_name.trim() : opportunityName,
        course_name: isClassLocked ? form.course_name.trim() : opportunityName,
        course_code: isClassLocked ? form.course_code.trim() : opportunityType,
        class_session: classSession,
        class_day: null,
        class_start_time: null,
        class_end_time: null,
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
        ? t('request.updateFail')
        : t('request.createFail');
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
          {t('common.back')}
        </button>
        <div className="form-heading">
          <Search size={28} />
          <div>
		            <p className="eyebrow">
		              {mode === 'edit'
		                ? (isClassLocked ? t('request.editClass') : t('request.edit'))
		                : isClassLocked ? t('request.class') : t('request.open')}
		            </p>
	            <h2>
	              {mode === 'edit'
	                ? t('request.updateTitle')
	                : isClassLocked ? t('request.classTitle') : t('request.openTitle')}
	            </h2>
          </div>
        </div>

        <div className="profile-strip">
          <GraduationCap size={20} />
          <span>{displayName(profile.full_name)}</span>
          <span>{schoolLabel(profile.school)} | {profile.major}</span>
        </div>

        <div className="form-grid">
	          {selectedClass && (
	            <div className="request-summary-box wide">
	              <p className="eyebrow">{isClassLocked ? t('request.belongsTo') : t('request.selectedClass')}</p>
	              <h3>{getClassDisplay(selectedClass)}</h3>
	              <p>{selectedClass.university} · {schoolLabel(selectedClass.school)} · {selectedClass.major}</p>
	              <p>{getAcademicPeriodDisplay(selectedClass)} · {t('classes.classCode')} {selectedClass.class_code || selectedClass.demo_class_code || selectedClass.join_code}</p>
	              {selectedClass.lecturer_name && <p>{t('join.lecturer')}: {selectedClass.lecturer_name}</p>}
	            </div>
	          )}
          {!isClassLocked && (
            <>
              {classesError && <p className="field-helper wide">{classesError}</p>}
	              <div className="request-summary-box wide">
		                <p className="eyebrow">{t('request.outsideClass')}</p>
		                <p>{t('request.outsideClassHelp')}</p>
		              </div>
		              <div className="course-session-row wide">
		                <label>
		                  {t('request.opportunityType')}
		                  <select value={form.opportunity_type} onChange={(event) => updateOpportunityType(event.target.value)} required>
		                    <option value="">{t('request.selectType')}</option>
		                    {opportunityTypes.map((type) => (
		                      <option value={type} key={type}>{type}</option>
		                    ))}
		                  </select>
		                </label>
		                <label>
		                  {t('request.field')}
		                  <select value={form.opportunity_field} onChange={(event) => updateOpportunityField(event.target.value)} required>
		                    <option value="">{t('request.selectField')}</option>
		                    {opportunityFields.map((field) => (
		                      <option value={field} key={field}>{field}</option>
		                    ))}
		                  </select>
		                </label>
		              </div>
                  {form.opportunity_type === 'Other' && (
                    <label className="wide inline-other-field">
                      {t('request.specify')} {t('request.opportunityType').toLowerCase()}
                      <input
                        value={form.other_opportunity_type}
                        onChange={(event) => updateField('other_opportunity_type', event.target.value)}
                        placeholder={t('request.typePlaceholder')}
                        required
                      />
                    </label>
                  )}
                  {form.opportunity_field === 'Other' && (
                    <label className="wide inline-other-field">
                      {t('request.specify')} {t('request.field').toLowerCase()}
                      <input
                        value={form.other_opportunity_field}
                        onChange={(event) => updateField('other_opportunity_field', event.target.value)}
                        placeholder={t('request.fieldPlaceholder')}
                        required
                      />
                    </label>
                  )}
		              <label className="wide">
		                {t('request.opportunityName')}
	                <input
	                  value={form.opportunity_name}
	                  onChange={(event) => updateField('opportunity_name', event.target.value)}
	                  placeholder={t('request.namePlaceholder')}
	                  required
	                />
	              </label>
		              <label className="wide">
		                {t('request.deadline')}
	                <input
	                  type="date"
	                  value={form.deadline}
	                  onChange={(event) => updateField('deadline', event.target.value)}
	                />
	              </label>
	            </>
	          )}
          {selectedSession?.lecturer && (
            <div className="request-summary-box wide">
              <p className="eyebrow">{t('request.sessionMetadata')}</p>
              <h3>{formatSessionCode(selectedSession.code)}</h3>
              <p>{selectedSession.semester}, {selectedSession.academicYear}</p>
              <p>{t('join.lecturer')}: {selectedSession.lecturer}</p>
            </div>
          )}
          <fieldset className="wide">
            <legend>{t('request.skillsNeeded')}</legend>
            <p className="field-helper">{t('request.skillsHelper')}</p>
            <CheckboxGrid
              options={requestSkillOptions}
              selected={form.skills_needed}
              onToggle={toggleSkill}
            />
            {form.skills_needed.includes('Other') && (
              <input
                value={form.other_skill}
                onChange={(event) => updateField('other_skill', event.target.value)}
                    placeholder={t('request.addSkill')}
              />
            )}
          </fieldset>
          <div className="course-session-row wide">
	            <label>
	              {t('request.teamSize')}
              <input
                min="2"
                type="number"
                value={form.total_team_size}
                onChange={(event) => updateField('total_team_size', event.target.value)}
                required
              />
            </label>
	            <label>
	              {t('request.spotsRemaining')}
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
            <legend>{t('request.teammateKind')}</legend>
            <CheckboxGrid
              options={workStyleOptions}
              selected={form.work_styles}
              onToggle={toggleWorkStyle}
            />
          </fieldset>
          <fieldset className="wide">
            <legend>{t('request.requirementsTitle')}</legend>
            <p className="field-helper">{t('request.requirementsHelper')}</p>
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
                <strong>{t('request.portfolioRequirement')}</strong>
                <label className={form.portfolio_link_required ? 'check-option selected' : 'check-option'}>
                  <input
                    type="checkbox"
                    checked={form.portfolio_link_required}
                    onChange={() => updateField('portfolio_link_required', !form.portfolio_link_required)}
                  />
                  <span>{t('request.askPortfolio')}</span>
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
                  <span>{t('request.uploadPortfolio')}</span>
                </label>
                {form.portfolio_upload_enabled && (
                  <label>
                    {t('request.uploadPortfolio')}
                    <span className="field-helper">
                      {t('request.uploadPortfolioHelper')}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(event) => updatePortfolioFile(event.target.files?.[0] || null)}
                    />
                    <span className="field-helper">{t('request.uploadPortfolioLimit')}</span>
                  </label>
                )}
              </div>
            )}
            {form.requirements_selected.includes('Has experience with specific software/tools') && (
              <div className="conditional-box">
                <strong>{t('request.whichTools')}</strong>
                <CheckboxGrid
                  options={toolOptions}
                  selected={form.required_tools}
                  onToggle={toggleTool}
                />
                {form.required_tools.includes('Other') && (
                  <input
                    value={form.other_tool}
                    onChange={(event) => updateField('other_tool', event.target.value)}
                    placeholder={t('request.otherTools')}
                  />
                )}
              </div>
            )}
          </fieldset>
          <label className="wide">
            {t('request.anythingElse')}
            <textarea
              value={form.requirements}
              onChange={(event) => updateField('requirements', event.target.value)}
              placeholder={t('request.notesPlaceholder')}
              rows="4"
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
	        <button className="primary" type="submit" disabled={saving}>
	          {saving ? (mode === 'edit' ? t('request.saving') : t('request.creating')) : (mode === 'edit' ? t('request.saveChanges') : t('request.findMatches'))}
	        </button>
      </form>
    </main>
  );
}

function MatchCard({ request, connectionState, onView, onConnect, connecting, t = translate.bind(null, 'en') }) {
  const teamStatus = request.team_status || {};
  const remainingFromStatus = Number(teamStatus.remaining_members ?? request.members_needed ?? 0);
  const teamStatusText = teamStatus.status_label
    || (remainingFromStatus > 0
      ? `${t('matches.lookingFor')} ${remainingFromStatus} ${remainingFromStatus === 1 ? t('matches.spot') : t('matches.spots')}`
      : t('matches.teamNotSpecified'));
  const canConnect = connectionState === 'none' && !connecting;

  return (
    <article className="match-card">
      <div className="score">
        <Sparkles size={18} />
        {request.matchScore}% Match
      </div>
      {request.ruleBasedScore !== undefined && request.ruleBasedScore !== request.matchScore && (
        <p className="note">{t('matches.standardScore')}: {request.ruleBasedScore}%</p>
      )}
      <h3>{displayName(request.profile.full_name)} {request.profile.is_demo && <DemoBadge />}</h3>
      <p>{universityLabel(request.profile.university)} | {schoolLabel(request.profile.school)} | {request.profile.major}</p>
      <p className="note">{reviewSummaryLabel(request.profile, null, t)}</p>
      <div className="match-meta">
        <span>{getCourseDisplay(request)}</span>
        <span>{getLocalizedSessionDisplay(request, t)}</span>
        <span>{getInitialNeeded(request)} {getInitialNeeded(request) === 1 ? t('matches.spot') : t('matches.spots')} {t('matches.remaining')}</span>
      </div>
      <div className="mini-detail">
        <strong>{t('matches.skillsHave')}</strong>
        <span>{joinList(request.profile.skills)}</span>
      </div>
      <div className="mini-detail">
        <strong>{t('matches.lookingFor')}</strong>
        <span>{joinList(request.skills_needed)}</span>
      </div>
      <div className="mini-detail">
        <strong>{t('matches.workStyle')}</strong>
        <span>{joinList(getWorkStyles(request))}</span>
      </div>
      <div className="mini-detail">
        <strong>{t('matches.teamStatus')}</strong>
        <span>{teamStatusText}</span>
      </div>
      <div className="mini-detail">
        <strong>{t('matches.why')}</strong>
        <span>{request.aiExplanation || request.matchReason || t('matches.defaultWhy')}</span>
      </div>
      {request.aiStrengths?.length > 0 && (
        <div className="mini-detail">
          <strong>{t('matches.strengths')}</strong>
          <span>{joinList(request.aiStrengths)}</span>
        </div>
      )}
      {request.aiGaps?.length > 0 && (
        <div className="mini-detail">
          <strong>{t('matches.gaps')}</strong>
          <span>{joinList(request.aiGaps)}</span>
        </div>
      )}
      <ConnectionStateBadge state={connectionState} />
      <div className="hero-actions">
        <button className="secondary" onClick={() => onView(request.id, request.matchScore)}>
          {t('common.viewProfile')}
        </button>
        {canConnect && (
          <button className="primary" type="button" onClick={() => onConnect(request)} disabled={connecting}>
            {connecting ? t('matches.sending') : t('matches.connect')}
          </button>
        )}
      </div>
    </article>
  );
}

function MatchResults({ requestId, currentProfileId, onViewProfile, onViewCurrent, onCreateNew, onSelectRequest, t = translate.bind(null, 'en') }) {
  const [state, setState] = useState({
    activeLoading: true,
    matchesLoading: false,
    error: '',
    connectError: '',
    sendingProfileId: '',
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
            error: t('opportunities.loadFail'),
            data: null,
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId, currentProfileId]);

  if (state.activeLoading) {
    return <main className="screen compact"><p className="loading">{t('matches.loading')}</p></main>;
  }

  if (!currentProfileId || state.activeRequests.length === 0) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>{t('matches.needRequest')}</p>
          <button className="primary" onClick={onCreateNew}>{t('matches.createRequest')}</button>
        </section>
      </main>
    );
  }

  if (state.error && !state.data) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>{state.error}</p>
          <button className="secondary" onClick={onCreateNew}>{t('matches.createNew')}</button>
        </section>
      </main>
    );
  }

  if (state.matchesLoading || !state.data) {
    return <main className="screen compact"><p className="loading">{t('matches.loading')}</p></main>;
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

  const sendMatchConnect = async (request) => {
    if (!currentProfileId || !currentRequest?.id) return;

    setState((current) => ({
      ...current,
      connectError: '',
      sendingProfileId: request.profile_id,
    }));

    try {
      const connection = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: request.profile_id,
        senderTeamRequestId: currentRequest.id,
        introMessage: `Hi ${displayName(request.profile?.full_name)}, your teammate search looks like a good match for mine. Want to connect?`,
      });
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        connectionsByProfile: {
          ...current.connectionsByProfile,
          [request.profile_id]: connection,
        },
      }));
    } catch (err) {
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        connectError: getFriendlyError(err, "We couldn't send your connection request. Please try again."),
      }));
    }
  };

  const isClassRequest = Boolean(currentRequest.class_id);

  return (
    <main className="screen results">
      <StepRail step={2} />
      <div className="results-header">
        <div>
	          <p className="eyebrow">{isClassRequest ? t('matches.recommended') : t('matches.results')}</p>
	          <h2>{isClassRequest ? t('matches.best') : t('matches.byRequest')}</h2>
        </div>
        <button className="secondary" onClick={onViewCurrent}>
          <Clock3 size={18} />
	          {t('matches.current')}
        </button>
      </div>

      <section className="request-switcher-panel">
        <label>
          {t('matches.resultsFor')}
          {state.activeRequests.length > 1 ? (
            <select value={currentRequest.id} onChange={(event) => handleRequestChange(event.target.value)}>
              {state.activeRequests.map((request) => (
                <option value={request.id} key={request.id}>
                  {request.id === currentRequest.id ? '✓ ' : ''}{getCourseDisplay(request)} | {getLocalizedSessionDisplay(request, t)}
                </option>
              ))}
              <option value="__new__">+ {t('matches.createNew')}</option>
            </select>
          ) : (
            <div className="static-request-name">{getCourseDisplay(currentRequest)}</div>
          )}
        </label>
        <div className="request-context-summary">
          <h3>{getCourseDisplay(currentRequest)}</h3>
          <p>{t('matches.lookingFor')}: {joinList(currentRequest.skills_needed)}</p>
          <p>{progressSummary(selectedMetrics, t)}</p>
          <p>{remainingSummary(selectedMetrics, t)}</p>
        </div>
      </section>

      {state.connectError && <p className="error">{state.connectError}</p>}

      {matches.length === 0 ? (
        <section className="empty-state">
          <p>{t('matches.noneActive')}</p>
          <button className="primary" onClick={onCreateNew}>{t('common.createAnother')}</button>
        </section>
      ) : visibleMatches.length === 0 ? (
        <section className="empty-state">
          <p>{t('matches.noneMatch')}</p>
          <button className="primary" onClick={onCreateNew}>{t('common.createAnother')}</button>
        </section>
      ) : (
        <div className="match-grid">
          {visibleMatches.map((request) => (
            <MatchCard
              request={request}
              connectionState={getConnectionState(state.connectionsByProfile[request.profile_id], currentProfileId)}
              key={request.id}
              onView={onViewProfile}
              onConnect={sendMatchConnect}
              connecting={state.sendingProfileId === request.profile_id}
              t={t}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function DiscoverPage({ currentProfileId, onOpenProfile, t = translate.bind(null, 'en') }) {
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
        const studentProfiles = profiles.filter((profile) => getProfileRole(profile) === 'student');
        const visibleProfiles = studentProfiles.filter((profile) => profile.id !== currentProfileId);
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
            profiles: studentProfiles,
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
            error: t('discover.loadFail'),
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
                modalError: t('connections.sendFail'),
      }));
    }
  };

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">{t('discover.title')}</p>
          <h2>{t('discover.heading')}</h2>
          <p>{t('discover.subtitle')}</p>
        </div>
      </div>

      <section className="filter-panel">
        <label>
          {t('profile.university')}
          <select
            value={filters.university}
            onChange={(event) => setFilters((current) => ({ ...current, university: event.target.value }))}
          >
            <option value="">{t('discover.allUniversities')}</option>
            {universityOptions.map((university) => (
              <option value={university.value} key={university.value}>{university.label}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.school')}
          <select
            value={filters.school}
            onChange={(event) => setFilters({ school: event.target.value, major: '', course: '', skill: filters.skill })}
          >
            <option value="">{t('discover.allSchools')}</option>
            {schoolOptions.map((school) => (
              <option value={school.value} key={school.value}>{school.label}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.major')}
          <select value={filters.major} onChange={(event) => setFilters((current) => ({ ...current, major: event.target.value }))}>
            <option value="">{t('discover.allMajors')}</option>
            {availableMajors.map((major) => (
              <option value={major} key={major}>{major}</option>
            ))}
          </select>
        </label>
        <label>
          {t('class.course')}
          <select value={filters.course} onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}>
            <option value="">{t('discover.allCourses')}</option>
            {discoverCourseOptions.map((course) => (
              <option value={course.code} key={course.code}>{formatCourseOption(course)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.skills')}
          <select value={filters.skill} onChange={(event) => setFilters((current) => ({ ...current, skill: event.target.value }))}>
            <option value="">{t('discover.allSkills')}</option>
            {discoverSkillOptions.map((skill) => (
              <option value={skill} key={skill}>{skill}</option>
            ))}
          </select>
        </label>
      </section>

      {state.loading && <p className="loading">{t('discover.loading')}</p>}
      {state.error && <p className="error">{state.error}</p>}
      {!state.loading && filteredProfiles.length === 0 && (
        <section className="empty-state">
          <p>{t('discover.none')}</p>
        </section>
      )}

      {!state.loading && filteredProfiles.length > 0 && (
        <div className="discover-grid">
          {filteredProfiles.map((profile) => {
            const disabledReason = !currentProfileId
                ? t('connections.needProfile')
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
	                <p className="note">{reviewSummaryLabel(profile, null, t)}</p>
                {requestsByProfile[profile.id]?.[0] && (
                  <p>{getCourseDisplay(requestsByProfile[profile.id][0])}</p>
                )}
                <p>{profile.short_bio || t('profile.noBio')}</p>
                <div className="mini-detail">
                  <strong>{t('matches.skillsHave')}</strong>
                  <span>{joinList(profile.skills)}</span>
                </div>
                <ConnectionStateBadge state={connectionState} />
                <ConnectionRelationshipBadge connection={connection} />
                <div className="hero-actions">
                  <button
                    className="secondary"
                    onClick={() => onOpenProfile(profile.id)}
                  >
                    {t('common.viewProfile')}
                  </button>
                  {disabledReason ? (
                    <button className="disabled-contact compact-disabled" disabled>
                      <UserPlus size={18} />
                      {t('matches.connect')}
                    </button>
                  ) : connectionState === 'accepted' ? (
                    <button className="connected-button" disabled>
                      <CheckCircle2 size={18} />
                      {connectedButtonLabel(connection)}
                    </button>
                  ) : connectionState === 'sent_pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>{t('connections.requestSent')}</button>
                  ) : connectionState === 'received_pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>{t('connections.respond')}</button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => setState((current) => ({ ...current, modalProfile: profile, modalError: '' }))}
                    >
                      <UserPlus size={18} />
                      {t('matches.connect')}
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
          t={t}
        />
      )}
    </main>
  );
}

function DiscoverProfileDetail({ profileId, currentProfileId, onBack, onOpenChat, onOpenConnections, t = translate.bind(null, 'en') }) {
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
        {t('matches.backToDiscover')}
      </button>
      <section className="profile-panel standalone">
        <div className="avatar">{displayInitial(profile.full_name)}</div>
        <p className="eyebrow">{t('matches.discoverProfile')}</p>
        <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />}</h2>
        <p>{profile.short_bio || t('matches.noBio')}</p>
        <dl>
          <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>
          <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
          <div><dt>{t('profile.major')}</dt><dd>{profile.major}</dd></div>
          <div><dt>{t('matches.skillsHave')}</dt><dd>{joinList(profile.skills)}</dd></div>
          <div>
            <dt>{t('profile.contact')}</dt>
            <dd>
              {profile.contact_value
                ? `${contactLabel(profile.contact_type)}: ${profile.contact_value}`
                : state.connection?.status === 'accepted'
                  ? t('common.notSpecified')
                  : t('matches.visibleAfterConnecting')}
            </dd>
          </div>
        </dl>
        <ReviewsSection profile={profile} reviews={state.reviews} t={t} />
        {state.activeRequest && (
          <div className="request-summary-box">
            <p className="eyebrow">{t('matches.lookingTeammate')}</p>
            <h3>{getCourseDisplay(state.activeRequest)}</h3>
            <dl>
              <div><dt>{t('matches.classSession')}</dt><dd>{getLocalizedSessionDisplay(state.activeRequest, t)}</dd></div>
              <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(state.activeRequest.skills_needed)}</dd></div>
              <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(state.activeRequest))}</dd></div>
              <div><dt>{t('matches.requirements')}</dt><dd>{describeRequirements(state.activeRequest)}</dd></div>
              <div><dt>{t('matches.teamSize')}</dt><dd>{getTotalTeamSize(state.activeRequest)}</dd></div>
              <div><dt>{t('matches.lookingFor')}</dt><dd>{getInitialNeeded(state.activeRequest)} {getInitialNeeded(state.activeRequest) === 1 ? t('matches.spot') : t('matches.spots')}</dd></div>
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
	              {t('common.connect')}
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
	              {t('common.message')}
            </button>
            <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
	              {t('common.unmatch')}
            </button>
          </div>
        ) : connectionState === 'sent_pending' ? (
	          <button className="disabled-contact" disabled>{t('common.requestSent')}</button>
        ) : connectionState === 'received_pending' ? (
	          <button className="secondary link-button" onClick={onOpenConnections}>{t('common.respondRequest')}</button>
        ) : (
          <button className="primary link-button" onClick={() => setState((current) => ({ ...current, modalOpen: true, actionError: '' }))}>
            <UserPlus size={18} />
	            {t('common.connect')}
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
          t={t}
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

function ReviewsSection({ reviews = [], profile, title = 'Existing Reviews', t = translate.bind(null, 'en') }) {
  return (
    <section className="request-summary-box">
      <p className="eyebrow">{title}</p>
      <h3>{reviewSummaryLabel(profile, reviews, t)}</h3>
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
  t = translate.bind(null, 'en'),
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
	            {t('common.connect')}
            </button>
	          <p className="connection-hint">{t('connect.needProfile')}</p>
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
	          {t('common.connect')}
        </button>
      );
    }

    if (connectionState === 'sent_pending') {
	      return <button className="disabled-contact" disabled>{t('common.requestSent')}</button>;
    }

    if (connectionState === 'received_pending') {
      return (
        <button className="secondary link-button" onClick={onOpenConnections}>
	          {t('common.respondRequest')}
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
	            {t('common.message')}
          </button>
          <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
	            {t('common.unmatch')}
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
	        {t('matches.backToMatches')}
      </button>

      <section className="detail-layout">
        <div className="profile-panel">
          <div className="avatar">{displayInitial(profile.full_name)}</div>
	          <p className="eyebrow">{t('matches.profileData')}</p>
	          <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />}</h2>
	          <p>{profile.short_bio || t('matches.noBio')}</p>
	          <dl>
	            <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
	            <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>
	            <div><dt>{t('profile.major')}</dt><dd>{profile.major}</dd></div>
	            <div><dt>{t('profile.reviews')}</dt><dd>{reviewSummaryLabel(profile, null, t)}</dd></div>
            <div>
	              <dt>{t('profile.contact')}</dt>
	              <dd>
	                {profile.contact_value
	                  ? `${contactLabel(profile.contact_type)}: ${profile.contact_value}`
	                  : connection?.status === 'accepted'
	                    ? t('common.notSpecified')
	                    : t('matches.visibleAfterConnecting')}
              </dd>
            </div>
          </dl>
          <div className="mini-detail">
	            <strong>{t('matches.skillsHave')}</strong>
            <span>{joinList(profile.skills)}</span>
          </div>
          {state.actionError && <p className="error">{state.actionError}</p>}
          {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
          {renderConnectionAction()}
          <ReviewsSection profile={profile} reviews={state.reviews} t={t} />
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
	          <p className="eyebrow">{t('matches.lookingTeammate')}</p>
          <h3>{getCourseDisplay(request)}</h3>
          <dl>
	            {typeof matchScore === 'number' && <div><dt>{t('matches.matchScore')}</dt><dd>{matchScore}% Match</dd></div>}
	            <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(request.school || profile.school)}</dd></div>
	            <div><dt>{t('profile.major')}</dt><dd>{request.major || profile.major}</dd></div>
	            <div><dt>{t('matches.classSession')}</dt><dd>{getLocalizedSessionDisplay(request, t)}</dd></div>
	            <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(request.skills_needed)}</dd></div>
	            <div><dt>{t('matches.teamSize')}</dt><dd>{getTotalTeamSize(request)}</dd></div>
	            <div><dt>{t('matches.lookingFor')}</dt><dd>{getInitialNeeded(request)} {getInitialNeeded(request) === 1 ? t('matches.spot') : t('matches.spots')}</dd></div>
	            <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
	            <div><dt>{t('matches.requirements')}</dt><dd>{describeRequirements(request)}</dd></div>
            <PortfolioReference request={request} />
          </dl>
	          {currentRequestId === request.id && <p className="note">{t('matches.thisRequest')}</p>}
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
          t={t}
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
	  onViewRecommended,
	  onCreateNew,
	  t = translate.bind(null, 'en'),
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
        const standaloneRequests = requests.filter((request) => !request.class_id);
        const progressEntries = await Promise.all(
          standaloneRequests.map(async (request) => {
            try {
              return [request.id, await getTeamRequestProgress(request.id, currentProfileId)];
            } catch {
              return [request.id, { found_count: 0, teammates: [] }];
            }
          }),
        );

        if (alive) {
          const stillSelected = standaloneRequests.some((request) => request.id === (requestId || state.selectedId));
          const currentMatchRequest = standaloneRequests.find((request) => request.id === requestId && request.status === 'looking');
          const nextMatchRequest = currentMatchRequest || standaloneRequests.find((request) => request.status === 'looking') || null;
          const nextSelectedId = stillSelected
            ? requestId || state.selectedId
            : nextMatchRequest?.id || standaloneRequests[0]?.id || '';

          setState((current) => ({
            ...current,
            loading: false,
            error: '',
            requests: standaloneRequests,
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
        success: t('opportunities.complete'),
      }));
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: t('opportunities.updateFail'),
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
        success: t('opportunities.reopened'),
      }));
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: t('opportunities.reopenFail'),
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
        success: t('opportunities.cancelled'),
      }));

      if (state.selectedId === target.id) {
        onSelectRequest(nextActiveRequest?.id || '');
      }
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: t('opportunities.cancelFail'),
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
    return <main className="screen compact"><p className="loading">{t('request.loading')}</p></main>;
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
          <p>{getLocalizedSessionDisplay(request, t)} | {requestStatusLabel(request.status, t)}</p>
          <p className="note">
            {progressSummary(requestMetrics, t)}
            {request.status === 'looking' ? ` | ${remainingSummary(requestMetrics, t)}` : ''}
          </p>
        </div>
        <div className="request-row-actions">
          <button className="secondary" onClick={() => selectRequest(request)}>{t('common.viewDetails')}</button>
          <button className="secondary" onClick={() => setState((current) => ({ ...current, editingRequest: request, success: '', error: '' }))}>
            <Pencil size={18} />
            {t('common.editRequest')}
          </button>
          {request.status === 'looking' && (
            <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, cancelTarget: request, success: '', error: '' }))}>
              <Trash2 size={18} />
              {t('opportunities.cancel')}
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
        <p className="note">{t('opportunities.noSection', { section: title.toLowerCase() })}</p>
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
	        t={t}
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
            success: t('opportunities.updated'),
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
	          <p>{t('opportunities.none')}</p>
	          <p className="note">{t('opportunities.emptyIntro')}</p>
	          <button className="primary" onClick={onCreateNew}>
	            <Plus size={18} />
	            {t('opportunities.new')}
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
        {t('common.back')}
      </button>
      <div className="results-header">
        <div>
          <p className="eyebrow">{t('opportunities.title')}</p>
          <h2>{t('opportunities.subtitle')}</h2>
        </div>
        <button className="primary" onClick={onCreateNew}>
          <Plus size={18} />
          {t('opportunities.new')}
        </button>
      </div>

      <div className="request-management-grid">
        <section className="request-list-panel">
          <RequestSection title={t('common.active')} requests={groupedRequests.active} />
          <RequestSection title={t('common.completed')} requests={groupedRequests.completed} />
          <RequestSection title={t('common.cancelled')} requests={groupedRequests.cancelled} />
        </section>

      <section className="request-panel standalone">
	        <p className="eyebrow">{t('opportunities.selected')}</p>
	        <h2>{getCourseDisplay(request)}</h2>
	        <dl>
	          <div><dt>{t('request.opportunityType')}</dt><dd>{request.opportunity_type || request.course_code || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.field')}</dt><dd>{request.opportunity_field || request.major || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.deadline')}</dt><dd>{request.deadline || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(request.skills_needed)}</dd></div>
	          <div><dt>{t('request.teamSize')}</dt><dd>{getTotalTeamSize(request)}</dd></div>
          <div><dt>{t('opportunities.initiallyLooking')}</dt><dd>{getInitialNeeded(request)}</dd></div>
          <div><dt>{t('request.teammateKind')}</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
          <div><dt>{t('request.requirementsTitle')}</dt><dd>{describeRequirements(request)}</dd></div>
          <PortfolioReference request={request} />
          <div><dt>{t('matches.teamStatus')}</dt><dd>{requestStatusLabel(request.status, t)}</dd></div>
        </dl>
	        <div className="hero-actions">
	          {request.status === 'looking' && (
	            <button className="primary" onClick={() => onViewRecommended?.(request.id)}>
	              <Sparkles size={18} />
	              {t('matches.viewRecommended')}
	            </button>
	          )}
	          <button className="secondary" onClick={() => setState((current) => ({ ...current, editingRequest: request, success: '', error: '' }))}>
	            <Pencil size={18} />
	            {t('common.editRequest')}
          </button>
          {request.status === 'looking' && (
            <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, cancelTarget: request, success: '', error: '' }))}>
              <Trash2 size={18} />
              {t('opportunities.cancel')}
            </button>
          )}
        </div>
        <section className="progress-panel">
          <div className="progress-header">
            <strong>{t('opportunities.progress')}</strong>
            <span>{progressSummary(metrics, t)}</span>
          </div>
          <div className="progress-track" aria-label="Team formation progress">
            <div className="progress-fill" style={{ width: `${metrics.percent}%` }} />
          </div>
	          {teamComplete ? <p className="success">{t('status.teamComplete')}</p> : <p className="note">{remainingSummary(metrics, t)}</p>}
          {metrics.matchedCount > 0 && !teamComplete && <p className="note">{t('opportunities.foundAnother')} {remainingSummary(metrics, t)}</p>}
        </section>

        <MatchUsefulnessPanel
          request={request}
          currentProfileId={currentProfileId}
          teamComplete={teamComplete}
        />

        <section className="progress-panel">
          <div className="progress-header">
            <strong>{t('opportunities.skillCoverage')}</strong>
            <span>{t('opportunities.skillsCovered', { covered: skillGap.covered.length, total: skillGap.total })}</span>
          </div>
          <div className="connection-context">
            <div className="mini-detail">
              <strong>{t('opportunities.coveredSkills')}</strong>
              <span>{joinList(skillGap.covered)}</span>
            </div>
            <div className="mini-detail">
              <strong>{t('opportunities.missingSkills')}</strong>
              <span>{joinList(skillGap.missing)}</span>
            </div>
          </div>
        </section>

        <section className="matched-list">
          <h3>{t('opportunities.matchedTeammates')} ({metrics.matchedCount})</h3>
          {teammates.length === 0 ? (
            <p className="note">{t('opportunities.noMatched')}</p>
          ) : (
            teammates.map((teammate) => (
              <article className="matched-row" key={teammate.profile_id}>
                <div>
	                  <strong>{displayName(teammate.full_name)} {teammate.is_demo && <DemoBadge />}</strong>
                  <span>{teammate.major || t('common.notSpecified')}</span>
                </div>
                <div className="hero-actions">
                  <button className="secondary" onClick={() => onOpenChat(teammate.connection_id)}>
                    <MessageCircle size={18} />
                    {t('common.message')}
                  </button>
                  {teammate.active_request_id && (
                    <button className="secondary" onClick={() => onViewProfile(teammate.active_request_id)}>
                      {t('common.viewProfile')}
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        {teamComplete && request.status === 'looking' && !state.dismissedComplete && (
          <section className="inline-prompt">
            <h3>{t('opportunities.teamCompleteTitle')}</h3>
            <p>{t('opportunities.teamCompleteQuestion')}</p>
            <div className="hero-actions">
              <button className="primary" onClick={markFound} disabled={state.saving}>
                {state.saving ? t('common.updating') : t('opportunities.markComplete')}
              </button>
              <button className="secondary" onClick={() => setState((current) => ({ ...current, dismissedComplete: true }))}>
                {t('common.keepLooking')}
              </button>
            </div>
          </section>
        )}

        {noLongerComplete && !state.dismissedReopen && (
          <section className="inline-prompt warning-prompt">
            <h3>{t('opportunities.noLongerComplete')}</h3>
            <p>{t('opportunities.reopenQuestion')}</p>
            <div className="hero-actions">
              <button className="primary" onClick={reopenRequest} disabled={state.saving}>
                {state.saving ? t('opportunities.reopening') : t('opportunities.reopen')}
              </button>
              <button className="secondary" onClick={() => setState((current) => ({ ...current, dismissedReopen: true }))}>
                {t('common.keepClosed')}
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
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('opportunities.cancelTitle')}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{t('opportunities.cancelTitle')}</p>
                <h2>{t('opportunities.cancelQuestion')}</h2>
              </div>
              <button className="ghost" onClick={() => setState((current) => ({ ...current, cancelTarget: null }))} type="button">{t('common.close')}</button>
            </div>
            <p className="note">{t('opportunities.cancelHelper')}</p>
            <div className="hero-actions">
              <button className="secondary" onClick={() => setState((current) => ({ ...current, cancelTarget: null }))} type="button">
                {t('opportunities.keep')}
              </button>
              <button className="primary danger-action" onClick={cancelRequest} disabled={state.saving}>
                {state.saving ? t('opportunities.cancelling') : t('opportunities.cancel')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function FoundConfirmation({ onCreateAnother, onHome, t = translate.bind(null, 'en') }) {
  return (
    <main className="screen compact">
      <section className="confirmation">
        <CheckCircle2 size={42} />
        <p className="eyebrow">{t('found.title')}</p>
        <h2>{t('found.heading')}</h2>
        <p>{t('found.body')}</p>
        <div className="hero-actions center">
          <button className="primary" onClick={onCreateAnother}>{t('found.createAnother')}</button>
          <button className="secondary" onClick={onHome}>{t('found.home')}</button>
        </div>
      </section>
    </main>
  );
}

function ConnectionsPage({ currentProfileId, currentRequestId, onOpenChat, onViewProfile, onNotificationsChanged, t = translate.bind(null, 'en') }) {
  const [tab, setTab] = useState('received');
  const [state, setState] = useState({
    loading: true,
    error: '',
    received: [],
    sent: [],
	    connected: [],
	    declined: [],
	    friends: [],
	    currentRequest: null,
    actionLoadingId: '',
    actionError: '',
	    actionSuccess: '',
	    unmatchTarget: null,
	    unmatchSaving: false,
	    editMessageTarget: null,
	    editMessageText: '',
	    withdrawTarget: null,
	  });

  const loadConnections = async () => {
    if (!currentProfileId) {
	      setState((current) => ({ ...current, loading: false, received: [], sent: [], connected: [], friends: [] }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

    try {
	      const [received, sent, connected, friends, currentRequest] = await Promise.all([
	        getConnectionRequests(currentProfileId, 'received'),
	        getConnectionRequests(currentProfileId, 'sent'),
	        getConnectionRequests(currentProfileId, 'connected'),
	        listFriends(currentProfileId).catch(() => []),
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
	        friends,
	        currentRequest,
	      }));
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: t('connections.loadFail'),
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
        error: t('connections.updateFail'),
      }));
    }
  };

	  const withdraw = async () => {
	    const target = state.withdrawTarget;
	    if (!target) return;

	    setState((current) => ({ ...current, actionLoadingId: target.id, actionError: '', actionSuccess: '' }));

	    try {
	      await cancelConnectionRequest(target.id, currentProfileId);
	      setState((current) => ({
	        ...current,
	        withdrawTarget: null,
	        actionLoadingId: '',
	        actionSuccess: t('connections.withdrawn'),
	      }));
	      await loadConnections();
	    } catch {
	      setState((current) => ({
	        ...current,
	        actionLoadingId: '',
	        actionError: t('connections.cancelFail'),
	      }));
	    }
	  };

	  const openEditMessage = (request) => {
	    setState((current) => ({
	      ...current,
	      editMessageTarget: request,
	      editMessageText: request.intro_message || '',
	      actionError: '',
	      actionSuccess: '',
	    }));
	  };

	  const saveEditedMessage = async () => {
	    const target = state.editMessageTarget;
	    if (!target) return;

	    setState((current) => ({ ...current, actionLoadingId: target.id, actionError: '', actionSuccess: '' }));

	    try {
	      await updatePendingConnectionMessage({
	        connectionId: target.id,
	        senderProfileId: currentProfileId,
	        introMessage: state.editMessageText,
	      });
	      setState((current) => ({
	        ...current,
	        editMessageTarget: null,
	        editMessageText: '',
	        actionLoadingId: '',
	        actionSuccess: t('connections.messageUpdated'),
	      }));
	      await loadConnections();
	    } catch (err) {
	      console.error('Connection message update failed', err);
	      setState((current) => ({
	        ...current,
	        actionLoadingId: '',
	        actionError: t('connections.messageUpdateFail'),
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
        error: t('connections.cancelFail'),
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
        actionSuccess: t('connections.unmatchedWith', { name: displayName(target.teammate_full_name) }),
      }));
      await loadConnections();
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: t('connections.unmatchFail'),
      }));
    }
  };

  const tabs = [
    { id: 'received', label: t('connections.received'), rows: state.received },
    { id: 'sent', label: t('connections.sent'), rows: state.sent },
	    { id: 'connected', label: t('connections.connected'), rows: state.connected },
	    { id: 'friends', label: t('connections.friends'), rows: state.friends },
	    { id: 'declined', label: t('connections.declined'), rows: state.declined },
	  ];
  const activeRows = tabs.find((item) => item.id === tab)?.rows || [];
  const emptyCopy = {
    received: t('connections.noneReceived'),
    sent: t('connections.noneSent'),
	    connected: t('connections.noneConnected'),
	    friends: t('connections.noneFriends'),
	    declined: t('connections.noneDeclined'),
	  };
	  const showingFriends = tab === 'friends';

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">{t('nav.connections')}</p>
          <h2>{t('connections.requests')}</h2>
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
          <p>{t('connections.needProfile')}</p>
        </section>
      )}

	      {currentProfileId && state.loading && <p className="loading">{t('connections.loading')}</p>}
	      {state.error && <p className="error">{state.error}</p>}
	      {state.actionError && <p className="error">{state.actionError}</p>}
	      {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}

      {currentProfileId && !state.loading && activeRows.length === 0 && (
        <section className="empty-state">
          <p>{emptyCopy[tab]}</p>
        </section>
      )}

	      {currentProfileId && !state.loading && showingFriends && activeRows.length > 0 && (
	        <div className="discover-grid">
	          {activeRows.map((friend) => (
	            <article className="discover-card" key={friend.connection_id}>
	              <div className="avatar">{displayInitial(friend.teammate_full_name)}</div>
	              <h3>{displayName(friend.teammate_full_name)} {friend.teammate_is_demo && <DemoBadge />}</h3>
	              <p>{friend.teammate_university || 'RMIT University'}</p>
	              <p>{schoolLabel(friend.teammate_school)} | {friend.teammate_major}</p>
	              <div className="mini-detail">
	                <strong>{t('connections.relationship')}</strong>
	                <span>{t('connections.friendNotTeammate')}</span>
	              </div>
	              <div className="mini-detail">
	                <strong>{t('matches.skillsHave')}</strong>
	                <span>{joinList(friend.teammate_skills)}</span>
	              </div>
	              <div className="hero-actions">
	                <button className="primary" onClick={() => onOpenChat(friend.connection_id)}>
	                  <MessageCircle size={18} />
	                  {t('common.message')}
	                </button>
	                <button className="secondary" onClick={() => onViewProfile(friend.teammate_profile_id)}>
	                  {t('common.viewProfile')}
	                </button>
	              </div>
	            </article>
	          ))}
	        </div>
	      )}

	      {currentProfileId && !state.loading && !showingFriends && activeRows.length > 0 && (
	        <div className="connection-list">
          {activeRows.map((request) => (
            <article className="connection-row" key={request.id}>
              <div>
                <p className="eyebrow">
                  {tab === 'received' && t('connections.receivedFrom', { name: displayName(request.teammate_full_name) })}
                  {tab === 'sent' && t('connections.sentTo', { name: displayName(request.teammate_full_name) })}
                  {tab === 'connected' && `${connectionRelationshipLabel(request)} · ${t('connections.connectedWith', { name: displayName(request.teammate_full_name) })}`}
                  {tab === 'declined' && (
                    request.status === 'unmatched'
                      ? t('connections.endedWith', { name: displayName(request.teammate_full_name) })
                      : t('connections.declinedWith', { name: displayName(request.teammate_full_name) })
                  )}
                </p>
                <h3>{displayName(request.teammate_full_name)} {(request.teammate_is_demo || request.teammate_full_name?.includes('(Demo)')) && <DemoBadge />}</h3>
                <p>{schoolLabel(request.teammate_school)} | {request.teammate_major}</p>
                {getCourseFilterValue(request) ? (
                  <p>{getCourseDisplay(request)} | {getSessionDisplay(request)}</p>
                ) : (
                  <p>{t('connections.discoverConnection')}</p>
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
                    <strong>{t('matches.skillsHave')}</strong>
                    <span>{joinList(request.teammate_skills)}</span>
                  </div>
                  <div className="mini-detail">
                    <strong>{t('matches.lookingFor')}</strong>
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
                      {t('connections.accept')}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => respond(request.id, 'declined')}
                      disabled={state.actionLoadingId === request.id}
                    >
                      <XCircle size={18} />
                      {t('connections.decline')}
                    </button>
                  </>
                )}
	                {tab === 'sent' && request.status === 'pending' && (
	                  <>
	                    <button
	                      className="secondary"
	                      onClick={() => openEditMessage(request)}
	                      disabled={state.actionLoadingId === request.id}
	                    >
	                      <Pencil size={18} />
	                      {t('connections.editMessage')}
	                    </button>
	                    <button
	                      className="secondary quiet-action"
	                      onClick={() => setState((current) => ({ ...current, withdrawTarget: request, actionError: '', actionSuccess: '' }))}
	                      disabled={state.actionLoadingId === request.id}
	                    >
	                      {t('connections.withdrawRequest')}
	                    </button>
	                  </>
	                )}
                {request.status === 'accepted' && (
                  <button className="secondary" onClick={() => onOpenChat(request.id)}>
                    <MessageCircle size={18} />
                    {t('common.message')}
                  </button>
                )}
                <button className="secondary" onClick={() => onViewProfile(request.teammate_profile_id)}>
                  {t('common.viewProfile')}
                </button>
                {tab === 'connected' && (
                  <button
                    className="secondary quiet-action"
                    onClick={() => setState((current) => ({ ...current, unmatchTarget: request, actionError: '' }))}
                  >
                    {t('connections.unmatch')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {currentProfileId && !currentRequestId && (
        <p className="note">{t('connections.needCurrentSearch')}</p>
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
	      {state.editMessageTarget && (
	        <div className="modal-backdrop" role="presentation">
	          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('connections.editMessage')}>
	            <div className="modal-header">
	              <div>
	                <p className="eyebrow">{t('connections.sent')}</p>
	                <h2>{t('connections.editMessage')}</h2>
	              </div>
	              <button
	                className="ghost"
	                onClick={() => setState((current) => ({ ...current, editMessageTarget: null, editMessageText: '', actionError: '' }))}
	                type="button"
	              >
	                {t('common.close')}
	              </button>
	            </div>
	            <label>
	              {t('connect.addMessage')}
	              <textarea
	                value={state.editMessageText}
	                onChange={(event) => setState((current) => ({ ...current, editMessageText: event.target.value }))}
	                rows="4"
	              />
	            </label>
	            <div className="hero-actions">
	              <button
	                className="secondary"
	                type="button"
	                onClick={() => setState((current) => ({ ...current, editMessageTarget: null, editMessageText: '', actionError: '' }))}
	              >
	                {t('common.cancel')}
	              </button>
	              <button
	                className="primary"
	                type="button"
	                onClick={saveEditedMessage}
	                disabled={state.actionLoadingId === state.editMessageTarget.id}
	              >
	                {state.actionLoadingId === state.editMessageTarget.id ? t('common.updating') : t('request.saveChanges')}
	              </button>
	            </div>
	          </section>
	        </div>
	      )}
	      {state.withdrawTarget && (
	        <div className="modal-backdrop" role="presentation">
	          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('connections.withdrawTitle')}>
	            <div className="modal-header">
	              <div>
	                <p className="eyebrow">{t('connections.withdrawTitle')}</p>
	                <h2>{t('connections.withdrawQuestion')}</h2>
	              </div>
	              <button
	                className="ghost"
	                onClick={() => setState((current) => ({ ...current, withdrawTarget: null, actionError: '' }))}
	                type="button"
	              >
	                {t('common.close')}
	              </button>
	            </div>
	            <p className="note">{t('connections.withdrawHelper')}</p>
	            <div className="hero-actions">
	              <button
	                className="secondary"
	                type="button"
	                onClick={() => setState((current) => ({ ...current, withdrawTarget: null, actionError: '' }))}
	              >
	                {t('connections.keepRequest')}
	              </button>
	              <button
	                className="primary danger-action"
	                type="button"
	                onClick={withdraw}
	                disabled={state.actionLoadingId === state.withdrawTarget.id}
	              >
	                {state.actionLoadingId === state.withdrawTarget.id ? t('common.updating') : t('connections.withdrawRequest')}
	              </button>
	            </div>
	          </section>
	        </div>
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
        requests: (requests || []).filter((request) => normalizeFilterValue(request.status) === 'looking'),
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
        class_session: request.class_session,
        is_suitable: friendLooksSuitableForRequest(friend, request),
      });
    });

    return [...optionsByRequest.values()];
  };

  const openMatchPlus = async (friend, initialOptions = []) => {
    if (initialOptions.length > 0) {
      setState((current) => ({
        ...current,
        matchTarget: { ...friend, match_options: initialOptions },
        selectedMatchIndex: 0,
        error: '',
        success: '',
      }));
      return;
    }

    setState((current) => ({
      ...current,
      saving: true,
      error: '',
      success: '',
    }));

    try {
      const requests = await listMyTeamRequests(currentProfileId);
      const activeRequests = (requests || []).filter((request) => normalizeFilterValue(request.status) === 'looking');
      const friendWithRequests = { ...friend, match_options: [] };
      const nextOptions = activeRequests.map((request) => ({
        current_request_id: request.id,
        friend_request_id: null,
        course_name: request.course_name || request.course,
        course_code: request.course_code,
        class_session: request.class_session,
        is_suitable: friendLooksSuitableForRequest(friend, request),
      }));

      setState((current) => ({
        ...current,
        saving: false,
        requests: activeRequests,
        matchTarget: { ...friendWithRequests, match_options: nextOptions },
        selectedMatchIndex: 0,
      }));
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        matchTarget: { ...friend, match_options: [] },
        selectedMatchIndex: 0,
      }));
    }
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
                  className="primary match-plus-button"
                  title="Choose one of your active team requests and add this friend as a teammate."
                  onClick={() => openMatchPlus(friend, matchOptions)}
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
              {!canMatch && <p className="note">Match+ will ask you which active team request to use.</p>}
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
            {(state.matchTarget.match_options || []).length > 0 && (
              <label>
                Choose which team request this match is for
                <select
                  value={state.selectedMatchIndex}
                  onChange={(event) => setState((current) => ({ ...current, selectedMatchIndex: Number(event.target.value) }))}
                >
                  {state.matchTarget.match_options.map((option, index) => (
                    <option value={index} key={`${option.current_request_id}-${option.friend_request_id || 'friend-optional'}`}>
                      {option.course_name || 'Course'} {option.course_code ? `(${option.course_code})` : ''} | {getSessionDisplay(option)}{option.is_suitable ? ' · Suitable' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(state.matchTarget.match_options || []).length === 0 && (
              <div className="request-summary-box">
                <p className="eyebrow">No active request found</p>
                <h3>Create or reopen a team request first.</h3>
                <p className="note">Match+ needs one of your active team requests so Teamergency knows which course/team this friend should count toward.</p>
              </div>
            )}
            {(() => {
              const option = state.matchTarget.match_options?.[state.selectedMatchIndex] || state.matchTarget.match_options?.[0];
              return option ? (
                <div className="request-summary-box">
                  <p className="eyebrow">{option.is_suitable ? 'Suitable for this request' : 'Your selected request'}</p>
                  <h3>{option.course_name || 'Selected course'} {option.course_code ? `(${option.course_code})` : ''}</h3>
                  <p>{getSessionDisplay(option)}</p>
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
              <button
                className="primary match-plus-button"
                onClick={confirmMatchPlus}
                disabled={state.saving || !(state.matchTarget.match_options || []).length}
              >
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

function MessagesList({ currentProfileId, onOpenChat, onViewProfile, onNotificationsChanged, t = translate.bind(null, 'en') }) {
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
	          <p className="eyebrow">{t('messages.title')}</p>
	          <h2>{t('messages.accepted')}</h2>
        </div>
      </div>

      {!currentProfileId && (
        <section className="empty-state">
	          <p>{t('messages.needProfile')}</p>
        </section>
      )}

	      {currentProfileId && state.loading && <p className="loading">{t('common.loadingMessages')}</p>}
      {state.error && <p className="error">{state.error}</p>}

      {currentProfileId && !state.loading && state.threads.length === 0 && (
        <section className="empty-state">
	          <p>{t('messages.none')}</p>
        </section>
      )}

      {currentProfileId && !state.loading && state.threads.length > 0 && (
        <div className="thread-list">
          {state.threads.map((thread) => (
            <article className="thread-row" key={thread.connection_id}>
              <div>
                <strong>{displayName(thread.teammate_full_name)}</strong>
	                <span>{thread.last_message || t('messages.none')}</span>
              </div>
              <div className="thread-actions">
                <time>{formatThreadTime(thread.last_message_at || thread.updated_at)}</time>
                <button className="secondary" onClick={() => onOpenChat(thread.connection_id)}>
                  <MessageCircle size={18} />
	                  {t('common.message')}
                </button>
                <button className="secondary" onClick={() => onViewProfile(thread.teammate_profile_id)}>
	                  {t('common.viewProfile')}
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

function MyProfile({
  profile,
  activeRole,
  authSession,
  lecturerSession,
  onCreateProfile,
  onCreateSearch,
  onOpenLecturer,
  onLecturerLogin,
  onLecturerLogout,
  onLogout,
  onProfileUpdated,
  t = translate.bind(null, 'en'),
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyProfile);
  const [lecturerForm, setLecturerForm] = useState({
    university: lecturerSession?.university || 'RMIT University',
    lecturerId: lecturerSession?.lecturerId || '',
  });
  const [reviewsState, setReviewsState] = useState({ loading: false, error: '', reviews: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const currentRole = activeRole === 'lecturer' ? 'lecturer' : 'student';
  const editingAsLecturer = form.role === 'lecturer';
  const authEmail = getAuthSessionEmail(authSession);
  const signedInWithGoogle = hasGoogleAuthSession(authSession);
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

  useEffect(() => {
    setLecturerForm({
      university: lecturerSession?.university || 'RMIT University',
      lecturerId: lecturerSession?.lecturerId || '',
    });
  }, [lecturerSession?.university, lecturerSession?.lecturerId]);

  const startEdit = () => {
    const school = schoolOptions.some((option) => option.value === profile.school) ? profile.school : '';
    const roleForEdit = currentRole;
    setForm({
      role: roleForEdit,
      full_name: profile.full_name || '',
      university: profile.university || 'RMIT University',
      school,
      major: roleForEdit === 'lecturer'
        ? 'Lecturer'
        : school && majorsBySchool[school]?.includes(profile.major) ? profile.major : '',
      skills: profile.skills || [],
      other_skill: '',
      contact_type: profile.contact_type || 'email',
      avatar_url: profile.avatar_url || '',
      work_styles: profile.work_styles || [],
	      contact_value: profile.contact_value || '',
	      short_bio: profile.short_bio || '',
	      lecturer_title: profile.lecturer_title || '',
	      lecturer_id: profile.lecturer_id || '',
	      academic_field: profile.academic_field || '',
	      lecturer_contact_method: profile.lecturer_contact_method || 'Email',
	      lecturer_contact_detail: profile.lecturer_contact_detail || profile.contact_value || '',
	      student_id: profile.student_id || '',
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

  const submitLecturerLogin = (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const account = findDemoLecturerAccount(lecturerForm.university, lecturerForm.lecturerId);
    if (!account) {
      setError(`Lecturer ID not found for this university. Try: ${demoLecturerHelperText}.`);
      return;
    }

    onLecturerLogin(account);
    setMessage(t('profile.lecturerOpened', { name: account.lecturerName }));
    onOpenLecturer();
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const skills = getProfileSkillsFromForm(form);

	    if (editingAsLecturer) {
	      if (!form.full_name || !form.school || !form.academic_field || !form.lecturer_id || !form.lecturer_contact_detail) {
	        setError("Please fill in your lecturer profile's required fields.");
	        return;
	      }
    } else if (!form.full_name || !form.school || !form.major || skills.length === 0 || !form.contact_value || !form.short_bio) {
      setError("Please fill in your profile's required fields.");
      return;
    }

    setSaving(true);

    try {
      const updated = await updateProfile(profile.id, {
        full_name: form.full_name.trim(),
        university: form.university || 'RMIT University',
        school: form.school.trim(),
        major: editingAsLecturer ? 'Lecturer' : form.major.trim(),
        skills: editingAsLecturer ? ['Teaching'] : skills,
        avatar_url: form.avatar_url || null,
        availability: [],
        preferred_active_time: null,
        work_styles: editingAsLecturer ? [] : form.work_styles,
	        contact_type: editingAsLecturer ? 'email' : form.contact_type,
	        contact_value: editingAsLecturer ? form.lecturer_contact_detail.trim() : form.contact_value.trim(),
        short_bio: editingAsLecturer
          ? form.short_bio.trim() || 'Lecturer profile for class team-formation monitoring.'
          : form.short_bio.trim(),
	        is_available: profile.is_available ?? !editingAsLecturer,
	        role: editingAsLecturer ? 'lecturer' : 'student',
	        lecturer_title: editingAsLecturer ? form.lecturer_title.trim() || null : null,
	        lecturer_id: editingAsLecturer ? form.lecturer_id.trim() : null,
	        academic_field: editingAsLecturer ? form.academic_field.trim() : form.major.trim(),
	        lecturer_contact_method: editingAsLecturer ? form.lecturer_contact_method : null,
	        lecturer_contact_detail: editingAsLecturer ? form.lecturer_contact_detail.trim() : null,
	        student_id: editingAsLecturer ? null : form.student_id.trim() || null,
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
	        <p className="eyebrow">{t('profile.myProfile')}</p>
          {signedInWithGoogle && (
            <p className="signed-in-line">{t('profile.googleSignedIn')}{authEmail ? ` · ${authEmail}` : ''}</p>
          )}
	        {!profile ? (
	          <>
	            <h2>{t('profile.noProfile')}</h2>
	            <p>{t('profile.createFirst')}</p>
	            <button className="primary" onClick={onCreateProfile}>{t('profile.createProfile')}</button>
              <button className="secondary link-button" type="button" onClick={onLogout}>{t('profile.logout')}</button>
	          </>
        ) : (
          <>
            {editing ? (
              <form className="edit-profile-form" onSubmit={saveChanges}>
                <h2>{t('profile.editProfile')}</h2>
                <div className="form-grid single">
                  <label>
                    {t('profile.fullName')}
                    <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
                  </label>
                  <label>
                    {t('profile.university')}
                    <select value={form.university} onChange={(event) => updateField('university', event.target.value)} required>
                      {universityOptions.map((university) => (
                        <option value={university.value} key={university.value}>{university.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {editingAsLecturer ? t('profile.department') : t('profile.school')}
                    <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
                      <option value="">{editingAsLecturer ? t('profile.selectDepartment') : t('profile.selectSchool')}</option>
                      {profileSchoolOptions.map((school) => (
                        <option value={school.value} key={school.value}>{school.label}</option>
                      ))}
                    </select>
                  </label>
	                  {editingAsLecturer ? (
	                    <>
	                      <label>
	                        {t('profile.lecturerTitle')}
	                        <input
	                          value={form.lecturer_title}
	                          onChange={(event) => updateField('lecturer_title', event.target.value)}
	                          placeholder="Course coordinator, lecturer, tutor..."
	                        />
	                      </label>
	                      <label>
	                        {t('profile.academicField')}
	                        <select
	                          value={form.academic_field}
	                          onChange={(event) => updateField('academic_field', event.target.value)}
	                          required
	                        >
	                          <option value="">{t('request.selectField')}</option>
	                          {opportunityFields.map((field) => (
	                            <option value={field} key={field}>{field}</option>
	                          ))}
	                        </select>
	                      </label>
	                      <label>
	                        {t('profile.lecturerId')}
	                        <input
	                          value={form.lecturer_id}
	                          onChange={(event) => updateField('lecturer_id', event.target.value)}
	                          placeholder="v123456"
	                          required
	                        />
	                        <span className="field-helper">{t('profile.demoLecturerIds')}: {demoLecturerHelperText}</span>
	                      </label>
	                      <label>
	                        {t('profile.preferredContact')}
	                        <select
	                          value={form.lecturer_contact_method}
	                          onChange={(event) => updateField('lecturer_contact_method', event.target.value)}
	                          required
	                        >
	                          {lecturerContactMethods.map((method) => (
	                            <option value={method} key={method}>{method}</option>
	                          ))}
	                        </select>
	                      </label>
	                      <label>
	                        {t('profile.contactDetail')}
	                        <input
	                          value={form.lecturer_contact_detail}
	                          onChange={(event) => updateField('lecturer_contact_detail', event.target.value)}
	                          required
	                        />
	                      </label>
	                    </>
	                  ) : (
	                    <>
                      <label>
                        {t('profile.major')}
                        <select value={form.major} onChange={(event) => updateField('major', event.target.value)} required>
                          <option value="">{t('profile.major')}</option>
                          {(majorsBySchool[form.school] || []).map((major) => (
                            <option value={major} key={major}>{major}</option>
                          ))}
                        </select>
	                      </label>
	                      <label>
	                        {t('profile.studentId')}
	                        <input
	                          value={form.student_id}
	                          onChange={(event) => updateField('student_id', event.target.value)}
	                          placeholder="s1234567"
	                        />
	                      </label>
	                      <fieldset className="wide">
                        <legend>{t('profile.skills')}</legend>
                        <p className="field-helper">{t('profile.skillHelper')}</p>
                        <CheckboxGrid
                          options={profileSkillOptions}
                          selected={form.skills}
                          onToggle={toggleProfileSkill}
                        />
                        {form.skills.includes('Other') && (
                          <input
                            value={form.other_skill}
                            onChange={(event) => updateField('other_skill', event.target.value)}
                            placeholder={t('profile.addSkill')}
                          />
                        )}
                      </fieldset>
	                      <fieldset className="wide">
	                        <legend>{t('profile.workStyle')}</legend>
                        <CheckboxGrid
                          options={workStyleOptions}
                          selected={form.work_styles}
                          onToggle={(style) => updateField('work_styles', toggleValue(form.work_styles, style))}
                        />
                      </fieldset>
                    </>
                  )}
	                  {!editingAsLecturer && (
	                    <>
	                      <label>
	                        {t('profile.contactMethod')}
	                        <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
	                          {contactTypes.map((type) => (
	                            <option value={type} key={type}>{contactLabel(type)}</option>
	                          ))}
	                        </select>
	                      </label>
	                      <label>
	                        {t('profile.contactInfo')}
	                        <input
	                          value={form.contact_value}
	                          onChange={(event) => updateField('contact_value', event.target.value)}
	                          required
	                        />
	                      </label>
	                    </>
	                  )}
                  <label>
                    {editingAsLecturer ? t('profile.bioNote') : t('profile.shortBio')}
                    <textarea
                      value={form.short_bio}
                      onChange={(event) => updateField('short_bio', event.target.value)}
                      rows="4"
                      required={!editingAsLecturer}
                    />
                  </label>
	                </div>
                {error && <p className="error">{error}</p>}
                <div className="hero-actions">
                  <button className="primary" type="submit" disabled={saving}>
                    {saving ? t('request.saving') : t('request.saveChanges')}
                  </button>
                  <button className="secondary" type="button" onClick={cancelEdit}>{t('common.cancel')}</button>
                </div>
              </form>
            ) : currentRole === 'student' ? (
              <>
                <div className="avatar">{displayInitial(profile.full_name)}</div>
                <h2>{displayName(profile.full_name)}</h2>
                <dl>
	                  <div><dt>{t('profile.role')}</dt><dd>{t('profile.student')}</dd></div>
                  <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
                  <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>
                  <div><dt>{t('profile.major')}</dt><dd>{profile.major}</dd></div>
	                  <div>
                    <dt>{t('profile.reviews')}</dt>
                    <dd>{reviewsState.loading ? t('profile.loadingReviews') : reviewSummaryLabel(profile, reviewsState.reviews, t)}</dd>
                  </div>
                  <div><dt>{t('profile.contact')}</dt><dd>{contactLabel(profile.contact_type)}: {profile.contact_value}</dd></div>
                  <div><dt>{t('profile.bio')}</dt><dd>{profile.short_bio || t('common.notSpecified')}</dd></div>
                </dl>
                <PillList items={profile.skills} />
                {reviewsState.loading && <p className="loading">{t('profile.loadingReviews')}</p>}
                {reviewsState.error && <p className="error">{reviewsState.error}</p>}
                {!reviewsState.loading && !reviewsState.error && (
                  <ReviewsSection
                    profile={profile}
                    reviews={reviewsState.reviews}
                    title={t('profile.reviewsAboutYou')}
                    t={t}
                  />
                )}
                {message && <p className="success">{message}</p>}
                <div className="stacked-actions">
                  <button className="primary link-button" onClick={startEdit}>{t('profile.editProfile')}</button>
	                  <button className="secondary link-button" onClick={onCreateSearch}>{t('opportunities.new')}</button>
                  <button className="secondary link-button quiet-action" type="button" onClick={onLogout}>{t('profile.logout')}</button>
                </div>
              </>
            ) : (
              <>
                <div className="avatar">{displayInitial(profile.full_name)}</div>
                <h2>{displayName(profile.full_name)}</h2>
                <dl>
                  <div><dt>{t('profile.role')}</dt><dd>{t('profile.lecturer')}</dd></div>
                  <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
                  <div><dt>{t('profile.department')}</dt><dd>{schoolLabel(profile.school)}</dd></div>
                  <div><dt>{t('profile.academicField')}</dt><dd>{profile.academic_field || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.lecturerId')}</dt><dd>{profile.lecturer_id || lecturerSession?.lecturerId || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.contact')}</dt><dd>{profile.lecturer_contact_detail || profile.contact_value || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.bio')}</dt><dd>{profile.short_bio || t('common.notSpecified')}</dd></div>
                </dl>
                {message && <p className="success">{message}</p>}
                {error && <p className="error">{error}</p>}
                <div className="stacked-actions">
                  <button className="primary link-button" type="button" onClick={onOpenLecturer}>{t('profile.openLecturer')}</button>
                  <button className="secondary link-button" type="button" onClick={startEdit}>{t('profile.editProfile')}</button>
                  <button className="secondary link-button quiet-action" type="button" onClick={onLogout}>{t('profile.logout')}</button>
                </div>
              </>
            )}
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
  const [profileFormRole, setProfileFormRole] = useState('student');
  const [selectedLandingRole, setSelectedLandingRole] = useState(() => getStoredPendingRole());
  const [activeRole, setActiveRole] = useState('student');
  const [lecturerSession, setLecturerSession] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [requestClassContext, setRequestClassContext] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedMatchScore, setSelectedMatchScore] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedDiscoverProfileId, setSelectedDiscoverProfileId] = useState('');
  const [bootError, setBootError] = useState('');
  const [notificationCounts, setNotificationCounts] = useState({ connections: 0, messages: 0 });
  const [language, setLanguage] = useState(() => getStoredLanguage());
  const [authSession, setAuthSession] = useState(null);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const t = useMemo(() => (key, values) => translate(language, key, values), [language]);
  const googleProfileSeed = useMemo(
    () => getGoogleProfileSeed(authSession, profileFormRole),
    [authSession?.user?.id, getAuthSessionEmail(authSession), profileFormRole],
  );
  const profileFormInitialData = useMemo(
    () => ({
      ...googleProfileSeed,
      ...(profile || {}),
    }),
    [googleProfileSeed, profile],
  );

  useEffect(() => {
    const storedProfileId = getStoredProfileId();
    const storedRequestId = getStoredRequestId();
    const inviteCode = getStoredInviteCode();
    const storedActiveRole = getStoredActiveRole();
    const pendingRole = getStoredPendingRole();
    const storedLecturerSession = getStoredLecturerSession();
    const loggedOut = getStoredLoggedOut();

    if (loggedOut && !pendingRole && !inviteCode) {
      setProfileId('');
      setRequestId('');
      setSelectedClassId('');
      setActiveRole('student');
      setSelectedLandingRole('');
      setProfileFormRole('student');
      setLecturerSession(null);
      setView('home');
      return;
    }

    setProfileId(storedProfileId || '');
    setRequestId(storedRequestId || '');
    setSelectedClassId(getStoredClassId() || '');
    setActiveRole(storedActiveRole);
    setSelectedLandingRole(pendingRole || '');
    setProfileFormRole(pendingRole || storedActiveRole);
    setLecturerSession(storedLecturerSession);

    if (inviteCode) {
      setView('join-class');
    }

    if (storedProfileId && hasSupabaseConfig) {
      getProfileById(storedProfileId, { claimLegacy: true })
        .then(setProfile)
        .catch(() => setProfileId(''));
    }
	  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return undefined;
    let alive = true;

	    const syncProfileForSession = async (session, { navigateAfterSignIn = false } = {}) => {
	      if (!session?.user) return;
	      const storedProfileId = getStoredProfileId();
	      const pendingRole = getStoredPendingRole();

      if (storedProfileId) {
        try {
          const storedProfile = await getProfileById(storedProfileId, { claimLegacy: true });
          if (!alive) return;
          const nextRole = pendingRole || getProfileRole(storedProfile);
          setSelectedLandingRole(pendingRole || '');
          setProfileFormRole(nextRole);
          changeActiveRole(nextRole);
          setProfileId(storedProfile.id);
          setProfile(storedProfile);
          const profileLecturerSession = lecturerSessionFromProfile({ ...storedProfile, role: nextRole });
          if (profileLecturerSession) {
            setLecturerSession(profileLecturerSession);
            storeLecturerSession(profileLecturerSession);
          }
          if (navigateAfterSignIn && hasGoogleAuthSession(session)) {
            clearPendingRole();
            navigate(nextRole === 'lecturer' ? 'lecturer' : 'my-classes');
          }
        } catch {
          if (!alive) return;
          if (navigateAfterSignIn && hasGoogleAuthSession(session)) navigate('profile');
        }
	        return;
      }

      try {
        let ownedProfile = await getMyProfile();
        if (!ownedProfile?.id && hasGoogleAuthSession(session)) {
          ownedProfile = await getProfileByContactEmail(getAuthSessionEmail(session)).catch(() => null);
        }
        if (!alive) return;
        if (!ownedProfile?.id) {
	          if (hasGoogleAuthSession(session)) {
	            const pendingRole = getStoredPendingRole() || getStoredActiveRole();
	            setSelectedLandingRole(pendingRole);
	            setProfileFormRole(pendingRole);
	            changeActiveRole(pendingRole);
	            if (navigateAfterSignIn) navigate('profile');
	          }
	          return;
	        }
        storeProfileId(ownedProfile.id);
        setProfileId(ownedProfile.id);
        setProfile(ownedProfile);
        const nextRole = getStoredPendingRole() || getProfileRole(ownedProfile);
        changeActiveRole(nextRole);
        const profileLecturerSession = lecturerSessionFromProfile({ ...ownedProfile, role: nextRole });
	        if (profileLecturerSession) {
	          setLecturerSession(profileLecturerSession);
	          storeLecturerSession(profileLecturerSession);
	        }
	        if (navigateAfterSignIn && hasGoogleAuthSession(session)) {
	          clearPendingRole();
	          navigate(nextRole === 'lecturer' ? 'lecturer' : 'my-classes');
	        }
	      } catch {
	        if (hasGoogleAuthSession(session)) {
	          const pendingRole = getStoredPendingRole() || getStoredActiveRole();
	          setSelectedLandingRole(pendingRole);
	          setProfileFormRole(pendingRole);
	          changeActiveRole(pendingRole);
	          if (navigateAfterSignIn) navigate('profile');
	        }
	      }
	    };

    getCurrentSession()
      .then((session) => {
	        if (!alive) return;
	        setAuthSession(session);
	        syncProfileForSession(session, {
	          navigateAfterSignIn: hasGoogleAuthSession(session) && !getStoredLoggedOut() && !getStoredInviteCode(),
	        });
	      })
	      .catch(() => {});

	    const { data } = supabase.auth.onAuthStateChange((event, session) => {
	      setAuthSession(session);
	      syncProfileForSession(session, {
	        navigateAfterSignIn: event === 'SIGNED_IN' && Boolean(getStoredPendingRole()),
	      });
	    });

    return () => {
      alive = false;
      data?.subscription?.unsubscribe();
    };
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

  const hasProfile = Boolean(profileId);
  const currentRole = activeRole === 'lecturer' ? 'lecturer' : 'student';
  const currentLecturerSession = lecturerSession || lecturerSessionFromProfile(profile);
  const showStudentNavigation = hasProfile && currentRole === 'student';
  const showLecturerNavigation = hasProfile && currentRole === 'lecturer';

  const selectLandingRole = (role) => {
    const nextRole = role === 'lecturer' ? 'lecturer' : 'student';
    clearLoggedOut();
    setSelectedLandingRole(nextRole);
    setProfileFormRole(nextRole);
    storePendingRole(nextRole);
    changeActiveRole(nextRole);
  };

	  const openProfileForm = (role = 'student') => {
    const nextRole = role === 'lecturer' ? 'lecturer' : 'student';
    clearLoggedOut();
    setProfileFormRole(nextRole);
    setSelectedLandingRole(nextRole);
    storePendingRole(nextRole);
    changeActiveRole(nextRole);
    navigate('profile');
  };

	  const changeActiveRole = (role) => {
    const nextRole = role === 'lecturer' ? 'lecturer' : 'student';
    setActiveRole(nextRole);
    storeActiveRole(nextRole);
	  };

	  const changeLanguage = (nextLanguage) => {
	    const normalized = nextLanguage === 'vi' ? 'vi' : 'en';
	    setLanguage(normalized);
	    storeLanguage(normalized);
	  };

	  const continueWithExistingGoogleSession = async (session, nextRole) => {
	    setAuthSession(session);
	    let ownedProfile = null;
	    const storedProfileId = getStoredProfileId();
	    const sessionEmail = getAuthSessionEmail(session);

	    try {
	      if (storedProfileId) {
	        ownedProfile = await getProfileById(storedProfileId, { claimLegacy: true }).catch(() => null);
	      }

	      if (!ownedProfile) {
	        ownedProfile = await getMyProfile().catch(() => null);
	      }

	      if (!ownedProfile && sessionEmail) {
	        ownedProfile = await getProfileByContactEmail(sessionEmail).catch(() => null);
	      }
	    } catch (err) {
	      console.error('Could not restore Google profile session', err);
	    }

	    if (!ownedProfile?.id) {
	      setProfile(null);
	      setProfileId('');
	      navigate('profile');
	      return;
	    }

	    storeProfileId(ownedProfile.id);
	    setProfileId(ownedProfile.id);
	    setProfile(ownedProfile);
	    const profileLecturerSession = lecturerSessionFromProfile({ ...ownedProfile, role: nextRole });
	    if (profileLecturerSession) {
	      setLecturerSession(profileLecturerSession);
	      storeLecturerSession(profileLecturerSession);
	    }

	    clearPendingRole();
	    navigate(nextRole === 'lecturer' ? 'lecturer' : 'my-classes');
	  };

	  const routeExistingGoogleSession = async (session, nextRole) => {
	    try {
	      await continueWithExistingGoogleSession(session, nextRole);
	    } catch (err) {
	      console.error('Existing Google session could not be routed', err);
	      setAuthSession(session);
	      setProfile(null);
	      setProfileId('');
	      navigate('profile');
	    }
	  };

	  const handleGoogleSignIn = async (roleOverride = selectedLandingRole || profileFormRole || activeRole) => {
	    setBootError('');
	    setGoogleSigningIn(true);
      const nextRole = roleOverride === 'lecturer' ? 'lecturer' : 'student';
      setSelectedLandingRole(nextRole);
      setProfileFormRole(nextRole);
      storePendingRole(nextRole);
      changeActiveRole(nextRole);
      clearLoggedOut();

	    try {
	      if (hasGoogleAuthSession(authSession)) {
	        await routeExistingGoogleSession(authSession, nextRole);
	        return;
	      }

	      const existingSession = await getCurrentSession().catch(() => null);
	      if (hasGoogleAuthSession(existingSession)) {
	        await routeExistingGoogleSession(existingSession, nextRole);
	        return;
	      }

	      await signInWithGoogle();
	    } catch (err) {
	      console.error('Google sign-in failed', err);
	      setBootError(t('profile.googleSignInFail'));
	    } finally {
	      setGoogleSigningIn(false);
	    }
	  };

  const handleLecturerLogin = (account) => {
    setLecturerSession(account);
    storeLecturerSession(account);
    changeActiveRole('lecturer');
  };

  const handleLecturerLogout = () => {
    setLecturerSession(null);
    clearLecturerSession();
  };

  const handleLogout = async () => {
    setBootError('');
    try {
      if (hasSupabaseConfig) {
        await signOut();
      }
    } catch (err) {
      setBootError(getFriendlyError(err, "We couldn't log you out. Please try again."));
      return;
    }

    clearCurrentRequest();
    clearLecturerSession();
    clearPendingRole();
    clearActiveRole();
    storeLoggedOut();
    setAuthSession(null);
    setProfile(null);
    setProfileId('');
    setRequestId('');
    setLecturerSession(null);
    setSelectedLandingRole('');
    setProfileFormRole('student');
    setActiveRole('student');
    setViewHistory([]);
    setView('home');
  };

  const startRequest = async () => {
    setBootError('');
    setRequestClassContext(null);

    if (!profileId) {
      openProfileForm('student');
      return;
    }

    if (currentRole === 'lecturer') {
      navigate(lecturerSession ? 'lecturer' : 'my-profile');
      return;
    }

    if (profile) {
      navigate('request');
      return;
    }

    try {
      const loadedProfile = await getProfileById(profileId, { claimLegacy: true });
      setProfile(loadedProfile);
      navigate(currentRole === 'lecturer' ? (lecturerSession ? 'lecturer' : 'my-profile') : 'request');
    } catch {
      setBootError("We couldn't load your saved profile. Please create a profile again on this device.");
      openProfileForm('student');
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

  const openClass = (classId) => {
    if (classId) {
      setSelectedClassId(classId);
      storeClassId(classId);
    }
    navigate('class-detail');
  };

  const openClassRequest = (classItem, teamStatus = null) => {
    setRequestClassContext({ ...classItem, teamStatus });
    setSelectedClassId(classItem.id);
    storeClassId(classItem.id);
    navigate('request');
  };

  const openMatchesForRequest = (nextRequestId) => {
    selectCurrentRequest(nextRequestId);
    navigate('matches');
  };

  const handleClassJoined = (classId) => {
    openClass(classId);
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
	          <div className="language-switch" aria-label="Language">
	            <Languages size={16} />
	            {languages.map((option) => (
	              <button
	                className={language === option.value ? 'active' : ''}
	                key={option.value}
	                onClick={() => changeLanguage(option.value)}
	                type="button"
	              >
	                {option.label}
	              </button>
	            ))}
	          </div>
	          {view === 'home' ? (
	            <>
	              <button className="ghost nav-outline" onClick={() => navigate('my-profile')}>{hasProfile ? t('nav.myProfile') : t('nav.logIn')}</button>
	            </>
	          ) : (
	            <>
	              {showStudentNavigation && <button className="ghost" onClick={() => navigate('my-classes')}>{t('nav.myClasses')}</button>}
	              {showStudentNavigation && <button className="ghost" onClick={() => navigate('discover')}>{t('nav.discover')}</button>}
	              {showLecturerNavigation && <button className="ghost" onClick={() => navigate('lecturer')}>{t('nav.lecturer')}</button>}
	              {showStudentNavigation && profileId && <button className="ghost" onClick={() => navigate('current-request')}>{t('nav.openOpportunities')}</button>}
	              {showStudentNavigation && <button className="ghost" onClick={() => navigate('connections')}>{t('nav.connections')}{notificationCounts.connections > 0 && <span className="nav-badge">{notificationCounts.connections}</span>}</button>}
	              {showLecturerNavigation && <button className="ghost" onClick={() => navigate('messages')}>{t('nav.messages')}{notificationCounts.messages > 0 && <span className="nav-badge">{notificationCounts.messages}</span>}</button>}
	              <button className="ghost" onClick={() => navigate('my-profile')}>{t('nav.myProfile')}</button>
	            </>
	          )}
        </div>
      </header>

      {configWarning && <div className="banner">{configWarning}</div>}
      {bootError && <div className="banner error-banner">{bootError}</div>}

	      {view === 'home' && (
	        <Home
            selectedRole={selectedLandingRole}
            authSession={authSession}
	          googleSigningIn={googleSigningIn}
            onSelectRole={selectLandingRole}
	          onStartProfile={openProfileForm}
            onGoogleSignIn={handleGoogleSignIn}
	          t={t}
	        />
	      )}

      {view === 'profile' && (
	        <ProfileForm
	          key={`${profileFormRole}-${profileFormInitialData.id || authSession?.user?.id || 'new'}`}
	          initialRole={profileFormRole}
            initialData={profileFormInitialData}
	          t={t}
	          onSaved={(savedProfile) => {
            const savedRole = getProfileRole(savedProfile);
            setProfile(savedProfile);
            setProfileId(savedProfile.id);
            setProfileFormRole(savedRole);
            changeActiveRole(savedRole);
            const profileLecturerSession = lecturerSessionFromProfile(savedProfile);
            if (profileLecturerSession) {
              setLecturerSession(profileLecturerSession);
              storeLecturerSession(profileLecturerSession);
            }
            clearPendingRole();
            navigate(getStoredInviteCode() ? 'join-class' : 'profile-saved');
          }}
        />
      )}

	      {view === 'profile-saved' && (
	        <ProfileSaved profile={profile} onContinue={() => navigate(currentRole === 'lecturer' ? 'lecturer' : 'my-classes')} t={t} />
	      )}

      {view === 'join-class' && (
        <JoinClassPage
	          profile={profile}
	          profileId={profileId}
	          onCreateProfile={() => openProfileForm('student')}
	          onJoined={handleClassJoined}
	          t={t}
	        />
      )}

      {view === 'my-classes' && (
        <MyClassesPage
          profileId={profileId}
	          onCreateProfile={() => openProfileForm('student')}
	          onJoinClass={() => navigate('join-class')}
	          onOpenClass={openClass}
	          t={t}
	        />
      )}

      {view === 'class-detail' && (
        <ClassDetailPage
          classId={selectedClassId}
          profile={profile}
          profileId={profileId}
          onBack={() => navigate('my-classes')}
          onJoinClass={() => navigate('join-class')}
	          onFindTeammates={openClassRequest}
	          onViewMatches={openMatchesForRequest}
	          onOpenChat={openChat}
	          t={t}
	        />
      )}

      {view === 'lecturer' && (
	        <LecturerDashboard
	          activeRole={currentRole}
	          lecturerSession={currentLecturerSession}
		          profileId={profileId}
		          onOpenProfile={() => navigate('my-profile')}
		          onOpenChat={openChat}
		          t={t}
		        />
      )}

      {view === 'request' && profile && (
        <RequestForm
          profile={profile}
	          onBack={() => (requestClassContext ? navigate('class-detail') : goBack('home'))}
	          classContext={requestClassContext}
	          t={t}
	          onCreated={(request) => {
            setRequestId(request.id);
            if (request.class_id || requestClassContext?.id) {
              const nextClassId = request.class_id || requestClassContext.id;
              setSelectedClassId(nextClassId);
              storeClassId(nextClassId);
              setRequestClassContext(null);
              navigate('matches');
            } else {
              navigate('matches');
            }
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
	          t={t}
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
          t={t}
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
		          onViewRecommended={openMatchesForRequest}
		          onCreateNew={startRequest}
		          t={t}
		        />
      )}

      {view === 'found' && (
        <FoundConfirmation
          onCreateAnother={startRequest}
          onHome={() => navigate('home')}
          t={t}
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
	          t={t}
	        />
      )}

      {view === 'discover' && (
        <DiscoverPage
          currentProfileId={profileId}
          t={t}
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
          t={t}
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
	          activeRole={currentRole}
	          authSession={authSession}
	          lecturerSession={lecturerSession}
	          onCreateProfile={() => openProfileForm('student')}
	          onCreateSearch={startRequest}
	          onOpenLecturer={() => navigate('lecturer')}
          onLecturerLogin={handleLecturerLogin}
	          onLecturerLogout={handleLecturerLogout}
          onLogout={handleLogout}
	          onProfileUpdated={(updatedProfile) => {
              setProfile(updatedProfile);
              const profileLecturerSession = lecturerSessionFromProfile(updatedProfile);
              if (profileLecturerSession) {
                setLecturerSession(profileLecturerSession);
                storeLecturerSession(profileLecturerSession);
              }
            }}
	          t={t}
	        />
      )}
    </div>
  );
}
