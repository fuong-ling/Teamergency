import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Trophy,
  UserPlus,
  UserRound,
  UsersRound,
  Languages,
  Zap,
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
  pinTeamRequestFor48Hours,
  respondConnectionRequest,
  resetDemoConnection,
  reopenTeamRequest,
  sendDemoReply,
  sendChatMessage,
  sendConnectionRequest,
  sendLecturerReminder,
  saveClassTeamStatus,
  simulateDemoAcceptance,
  trackProductEvent,
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
  contactTypes,
  getAllCourses,
  getAllSkills,
  getCoursesForSchool,
  getRequestSkillOptions,
  getSessionsForCourse,
  getSchoolsForUniversity,
  getProfileSkillSuggestions,
  majorsBySchool,
  OTHER_UNIVERSITY_VALUE,
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
  getStoredLandingTheme,
  getStoredLecturerSession,
  getStoredLoggedOut,
  getStoredPendingRole,
  clearActiveRole,
  clearCurrentRequest,
  clearLoggedOut,
  clearLecturerSession,
  clearPendingRole,
  clearProfileId,
  storeCurrentRequest,
  storeActiveRole,
  storeClassId,
  storeLandingTheme,
  storeLanguage,
  storeLecturerSession,
  storeLoggedOut,
  storePendingRole,
  storeProfileId,
} from './lib/storage';
import { calculateMatchScore } from './lib/matching';
import { languages, translate } from './lib/i18n';

const classDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const currentUiLanguage = () => getStoredLanguage?.() || 'en';

const hiddenLegacyDemoClassCodes = ['676767', '88889999'];

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

const demoClassCodes = ['200206'];

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
    lecturerName: profile.full_name || translate(currentUiLanguage(), 'profile.lecturer'),
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

const unmatchReasonKeys = {
  'Our skills or expectations are not a good fit': 'ui.unmatchReason.skills',
  'Our working styles are not compatible': 'ui.unmatchReason.style',
  'I found another teammate': 'ui.unmatchReason.another',
  'No response / inactive': 'ui.unmatchReason.inactive',
  'Connected by mistake': 'ui.unmatchReason.mistake',
  'Our project needs have changed': 'ui.unmatchReason.changed',
  Other: 'ui.unmatchReason.other',
};

const emptyProfile = {
  role: 'student',
  full_name: '',
  university: 'RMIT University',
  university_choice: 'RMIT University',
  custom_university: '',
  school: '',
  custom_school: '',
  major: '',
  custom_major: '',
  custom_subject: '',
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
  subscription_status: 'free',
  consent_public_visibility: false,
};

const createProfileFormState = (initialRole = 'student', initialData = {}) => {
  const role = initialRole === 'lecturer' ? 'lecturer' : 'student';
  const initialSchool = initialData.school || '';
  const knownSchool = schoolOptions.some((option) => option.value === initialSchool);
  return {
    ...emptyProfile,
    ...initialData,
    role,
    university: initialData.university || emptyProfile.university,
    university_choice: getUniversityChoice(initialData.university || emptyProfile.university),
    custom_university: getUniversityChoice(initialData.university || emptyProfile.university) === OTHER_UNIVERSITY_VALUE
      ? initialData.university || ''
      : '',
    school: knownSchool || !initialSchool ? initialSchool : OTHER_OPTION_VALUE,
    custom_school: knownSchool ? '' : initialSchool,
    major: role === 'lecturer' ? 'Lecturer' : initialData.major || '',
    custom_major: '',
    custom_subject: initialData.academic_field && !opportunityFields.includes(initialData.academic_field)
      ? initialData.academic_field
      : '',
    skills: Array.isArray(initialData.skills) ? initialData.skills : [],
    work_styles: Array.isArray(initialData.work_styles) ? initialData.work_styles : [],
    contact_type: initialData.contact_type || 'email',
    contact_value: initialData.contact_value || '',
    lecturer_contact_method: initialData.lecturer_contact_method || 'Email',
    lecturer_contact_detail: initialData.lecturer_contact_detail || initialData.contact_value || '',
    student_id: initialData.student_id || '',
    subscription_status: initialData.subscription_status || 'free',
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
  return normalized ? `${translate(currentUiLanguage(), 'ui.sessionPrefix')} ${normalized}` : '';
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

const validatePortfolioFile = (file, t = (key, values) => translate(currentUiLanguage(), key, values)) => {
  if (!file) return '';
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!portfolioFileRules.extensions.includes(extension)) {
    return t('request.portfolioFileType');
  }

  if (!portfolioFileRules.mimeTypes.includes(file.type)) {
    return t('request.portfolioFileType');
  }

  if (file.size > portfolioFileRules.maxSize) {
    return t('request.portfolioFileSize');
  }

  return '';
};

const isMissingTeamRequestSchema = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  const referencesTeamRequestField = ['total_team_size', 'teammates_needed_initial', 'class_id']
    .some((field) => message.includes(field));
  const missingColumn = ['42703', 'PGRST204'].includes(code)
    && message.includes('column')
    && referencesTeamRequestField;
  const missingFunction = code === 'PGRST202'
    && message.includes('could not find the function')
    && [
      'create_team_request',
      'create_team_request_with_class',
      'update_team_request',
      'update_team_request_with_class',
    ].some((functionName) => message.includes(functionName));

  return missingColumn || missingFunction;
};

const getFriendlyError = (error, fallback, { demoClassJoin = false } = {}) => {
  if (error?.code === 'anonymous_provider_disabled' || error?.message?.includes('Anonymous sign-ins are disabled')) {
    return translate(currentUiLanguage(), 'errors.anonymousAuth');
  }

  if (error?.code === 'PGRST204' || error?.message?.includes("Could not find the 'owner_id' column")) {
    return translate(currentUiLanguage(), 'errors.publicTestingMigration');
  }

  if (isMissingTeamRequestSchema(error)) {
    return translate(currentUiLanguage(), 'errors.teamRequestMigration');
  }

  if (
    error?.message?.includes('p_university')
    || error?.message?.includes("Could not find the 'university' column")
    || error?.message?.includes("Could not find the 'is_available' column")
  ) {
    return translate(currentUiLanguage(), 'errors.a3Migration');
  }

  if (error?.message?.includes('Profile ownership required')) {
    return translate(currentUiLanguage(), 'errors.profileOwnership');
  }

  if (error?.message?.includes('Profile was not updated')) {
    return translate(currentUiLanguage(), 'errors.profileUpdateOwnership');
  }

  if (error?.message?.includes('does not match your current academic profile')) {
    return translate(currentUiLanguage(), 'errors.classProfileMismatch');
  }

  if (demoClassJoin && error?.message?.includes('class_id') && error?.message?.includes('ambiguous')) {
    return translate(currentUiLanguage(), 'errors.demoClassJoinMigration');
  }

  if (error?.message?.includes('Review is not available yet')) {
    if (REVIEW_WAIT_DAYS === 0) {
      return translate(currentUiLanguage(), 'errors.reviewWaitMigration');
    }
    return translate(currentUiLanguage(), 'errors.reviewUnavailable');
  }

  if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
    return translate(currentUiLanguage(), 'errors.duplicateSubmission');
  }

  return error?.message ? `${fallback} (${error.message})` : fallback;
};

const titleCase = (value) => {
  if (!value) return translate(currentUiLanguage(), 'common.notSpecified');
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const contactLabel = (value) => {
  if (value === 'url') return translate(currentUiLanguage(), 'options.contact.url');
  return titleCase(value);
};

const schoolLabel = (value) =>
  schoolOptions.find((school) => school.value === value)
    ? translate(currentUiLanguage(), `options.school.${String(value).toLowerCase()}`)
    : value || translate(currentUiLanguage(), 'common.notSpecified');

const hasDisplaySchool = (value) => Boolean(String(value || '').trim());

const formatSchoolMajorLine = (school, major, separator = ' | ') =>
  [
    hasDisplaySchool(school) ? schoolLabel(school) : '',
    major,
  ].filter(Boolean).join(separator);

const formatProfileAcademicLine = (profile = {}, separator = ' | ') =>
  [
    universityLabel(profile.university),
    hasDisplaySchool(profile.school) ? schoolLabel(profile.school) : '',
    profile.major,
  ].filter(Boolean).join(separator);

const universityLabel = (value) =>
  universityOptions.find((university) => university.value === value)
    ? translate(currentUiLanguage(), `options.university.${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`)
    : value || 'RMIT University';

const isKnownUniversity = (value = '') =>
  universityOptions.some((university) => university.value === value);

const isRmitUniversity = (value = '') =>
  normalizeFilterValue(value) === normalizeFilterValue('RMIT University')
  || normalizeFilterValue(value) === normalizeFilterValue('RMIT University Vietnam');

const getUniversityChoice = (value = '') => {
  if (!value) return 'RMIT University';
  return isKnownUniversity(value) ? value : OTHER_UNIVERSITY_VALUE;
};

const resolveProfileUniversity = (form = {}) =>
  form.university_choice === OTHER_UNIVERSITY_VALUE
    ? String(form.custom_university || '').trim()
    : form.university_choice || form.university || 'RMIT University';

const isOtherUniversityForm = (form = {}) =>
  form.university_choice === OTHER_UNIVERSITY_VALUE
  || (!form.university_choice && Boolean(resolveProfileUniversity(form)) && !isKnownUniversity(resolveProfileUniversity(form)));

const isValidSchoolCode = (value = '') =>
  schoolOptions.some((school) => school.value === String(value || '').trim());

const getFormSchoolValue = (form = {}) =>
  form.school === OTHER_OPTION_VALUE
    ? String(form.custom_school || '').trim() || null
    : String(form.school || '').trim() || null;

const getFormSubjectValue = (form = {}) =>
  form.academic_field === OTHER_OPTION_VALUE
    ? String(form.custom_subject || '').trim() || ''
    : String(form.academic_field || '').trim();

const getFormMajorValue = (form = {}) =>
  form.major === OTHER_OPTION_VALUE
    ? String(form.custom_major || '').trim() || ''
    : String(form.major || '').trim();

const subscriptionTier = (profile = {}) =>
  String(profile?.subscription_status || profile?.subscription || 'free').trim().toLowerCase();

const isPremiumProfile = (profile = {}) =>
  ['paid', 'premium'].includes(subscriptionTier(profile));

const subscriptionLabel = (profile = {}, t = translate.bind(null, 'en')) =>
  isPremiumProfile(profile) ? t('premium.premium') : t('premium.free');

const isRequestPinned = (request = {}) =>
  Boolean(request?.pinned_until && new Date(request.pinned_until).getTime() > Date.now());

const sortRequestsByVisibility = (requests = []) =>
  [...requests].sort((a, b) =>
    Number(isRequestPinned(b)) - Number(isRequestPinned(a))
    || new Date(b.created_at || 0) - new Date(a.created_at || 0),
  );

const isProfileOwnershipError = (error) =>
  String(error?.message || '').includes('Profile ownership required')
  || String(error?.message || '').includes('not linked to the current sign-in session');

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
  course?.code ? `${course.name} (${course.code})` : course?.name || translate(currentUiLanguage(), 'common.notSpecified');

const findCourseByCode = (courseCode) =>
  allCourseOptions.find((course) => course.code === courseCode) || null;

const getCourseDisplay = (request) => {
  if (!request) return translate(currentUiLanguage(), 'common.notSpecified');
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.opportunity_name || request.course_name || request.course || translate(currentUiLanguage(), 'request.open');
  }
  if (request.course_name && request.course_code) return `${request.course_name} (${request.course_code})`;
  if (request.course_name) return request.course_name;
  return request.course || translate(currentUiLanguage(), 'common.notSpecified');
};

const getOpportunityMeta = (request) =>
  [request?.opportunity_type, request?.opportunity_field]
    .filter(Boolean)
    .join(' | ') || translate(currentUiLanguage(), 'request.open');

const getSessionDisplay = (request = {}) => {
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.deadline
      ? `${translate(currentUiLanguage(), 'request.deadline')} ${request.deadline}`
      : translate(currentUiLanguage(), 'request.outsideClass');
  }

  const sessionLabel = formatSessionCode(request.session_code || request.class_session);
  if (sessionLabel) return sessionLabel;
  if (request.class_session && !isTimetableSession(request.class_session)) return request.class_session;
  return request.class_session
    ? translate(currentUiLanguage(), 'class.session')
    : translate(currentUiLanguage(), 'common.notSpecified');
};

const getLocalizedSessionDisplay = (request = {}, t = translate.bind(null, 'en')) => {
  if (request.request_scope === 'open_opportunity' || request.opportunity_name) {
    return request.deadline ? `${t('request.deadline')} ${request.deadline}` : t('request.outsideClass');
  }

  if (!request.class_session && !request.session_code) return t('common.notSpecified');
  const session = getSessionDisplay(request);
  if (request.class_session && !isTimetableSession(request.class_session) && !request.session_code) {
    return request.class_session;
  }
  return session;
};

const requestStatusLabel = (status, t = translate.bind(null, 'en')) => {
  if (status === 'looking') return t('status.looking');
  if (status === 'found') return t('common.completed');
  if (status === 'cancelled') return t('common.cancelled');
  return titleCase(status);
};

const getClassDisplay = (classItem = {}) => {
  const course = classItem.course_name || classItem.course || translate(currentUiLanguage(), 'class.course');
  const code = classItem.course_code ? ` (${classItem.course_code})` : '';
  return `${course}${code} · ${getSessionDisplay(classItem)}`;
};

const getAcademicPeriodDisplay = (item = {}) =>
  [item.semester, item.academic_year].filter(Boolean).join(', ') || translate(currentUiLanguage(), 'common.notSpecified');

const getCourseFilterValue = (request) =>
  request?.course_code || request?.course_name || request?.course || '';

const normalizeFilterValue = (value) => String(value || '').trim().toLowerCase();

const normalizeAcademicValue = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const dedupeAcademicValues = (values = []) => {
  const seen = new Set();
  return values.reduce((result, value) => {
    const clean = normalizeAcademicValue(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return result;
    seen.add(key);
    result.push(clean);
    return result;
  }, []);
};

const mergeAcademicOptions = (staticOptions = [], dynamicValues = []) => {
  const seen = new Set();
  return [...staticOptions, ...dynamicValues].reduce((result, option) => {
    const rawValue = typeof option === 'string' ? option : option?.value;
    const cleanValue = normalizeAcademicValue(rawValue);
    const key = cleanValue.toLowerCase();
    if (!cleanValue || seen.has(key)) return result;
    seen.add(key);
    result.push(typeof option === 'string' ? { value: cleanValue, label: cleanValue } : {
      ...option,
      value: cleanValue,
    });
    return result;
  }, []);
};

const getAcademicValuesFromProfiles = (profiles = []) => {
  const rows = Array.isArray(profiles) ? profiles : [];
  const studentProfiles = rows.filter((profile) => getProfileRole(profile) === 'student');
  const lecturerProfiles = rows.filter((profile) => getProfileRole(profile) === 'lecturer');
  return {
    universities: dedupeAcademicValues(rows.map((profile) => profile.university)),
    schools: dedupeAcademicValues(rows.map((profile) => profile.school)),
    majors: dedupeAcademicValues(studentProfiles.map((profile) => profile.major)),
    subjects: dedupeAcademicValues(lecturerProfiles.map((profile) => profile.academic_field)),
  };
};

const emptyAcademicValues = {
  universities: [],
  schools: [],
  majors: [],
  subjects: [],
};

const arrayOverlapCount = (left = [], right = []) => {
  const rightSet = new Set((right || []).map(normalizeFilterValue).filter(Boolean));
  return (left || []).map(normalizeFilterValue).filter((item) => rightSet.has(item)).length;
};

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
  if (!items?.length) return translate(currentUiLanguage(), 'common.notSpecified');
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

const getRequestStatusMetrics = (request = {}) => {
  const teamStatus = request.team_status || {};
  const total = Math.max(1, Number(
    teamStatus.total_team_size
      ?? teamStatus.required_members
      ?? getTotalTeamSize(request),
  ));
  const remainingValue = teamStatus.remaining_members ?? teamStatus.remaining_spots;
  const foundValue = teamStatus.found_count ?? teamStatus.current_members ?? teamStatus.teammates_found;
  const fallbackFound = remainingValue !== undefined
    ? total - Number(remainingValue)
    : total - getInitialNeeded(request);
  const found = Math.min(total, Math.max(0, Number(foundValue ?? fallbackFound)));
  const remaining = Math.max(0, total - found);

  return {
    total,
    found,
    remaining,
    complete: found >= total,
    percent: Math.min(100, (found / total) * 100),
  };
};

const SkillList = ({ items = [] }) => (
  items?.length ? (
    <span className="skill-chip-list">
      {items.map((item, index) => <span className="skill-chip" key={`${item}-${index}`}>{item}</span>)}
    </span>
  ) : <span>{translate(currentUiLanguage(), 'common.notSpecified')}</span>
);

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

const getPreferredLandingTheme = () => {
  const storedTheme = getStoredLandingTheme();
  if (storedTheme) return storedTheme;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const profileRequiredLabels = {
  full_name: 'profile.fullName',
  university: 'profile.university',
  custom_university: 'profile.universityName',
  school: 'profile.department',
  major: 'profile.major',
  skills: 'profile.skills',
  contact_value: 'profile.contactInfo',
  short_bio: 'profile.shortBio',
  work_styles: 'profile.workStyle',
  student_id: 'profile.studentId',
  academic_field: 'profile.subject',
  lecturer_id: 'profile.lecturerId',
  lecturer_contact_detail: 'profile.contactDetail',
};

const getProfileRequiredFields = (form = {}) => {
  const role = form.role === 'lecturer' ? 'lecturer' : 'student';
  if (role === 'lecturer') {
    return ['full_name', 'university', 'school', 'academic_field', 'lecturer_id', 'lecturer_contact_detail'];
  }

  const base = ['full_name', 'university', 'major', 'student_id', 'skills', 'contact_value', 'short_bio'];
  return isOtherUniversityForm(form) ? base : ['full_name', 'university', 'school', 'major', 'student_id', 'skills', 'contact_value', 'short_bio'];
};

const isProfileFieldRequired = (form = {}, field) => {
  if (field === 'custom_university') return isOtherUniversityForm(form);
  if (field === 'consent_public_visibility') return true;
  if (field === 'lecturer_contact_method') return form.role === 'lecturer';
  return getProfileRequiredFields(form).includes(field);
};

const getProfileFieldErrors = (form, t = translate.bind(null, 'en')) => {
  const role = form.role === 'lecturer' ? 'lecturer' : 'student';
  const isFilled = (field) => {
    if (field === 'university') {
      return Boolean(resolveProfileUniversity(form));
    }
    if (field === 'school') {
      return Boolean(getFormSchoolValue(form));
    }
    if (field === 'academic_field') {
      return Boolean(getFormSubjectValue(form));
    }
    if (field === 'major') {
      return Boolean(getFormMajorValue(form));
    }
    const value = field === 'skills' ? getProfileSkillsFromForm(form) : form[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
  };
  return getProfileRequiredFields({ ...form, role }).reduce((errors, field) => {
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

const FieldLabel = ({ children, required = false }) => (
  <span className="field-label">
    {children}
    {required && <span className="required-mark" aria-hidden="true">*</span>}
  </span>
);

const OTHER_OPTION_VALUE = '__other__';

function SearchableCombobox({
  value = '',
  options = [],
  onSelect,
  onCustom,
  placeholder,
  otherLabel,
  addLabel,
  noResultsLabel,
  t = translate.bind(null, 'en'),
  otherValue = OTHER_OPTION_VALUE,
}) {
  const rootRef = useRef(null);
  const selectedValueRef = useRef(value);
  const inputFocusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value === otherValue ? '' : String(value || ''));
  const [queryDirty, setQueryDirty] = useState(false);

  useEffect(() => {
    if (selectedValueRef.current === value) return;
    selectedValueRef.current = value;
    if (inputFocusedRef.current) return;
    setQuery(value === otherValue ? '' : String(value || ''));
    setQueryDirty(false);
  }, [value, otherValue]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const normalizedQuery = queryDirty ? query.trim().toLowerCase() : '';
  const filteredOptions = options
    .filter((option) => {
      const optionValue = String(option.value || option).toLowerCase();
      const optionLabel = String(option.label || option.value || option).toLowerCase();
      return optionValue.includes(normalizedQuery) || optionLabel.includes(normalizedQuery);
    })
    .slice(0, 40);
  const exactOption = options.some((option) => {
    const optionValue = String(option.value || option).trim().toLowerCase();
    const optionLabel = String(option.label || option.value || option).trim().toLowerCase();
    return optionValue === normalizedQuery || optionLabel === normalizedQuery;
  });
  const selectOption = (nextValue) => {
    if (nextValue === otherValue) {
      setQuery('');
      setQueryDirty(false);
      onSelect(otherValue);
    } else {
      const option = options.find((item) => String(item.value || item) === nextValue);
      const nextLabel = option?.label || option?.value || option || nextValue;
      setQuery(String(nextLabel));
      setQueryDirty(false);
      onSelect(nextValue);
    }
    setOpen(false);
  };

  const selectedOption = options.find((option) => String(option.value || option) === String(value));
  const selectedLabel = selectedOption?.label || selectedOption?.value || value;
  // Keep the live query visible while the menu is open, including when the
  // selected value is the "Other" sentinel used for custom saved values.
  // The custom-value input remains responsible for the committed value.
  const displayValue = open ? query : (value === otherValue ? '' : (query || String(selectedLabel || '')));

  return (
    <div className="searchable-combobox" ref={rootRef}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={displayValue}
        placeholder={placeholder}
        onFocus={(event) => {
          inputFocusedRef.current = true;
          if (!queryDirty && query) event.currentTarget.select();
          setOpen(true);
        }}
        onBlur={() => {
          inputFocusedRef.current = false;
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setQueryDirty(true);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && open && filteredOptions[0]) {
            event.preventDefault();
            selectOption(String(filteredOptions[0].value || filteredOptions[0]));
          }
        }}
      />
      {open && (
        <div className="searchable-combobox-menu" role="listbox">
          {filteredOptions.map((option) => {
            const optionValue = String(option.value || option);
            const optionLabel = option.label || option.value || option;
            return (
              <button
                className="searchable-combobox-option"
                type="button"
                role="option"
                key={optionValue}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(optionValue)}
              >
                {optionLabel}
              </button>
            );
          })}
          {onCustom && query.trim() && !exactOption && !filteredOptions.length && (
            <button
              className="searchable-combobox-option add-option"
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCustom(query.trim());
                setQuery(query.trim());
                setOpen(false);
              }}
            >
              {addLabel?.replace('{value}', query.trim())}
            </button>
          )}
          {onSelect && otherLabel && (
            <button
              className="searchable-combobox-option other-option"
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(otherValue)}
            >
              {otherLabel}
            </button>
          )}
          {!filteredOptions.length && !onCustom && <span className="searchable-combobox-empty">{noResultsLabel}</span>}
          {!filteredOptions.length && onCustom && !query.trim() && <span className="searchable-combobox-empty">{noResultsLabel}</span>}
        </div>
      )}
    </div>
  );
}

const mergeOptionSets = (...groups) =>
  [...new Set(groups.flat().filter(Boolean))];

const describeRequirements = (request, t = (key, values) => translate(currentUiLanguage(), key, values)) => {
  const data = request?.requirements_data || {};
  const parts = [];

  if (data.selected?.length) {
    parts.push(...data.selected
      .filter((item) => item !== 'Has completed specific courses')
      .map((item) => {
        const key = `options.requirement.${String(item).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        const translated = t(key);
        return translated === key ? item : translated;
      }));
  }

  if (data.minimum_gpa) {
    parts.push(t('request.minimumGpaSummary', { value: data.minimum_gpa }));
  }

  if (data.portfolio_link_required) {
    parts.push(t('request.portfolioLinkRequested'));
  }

  if (data.required_tools?.length) {
    parts.push(t('request.toolsSummary', {
      tools: data.required_tools.map((item) => {
        const key = `options.skill.${String(item).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
        const translated = t(key);
        return translated === key ? item : translated;
      }).join(', '),
    }));
  }

  if (request?.requirements) {
    parts.push(request.requirements);
  }

  return parts.length ? parts.join(' | ') : t('common.notSpecified');
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
  if (!value) return translate(currentUiLanguage(), 'messages.none');
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return formatTime(value);
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return translate(currentUiLanguage(), 'ui.yesterday');
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
};

const PillList = ({ items }) => (
  <div className="pill-list">
    {items?.length ? items.map((item) => <span key={item}>{item}</span>) : <span>{translate(currentUiLanguage(), 'common.notSpecified')}</span>}
  </div>
);

const DemoBadge = () => <span className="demo-badge">DEMO</span>;

const PremiumBadge = ({ t = translate.bind(null, 'en') }) => (
  <span className="premium-badge">{t('premium.badge')}</span>
);

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

const connectionStateLabel = (state, t = translate.bind(null, 'en')) => {
  if (state === 'accepted') return t('connections.connectedStatus');
  if (state === 'sent_pending') return t('connections.requestSent');
  if (state === 'received_pending') return t('common.respondRequest');
  if (state === 'pending') return t('connections.pendingStatus');
  return '';
};

const connectionRelationshipLabel = (connection) =>
  connection?.relationship_type === 'teammate' ? 'Teammate' : 'Friend';

const localizedConnectionRelationshipLabel = (connection, t = translate.bind(null, 'en')) =>
  connection?.relationship_type === 'teammate' ? t('connections.teammate') : t('connections.friend');

const connectedButtonLabel = (connection, t = translate.bind(null, 'en')) =>
  connection?.status === 'accepted'
    ? `${t('connections.connectedStatus')} · ${localizedConnectionRelationshipLabel(connection, t)}`
    : t('connections.connectedStatus');

const discoverConnectedButtonLabel = (t = translate.bind(null, 'en')) =>
  t('connections.connectedStatus');

const connectionStatusLabel = (status, tab, t = translate.bind(null, 'en')) => {
  if (tab === 'received' && status === 'pending') return t('connections.needsResponse');
  if (tab === 'sent' && status === 'pending') return t('connections.pendingStatus');
  if (tab === 'connected' && status === 'accepted') return t('connections.acceptedStatus');
  if (tab === 'declined' && status === 'unmatched') return t('connections.connectionEnded');
  if (tab === 'declined') return t('connections.declinedStatus');
  return titleCase(status);
};

const ConnectionStateBadge = ({ state, t = translate.bind(null, 'en') }) => {
  const label = connectionStateLabel(state, t);
  if (!label) return null;
  return <span className={`status-badge ${state}`}>{state === 'accepted' ? '✓ ' : ''}{label}</span>;
};

const ConnectionRelationshipBadge = ({ connection, t = translate.bind(null, 'en') }) => {
  if (connection?.status !== 'accepted') return null;
  const relationship = localizedConnectionRelationshipLabel(connection, t);
  const tone = connection?.relationship_type === 'teammate' ? 'teammate' : 'friend';
  return <span className={`status-badge ${tone}`}>{relationship}</span>;
};

const PortfolioReference = ({ request, t = translate.bind(null, 'en') }) => {
  const fileUrl = getPortfolioReferenceUrl(request?.portfolio_reference_path);

  if (!request?.requires_portfolio && !fileUrl) {
    return null;
  }

  return (
    <>
      {request?.requires_portfolio && <div><dt>{t('ui.portfolio')}</dt><dd>{t('ui.portfolioRequired')}</dd></div>}
      {fileUrl && (
        <div>
          <dt>{t('ui.portfolioReference')}</dt>
          <dd>
            <a className="text-link" href={fileUrl} target="_blank" rel="noreferrer">
              {t('ui.viewFile')}
            </a>
            {request.portfolio_reference_name && <span className="file-name"> {request.portfolio_reference_name}</span>}
          </dd>
        </div>
      )}
    </>
  );
};

const CheckboxGrid = ({ options, selected, onToggle, columns = 'auto', labelFor = (option) => option }) => (
  <div className={`checkbox-grid ${columns}`}>
    {options.map((option) => (
      <label className={selected.includes(option) ? 'check-option selected' : 'check-option'} key={option}>
        <input
          type="checkbox"
          checked={selected.includes(option)}
          onChange={() => onToggle(option)}
        />
        <span>{labelFor(option)}</span>
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
          {[1, 2, 3].map((index) => {
            const message = t(`connect.suggestion${index}`);
            return (
            <button className="suggestion-chip" key={message} type="button" onClick={() => setIntroMessage(message)}>
              {message}
            </button>
            );
          })}
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

function UnmatchModal({ teammateName, saving, error, onClose, onConfirm, t = translate.bind(null, 'en') }) {
  const [step, setStep] = useState('confirm');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('ui.unmatchConfirmation')}>
        {step === 'confirm' ? (
          <>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{t('ui.unmatch')}</p>
                <h2>{t('ui.unmatchWith', { name: teammateName })}</h2>
              </div>
              <button className="ghost" onClick={onClose} type="button">{t('common.close')}</button>
            </div>
            <p className="note">{t('ui.unmatchQuestion')}</p>
            {error && <p className="error">{error}</p>}
            <div className="hero-actions">
              <button className="secondary" onClick={onClose} type="button">{t('common.cancel')}</button>
              <button className="primary" onClick={() => setStep('reason')} type="button">{t('common.continue')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{t('ui.unmatch')}</p>
                <h2>{t('ui.whyUnmatch')}</h2>
              </div>
              <button className="ghost" onClick={onClose} type="button">{t('common.close')}</button>
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
                    <span>{t(unmatchReasonKeys[item] || item)}</span>
                </label>
              ))}
            </div>
            {reason === 'Other' && (
              <label>
                {t('ui.tellMoreOptional')}
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows="3"
                />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <div className="hero-actions">
              <button className="secondary" onClick={onClose} type="button">{t('common.cancel')}</button>
              <button className="primary" onClick={() => onConfirm(reason, note)} disabled={saving || !reason}>
                {saving ? t('ui.unmatching') : t('ui.confirmUnmatch')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DemoSimulationPanel({ connection, accepting, onAccept, onStartChat, onViewConnection, onReset, t = translate.bind(null, 'en') }) {
  if (!connection) return null;

  if (connection.status === 'accepted') {
    return (
      <section className="demo-simulation success-simulation">
        <p className="eyebrow">{t('ui.demoSimulation')}</p>
        <h3>{t('ui.itsAMatch')}</h3>
        <p>{t('ui.demoConnected')}</p>
        <div className="hero-actions">
          <button className="primary" onClick={onStartChat}>{t('ui.startChat')}</button>
          {onViewConnection && <button className="secondary" onClick={onViewConnection}>{t('ui.viewConnection')}</button>}
          {onReset && <button className="secondary" onClick={onReset}>{t('ui.resetDemo')}</button>}
        </div>
      </section>
    );
  }

  if (connection.status === 'pending') {
    return (
      <section className="demo-simulation">
        <p className="eyebrow">{t('ui.demoSimulation')}</p>
        <h3>{t('ui.simulateAcceptance')}</h3>
        <p>{t('ui.demoAcceptanceHelp')}</p>
        <button className="primary" onClick={onAccept} disabled={accepting}>
          {accepting ? t('ui.simulating') : t('ui.simulateAcceptance')}
        </button>
      </section>
    );
  }

  return null;
}

const optionTranslationKey = (prefix, option = '') =>
  `${prefix}.${String(option).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const localizedOption = (option, prefix, t = translate.bind(null, 'en')) => {
  const key = optionTranslationKey(prefix, option);
  const label = t(key);
  return label === key ? option : label;
};

const StepRail = ({ step, t = translate.bind(null, 'en') }) => {
  const steps = [
    t('steps.profile'),
    t('steps.request'),
    t('steps.matches'),
    t('steps.connect'),
  ];

  return (
    <div className="step-rail" aria-label={t('steps.flow')}>
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
  const landingRef = useRef(null);
  const roleCards = [
    {
      value: 'student',
      title: t('home.studentTitle'),
      icon: GraduationCap,
      accent: 'student',
    },
    {
      value: 'lecturer',
      title: t('home.lecturerTitle'),
      icon: UserRound,
      accent: 'lecturer',
    },
  ];
  const featureItems = [
    { label: t('home.featureClassmates'), icon: UsersRound, accent: 'blue' },
    { label: t('home.featureTeams'), icon: FileText, accent: 'navy' },
    { label: t('home.featureOpportunities'), icon: Trophy, accent: 'pink' },
    { label: t('home.featureTogether'), icon: Zap, accent: 'red' },
  ];
  const email = getAuthSessionEmail(authSession);

  useEffect(() => {
    const root = landingRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    if (reducedMotion || coarsePointer) return undefined;

    let animationFrame = 0;
    let targetX = 50;
    let targetY = 42;
    let currentX = targetX;
    let currentY = targetY;

    const animateCursorGlow = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      root.style.setProperty('--landing-cursor-x', `${currentX}%`);
      root.style.setProperty('--landing-cursor-y', `${currentY}%`);

      if (Math.abs(targetX - currentX) > 0.04 || Math.abs(targetY - currentY) > 0.04) {
        animationFrame = window.requestAnimationFrame(animateCursorGlow);
      } else {
        animationFrame = 0;
      }
    };

    const moveCursorGlow = (event) => {
      const rect = root.getBoundingClientRect();
      targetX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      targetY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      root.classList.add('cursor-glow-active');
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(animateCursorGlow);
      }
    };

    const hideCursorGlow = () => {
      root.classList.remove('cursor-glow-active');
    };

    root.addEventListener('pointermove', moveCursorGlow, { passive: true });
    root.addEventListener('pointerleave', hideCursorGlow);

    return () => {
      root.removeEventListener('pointermove', moveCursorGlow);
      root.removeEventListener('pointerleave', hideCursorGlow);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className="home-grid landing-home" ref={landingRef}>
      <div className="landing-background" aria-hidden="true">
        <div className="landing-aurora" />
        <div className="landing-glow landing-glow-blue" />
        <div className="landing-glow landing-glow-red" />
        <div className="landing-cursor-glow" />
      </div>
      <section className="intro landing-hero">
        <p className="eyebrow landing-eyebrow">{t('home.eyebrow')}</p>
        <h1 className="landing-wordmark" aria-label={t('home.titleA')}>
          <span className="brand-blue">TEAM</span><span className="brand-red">ERGENCY</span>
        </h1>
        <p className="hero-tagline landing-tagline">{t('home.titleB')}</p>

        <div className="landing-role-grid" aria-label={t('home.chooseRole')}>
          {roleCards.map((role) => {
            const Icon = role.icon;
            const isSelected = activeRole === role.value;
            return (
              <button
                className={`landing-role-card ${role.accent}-role ${isSelected ? 'selected' : ''}`}
                key={role.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectRole(role.value)}
              >
                <span className="landing-role-icon">
                  <Icon size={30} />
                </span>
                <span className="landing-role-copy">
                  <strong>{role.title}</strong>
                </span>
                {isSelected && <em>{t('home.roleSelected')}</em>}
              </button>
            );
          })}
        </div>

        <section className="landing-auth-card" aria-label={t('profile.googleContinue')}>
          <button
            className="primary google-button landing-google-button"
            type="button"
            onClick={() => onGoogleSignIn(activeRole)}
            disabled={!activeRole || !hasSupabaseConfig || googleSigningIn}
          >
            <UserRound size={18} />
            {googleSigningIn ? t('profile.googleSaving') : t('profile.googleContinue')}
          </button>
          {activeRole && (
            <button className="secondary landing-demo-link" type="button" onClick={() => onStartProfile(activeRole)}>
              {t('home.continueDemo')}
              <ArrowRight size={16} />
            </button>
          )}
          {(email || activeRole) && (
            <p className="note">
              {email
                ? `${t('profile.googleSignedIn')} · ${email}`
                : `${t('home.selectedRole')}: ${activeRole === 'lecturer' ? t('profile.lecturer') : t('profile.student')}`}
            </p>
          )}
          {!hasSupabaseConfig && <p className="field-helper">{t('profile.googleUnavailable')}</p>}
        </section>

        <div className="landing-feature-row" aria-label={t('home.featuresAria')}>
          {featureItems.map((item) => {
            const Icon = item.icon;
            return (
              <div className={`landing-feature ${item.accent}`} key={item.label}>
                <span>
                  <Icon size={20} />
                </span>
                <strong>{item.label}</strong>
              </div>
            );
          })}
        </div>
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
      if (hiddenLegacyDemoClassCodes.includes(normalizedCode)) {
        setError(t('join.invalidCode'));
        return;
      }
	    setLoading(true);
	    try {
        await getProfileById(profileId, { claimLegacy: true, ownedOnly: true });
	      let foundClass = null;
	      if (demoClassCodes.includes(normalizedCode)) {
	        try {
	          foundClass = await getDemoClassForProfile(profileId, normalizedCode);
	        } catch (demoError) {
	          if (isProfileOwnershipError(demoError)) {
	            throw demoError;
	          }
	          console.error('Demo class preview lookup failed, trying generic lookup fallback', demoError);
	        }
	      }

	      if (!foundClass) {
	        foundClass = await getClassByJoinCode(normalizedCode);
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
	        setError(t('join.invalidCode'));
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
      await getProfileById(profileId, { claimLegacy: true, ownedOnly: true });
      let membership;

      if (preview.is_demo) {
        membership = await joinDemoClassByCode({
          profileId,
          classCode: preview.class_code || preview.demo_class_code || joinCode.trim(),
          networkStatus,
        });
      } else {
        try {
          membership = await joinClassById({
            profileId,
            classItem: preview,
            networkStatus,
          });
        } catch (directJoinError) {
          console.error('Direct class join failed, trying code-based join fallback', directJoinError);
          membership = await joinClassByCode({
              profileId,
              joinCode: preview.join_code || preview.class_code || joinCode.trim(),
              networkStatus,
            });
        }
      }

      const joinedClassId = membership.class_id || preview.id;
      storeClassId(joinedClassId);
      setMessage(t('join.joined', { className: getClassDisplay(membership.class_data || preview) }));
      onJoined?.(joinedClassId);
    } catch (err) {
      console.error('Join class failed', err);
      setError(
        isProfileOwnershipError(err)
          ? t('join.profileOwnership')
          : getFriendlyError(err, t('join.joinFail'), { demoClassJoin: Boolean(preview?.is_demo) }),
      );
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
            error: getFriendlyError(err, t('classes.loadFail')),
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
	            const metrics = requestMetrics || editableStatus?.metrics;
	            const status = requestMetrics
              ? classTeamStatus(classItem, request, requestMetrics, t)
              : editableStatus || classTeamStatus(classItem, request, requestMetrics, t);

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
	                  <span>{metrics ? `${teammateCountSummary(metrics, t)} | ${remainingSummary(metrics, t)}` : translateStatusText(status.detail, t)}</span>
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
    <section className="request-panel standalone class-team-editor">
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
            error: getFriendlyError(err, t('class.loadFail')),
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
	  const metrics = requestMetrics || editableStatus?.metrics;
	  const status = requestMetrics
    ? classTeamStatus(state.classItem, selectedRequest, requestMetrics, t)
    : editableStatus || classTeamStatus(state.classItem, selectedRequest, requestMetrics, t);
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
    <main className="screen class-detail-page">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
	        {t('classes.title')}
      </button>

      <div className="results-header class-detail-header">
        <div>
	          <p className="eyebrow">{t('class.detail')}</p>
          <h2>{getClassDisplay(state.classItem)}</h2>
          <p>{state.classItem.university} | {schoolLabel(state.classItem.school)} | {state.classItem.major}</p>
        </div>
      </div>

      <section className="class-dashboard">
      <div className="request-management-grid class-dashboard-side">
        <section className="request-panel standalone class-info-panel">
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

        <section className="request-panel standalone class-team-panel">
	          <p className="eyebrow">{t('class.teamStatus')}</p>
	          <span className={`status-badge ${status.tone}`}>{translateStatusText(status.label, t)}</span>
	          {metrics ? (
	            <>
	              <div className="progress-header">
	                <strong>{teammateCountSummary(metrics, t)}</strong>
		                <span>{metrics.complete ? t('class.complete') : `${metrics.remaining} ${t('class.missing')}`}</span>
              </div>
              <div className="progress-track" aria-label={t('ui.classFormationProgress')}>
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
              className={activeRequest ? 'secondary' : 'primary'}
              type="button"
              onClick={() => {
                if (activeRequest) {
                  setState((current) => ({ ...current, editingRequest: activeRequest, actionError: '', actionSuccess: '' }));
                } else {
                  onFindTeammates(state.classItem, state.teamStatus);
                }
              }}
            >
              <Pencil size={18} />
              {activeRequest ? t('request.editClass') : t('class.createRequest')}
            </button>
            <button
              className="primary"
              type="button"
              disabled={!activeRequest || classClosed}
              onClick={() => activeRequest && onViewMatches(activeRequest.id)}
            >
              {t('class.findTeammates')}
            </button>
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
        <section className="request-panel standalone class-request-panel">
          <div className="results-header compact-header">
            <div>
	              <p className="eyebrow">{t('class.currentRequest')}</p>
            </div>
            {activeRequest && (
              <div className="hero-actions">
                <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, deleteRequestTarget: activeRequest, actionError: '', actionSuccess: '' }))}>
                  <Trash2 size={18} />
                  {t('request.deleteClass')}
                </button>
              </div>
            )}
          </div>
          <dl>
            <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(selectedRequest.skills_needed)}</dd></div>
            <div><dt>{t('request.teamSize')}</dt><dd>{getTotalTeamSize(selectedRequest)}</dd></div>
            <div><dt>{t('opportunities.progress')}</dt><dd>{teammateCountSummary(requestMetrics, t)} · {remainingSummary(requestMetrics, t)}</dd></div>
            <div><dt>{t('opportunities.initiallyLooking')}</dt><dd>{getInitialNeeded(selectedRequest)}</dd></div>
            <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(selectedRequest))}</dd></div>
            <div><dt>{t('matches.teamStatus')}</dt><dd>{requestStatusLabel(selectedRequest.status, t)}</dd></div>
            <div><dt>{t('request.anythingElse')}</dt><dd>{selectedRequest.requirements || t('common.notSpecified')}</dd></div>
          </dl>

          <section className="matched-list class-team-members-list">
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
	      </section>

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
            setError(getFriendlyError(err, t('lecturer.loadFail')));
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
      setActionMessage(t('lecturer.classCreated', { code: created.join_code || created.lecturer_access_code }));
    } catch (err) {
      setActionError(getFriendlyError(err, t('lecturer.createFail')));
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
        message: t('lecturer.reminderMessage', { course: selectedClass.course_name }),
      });
      setActionMessage(t('lecturer.reminderSent', { name: displayName(student.full_name) }));
    } catch (err) {
      setActionError(getFriendlyError(err, t('lecturer.reminderFail')));
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
        message: t('lecturer.studentMessage', { course: selectedClass.course_name }),
      });
      onOpenChat(thread.id);
    } catch (err) {
      setActionError(getFriendlyError(err, t('lecturer.messageFail')));
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
      setActionError(getFriendlyError(err, t('lecturer.closeFail')));
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
      setActionMessage(t('lecturer.proposalConfirmed'));
    } catch (err) {
      setActionError(getFriendlyError(err, t('lecturer.confirmFail')));
    } finally {
      setConfirmingTeams(false);
    }
  };

  return (
    <main className="screen">
	      <div className="results-header">
	        <div>
		          <p className="eyebrow">{t('lecturer.dashboard')}</p>
	          <h2>{t('lecturer.demoClassesFor', { name: lecturerSession.lecturerName })}</h2>
	          <p>{lecturerSession.university} · {t('lecturer.demoId', { id: lecturerSession.lecturerId })}</p>
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
		              {t('lecturer.courseName')}
	              <input value={classForm.course_name} onChange={(event) => updateClassForm('course_name', event.target.value)} required />
	            </label>
	            <label>
	              {t('lecturer.courseCode')}
	              <input value={classForm.course_code} onChange={(event) => updateClassForm('course_code', event.target.value.toUpperCase())} required />
	            </label>
	            <label>
	              {t('lecturer.academicFieldMajor')}
	              <select value={classForm.major} onChange={(event) => updateClassForm('major', event.target.value)} required>
	                {Object.values(majorsBySchool).flat().map((major) => (
	                  <option value={major} key={major}>{major}</option>
	                ))}
	              </select>
	            </label>
	            <label>
	              {t('lecturer.session')}
	              <input value={classForm.session_code} onChange={(event) => updateClassForm('session_code', event.target.value)} placeholder="01" required />
	            </label>
	            <label>
	              {t('lecturer.approxStudents')}
	              <input min="0" type="number" value={classForm.approximate_student_count} onChange={(event) => updateClassForm('approximate_student_count', event.target.value)} required />
	            </label>
	            <label>
	              {t('lecturer.requiredMembersPerTeam')}
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
                  <p className="note">{t('lecturer.classCode', { code: classItem.class_code })}</p>
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
	                <span>{selectedClass.formation_rate ?? selectedClass.team_formation_rate ?? 0}% {t('lecturer.formed')}</span>
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

function ProfileForm({ initialRole = 'student', initialData = {}, onSaved, academicValues = emptyAcademicValues, t = translate.bind(null, 'en') }) {
  const initialDataSignature = JSON.stringify(initialData || {});
  const [form, setForm] = useState(() => createProfileFormState(initialRole, initialData));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isLecturer = form.role === 'lecturer';
  const resolvedUniversity = resolveProfileUniversity(form);
  const usesOtherUniversity = isOtherUniversityForm(form);
  const isRequiredField = (field) => isProfileFieldRequired(form, field);
  const profileSkillOptions = mergeOptionSets(
    getProfileSkillSuggestions({ major: form.major, school: form.school }),
    form.skills,
  );
  const profileUniversityComboOptions = mergeAcademicOptions(universityOptions, academicValues.universities);
  const profileSchoolOptions = getSchoolsForUniversity(resolvedUniversity);
  const profileSchoolComboOptions = mergeAcademicOptions(profileSchoolOptions, academicValues.schools).map((school) => ({
    value: school.value,
    label: localizedOption(school.value, 'options.school', t),
  }));
  const profileMajorValues = mergeOptionSets(
    ...Object.values(majorsBySchool),
    form.major === OTHER_OPTION_VALUE ? '' : form.major,
    ...academicValues.majors,
  );
  const profileMajorComboOptions = profileMajorValues.map((major) => ({
    value: major,
    label: localizedOption(major, 'options.major', t),
  }));
  const profileSubjectComboOptions = mergeAcademicOptions(
    opportunityFields.filter((field) => field !== 'Other'),
    academicValues.subjects.filter((field) => field !== 'Other'),
  ).map((field) => ({
    value: field.value,
    label: localizedOption(field.value, 'options.field', t),
  }));

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
      custom_school: value === OTHER_OPTION_VALUE ? current.custom_school : '',
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
    }));
    setFieldErrors((current) => ({ ...current, school: '', major: '', skills: '' }));
  };

  const updateCustomSchool = (value) => {
    setForm((current) => ({ ...current, school: OTHER_OPTION_VALUE, custom_school: value }));
    setFieldErrors((current) => ({ ...current, school: '' }));
  };

  const updateSubject = (value) => {
    setForm((current) => ({
      ...current,
      academic_field: value,
      custom_subject: value === OTHER_OPTION_VALUE ? current.custom_subject : '',
    }));
    setFieldErrors((current) => ({ ...current, academic_field: '' }));
  };

  const updateMajor = (value) => {
    setForm((current) => ({
      ...current,
      major: value,
      custom_major: value === OTHER_OPTION_VALUE ? current.custom_major : '',
    }));
    setFieldErrors((current) => ({ ...current, major: '' }));
  };

  const updateCustomMajor = (value) => {
    setForm((current) => ({ ...current, major: OTHER_OPTION_VALUE, custom_major: value }));
    setFieldErrors((current) => ({ ...current, major: '' }));
  };

  const updateCustomSubject = (value) => {
    setForm((current) => ({ ...current, academic_field: OTHER_OPTION_VALUE, custom_subject: value }));
    setFieldErrors((current) => ({ ...current, academic_field: '' }));
  };

  const updateUniversityChoice = (value) => {
    setForm((current) => ({
      ...current,
      university_choice: value,
      custom_university: value === OTHER_UNIVERSITY_VALUE ? current.custom_university : '',
      university: value === OTHER_UNIVERSITY_VALUE ? current.custom_university : value,
      school: isRmitUniversity(value) ? current.school : '',
      major: isRmitUniversity(value) ? current.major : '',
    }));
    setFieldErrors((current) => ({ ...current, university: '', school: '', major: '' }));
  };

  const updateCustomUniversity = (value) => {
    setForm((current) => ({
      ...current,
      university_choice: OTHER_UNIVERSITY_VALUE,
      custom_university: value,
      university: value,
    }));
    setFieldErrors((current) => ({ ...current, university: '' }));
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
        university: resolvedUniversity || 'RMIT University',
        school: getFormSchoolValue(form),
        major: isLecturer ? 'Lecturer' : getFormMajorValue(form),
        skills: isLecturer ? ['Teaching'] : skills,
        avatar_url: form.avatar_url || null,
        availability: [],
        preferred_active_time: null,
        work_styles: isLecturer ? [] : form.work_styles,
	        contact_type: isLecturer ? 'email' : form.contact_type,
	        contact_value: isLecturer ? form.lecturer_contact_detail.trim() : form.contact_value.trim() || null,
        short_bio: isLecturer
          ? form.short_bio.trim() || t('profile.lecturerBioDefault')
          : form.short_bio.trim(),
        is_available: !isLecturer,
        consent_public_visibility: true,
	        role,
	        lecturer_title: isLecturer ? form.lecturer_title.trim() || null : null,
	        lecturer_id: isLecturer ? form.lecturer_id.trim() : null,
        academic_field: isLecturer ? getFormSubjectValue(form) : getFormMajorValue(form),
	        lecturer_contact_method: isLecturer ? form.lecturer_contact_method : null,
	        lecturer_contact_detail: isLecturer ? form.lecturer_contact_detail.trim() : null,
	        student_id: isLecturer ? null : form.student_id || null,
        subscription_status: form.subscription_status || 'free',
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
      const profileEventName = form.id && profile.id === form.id ? 'profile_updated' : 'profile_created';
      void trackProductEvent(profileEventName, {
        profileId: profile.id,
        entityType: 'profile',
        entityId: profile.id,
        metadata: { role },
        dedupeKey: profileEventName === 'profile_created' ? `profile_created:${profile.id}` : null,
      });
      storeProfileId(profile.id);
      onSaved(profile);
    } catch (err) {
      setError(getFriendlyError(err, t('profile.saveFail')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="screen">
      <StepRail step={0} t={t} />
      <form className="form-shell" onSubmit={submit}>
        <div className="form-heading">
          <UserRound size={28} />
          <div>
	            <p className="eyebrow">{t('profile.createUserProfile')}</p>
	            <h2>{t('profile.completeTitle')}</h2>
              <p className="note">{isLecturer ? t('profile.lecturerProfileHint') : t('profile.studentProfileHint')}</p>
              <p className="signed-in-line">{t('profile.role')}: {isLecturer ? t('profile.lecturer') : t('profile.student')}</p>
              <p className="required-note">{t('profile.requiredNote')}</p>
          </div>
        </div>

        <div className="form-grid">
          <label>
	            <FieldLabel required={isRequiredField('full_name')}>{t('profile.fullName')}</FieldLabel>
            <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
            <FieldError message={fieldErrors.full_name} />
          </label>
          <label>
	            <FieldLabel required={isRequiredField('university')}>{t('profile.university')}</FieldLabel>
            <SearchableCombobox
              value={form.university_choice}
              options={profileUniversityComboOptions.map((university) => ({
                value: university.value,
                label: localizedOption(university.value, 'options.university', t),
              }))}
              onSelect={updateUniversityChoice}
              onCustom={updateCustomUniversity}
              placeholder={t('profile.searchUniversity')}
              otherLabel={t('profile.otherUniversity')}
              addLabel={t('profile.addValue')}
              noResultsLabel={t('profile.noResults')}
              otherValue={OTHER_UNIVERSITY_VALUE}
              t={t}
            />
            <FieldError message={fieldErrors.university} />
          </label>
          {usesOtherUniversity && (
            <label>
              <FieldLabel required={isRequiredField('custom_university')}>{t('profile.universityName')}</FieldLabel>
              <input
                value={form.custom_university}
                onChange={(event) => updateCustomUniversity(event.target.value)}
                placeholder={t('profile.universityNamePlaceholder')}
                required
              />
              <FieldError message={fieldErrors.university} />
            </label>
          )}
          {(isLecturer || !usesOtherUniversity) && (
          <label>
	            <FieldLabel required={isRequiredField('school')}>{isLecturer ? t('profile.department') : t('profile.school')}</FieldLabel>
            <SearchableCombobox
              value={form.school}
              options={profileSchoolComboOptions}
              onSelect={updateSchool}
              placeholder={t('profile.searchSchool')}
              otherLabel={t('profile.other')}
              addLabel={t('profile.addValue')}
              noResultsLabel={t('profile.noResults')}
              t={t}
            />
            {form.school === OTHER_OPTION_VALUE && (
              <input
                value={form.custom_school}
                onChange={(event) => updateCustomSchool(event.target.value)}
                placeholder={t('profile.enterSchool')}
                required
              />
            )}
            <FieldError message={fieldErrors.school} />
          </label>
          )}
	          {isLecturer ? (
	            <>
	              <label>
	                <FieldLabel>{t('profile.lecturerTitle')}</FieldLabel>
	                <input
	                  value={form.lecturer_title}
	                  onChange={(event) => updateField('lecturer_title', event.target.value)}
	                  placeholder={t('profile.lecturerTitlePlaceholder')}
	                />
	              </label>
	              <label>
	                <FieldLabel required={isRequiredField('academic_field')}>{t('profile.subject')}</FieldLabel>
	                <SearchableCombobox
                  value={form.academic_field}
                  options={profileSubjectComboOptions}
                  onSelect={updateSubject}
                  placeholder={t('profile.searchSubject')}
                  otherLabel={t('profile.other')}
                  addLabel={t('profile.addValue')}
                  noResultsLabel={t('profile.noResults')}
                  t={t}
                />
                {form.academic_field === OTHER_OPTION_VALUE && (
                  <input
                    value={form.custom_subject}
                    onChange={(event) => updateCustomSubject(event.target.value)}
                    placeholder={t('profile.enterSubject')}
                    required
                  />
                )}
                    <FieldError message={fieldErrors.academic_field} />
	              </label>
	              <label>
	                <FieldLabel required={isRequiredField('lecturer_id')}>{t('profile.lecturerId')}</FieldLabel>
	                <input
	                  value={form.lecturer_id}
	                  onChange={(event) => updateField('lecturer_id', event.target.value)}
	                  placeholder={t('profile.lecturerIdPlaceholder')}
	                  required
	                />
	                <span className="field-helper">{t('profile.demoLecturerIds')}: {demoLecturerHelperText}</span>
                    <FieldError message={fieldErrors.lecturer_id} />
	              </label>
	              <label>
	                <FieldLabel required={isRequiredField('lecturer_contact_method')}>{t('profile.preferredContact')}</FieldLabel>
	                <select
	                  value={form.lecturer_contact_method}
	                  onChange={(event) => updateField('lecturer_contact_method', event.target.value)}
	                  required
	                >
	                  {lecturerContactMethods.map((method) => (
	                    <option value={method} key={method}>{localizedOption(method, 'options.lecturerContact', t)}</option>
	                  ))}
	                </select>
	              </label>
	              <label className="wide">
	                <FieldLabel required={isRequiredField('lecturer_contact_detail')}>{t('profile.contactDetail')}</FieldLabel>
	                <input
	                  value={form.lecturer_contact_detail}
	                  onChange={(event) => updateField('lecturer_contact_detail', event.target.value)}
	                  placeholder={t('profile.lecturerContactPlaceholder')}
	                  required
	                />
                    <FieldError message={fieldErrors.lecturer_contact_detail} />
	              </label>
	            </>
	          ) : (
	            <>
	              <label>
	                <FieldLabel required={isRequiredField('major')}>{t('profile.major')}</FieldLabel>
                <SearchableCombobox
                  value={form.major}
                  options={profileMajorComboOptions}
                  onSelect={updateMajor}
                  onCustom={updateCustomMajor}
                  placeholder={t('profile.searchMajor')}
                  otherLabel={t('profile.other')}
                  addLabel={t('profile.addValue')}
                  noResultsLabel={t('profile.noResults')}
                  t={t}
                />
                {form.major === OTHER_OPTION_VALUE && (
                  <input
                    value={form.custom_major}
                    onChange={(event) => updateCustomMajor(event.target.value)}
                    placeholder={t('profile.enterMajor')}
                    required
                  />
                )}
                    <FieldError message={fieldErrors.major} />
	              </label>
	              <label>
	                <FieldLabel required={isRequiredField('student_id')}>{t('profile.studentId')}</FieldLabel>
	                <input
	                  value={form.student_id}
	                  onChange={(event) => updateField('student_id', event.target.value)}
	                  placeholder={t('profile.studentIdPlaceholder')}
                    required
	                />
                    <FieldError message={fieldErrors.student_id} />
	              </label>
	              <fieldset className="wide">
                <legend><FieldLabel required={isRequiredField('skills')}>{t('profile.skills')}</FieldLabel></legend>
	                <p className="field-helper">{t('profile.skillHelper')}</p>
                    <FieldError message={fieldErrors.skills} />
                <CheckboxGrid
                  options={profileSkillOptions}
                  selected={form.skills}
                  onToggle={toggleProfileSkill}
                  labelFor={(option) => localizedOption(option, 'options.skill', t)}
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
                    labelFor={(option) => localizedOption(option, 'options.workStyle', t)}
                  />
                </fieldset>
            </>
          )}
          {!isLecturer && (
            <label>
              {t('premium.subscription')}
              <select value={form.subscription_status} onChange={(event) => updateField('subscription_status', event.target.value)}>
                <option value="free">{t('premium.free')}</option>
                <option value="premium">{t('premium.premium')}</option>
              </select>
              <span className="field-helper">{t('premium.demoHelper')}</span>
            </label>
          )}
	          {!isLecturer && (
	            <>
	              <label>
	                <FieldLabel>{t('profile.contactMethod')}</FieldLabel>
	                <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
	                  {contactTypes.map((type) => (
	                    <option value={type} key={type}>{localizedOption(type, 'options.contact', t)}</option>
	                  ))}
	                </select>
	              </label>
	              <label>
	                <FieldLabel required={isRequiredField('contact_value')}>{t('profile.contactInfo')}</FieldLabel>
	                <input
	                  value={form.contact_value}
	                  onChange={(event) => updateField('contact_value', event.target.value)}
	                  placeholder={t('profile.contactPlaceholder')}
	                  required
	                />
                    <FieldError message={fieldErrors.contact_value} />
	              </label>
	            </>
	          )}
          <label className="wide">
	            <FieldLabel required={isRequiredField('short_bio')}>{isLecturer ? t('profile.bioNote') : t('profile.shortBio')}</FieldLabel>
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
	            <FieldLabel required={isRequiredField('consent_public_visibility')}>{t('profile.consent')}</FieldLabel>
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
      <StepRail step={1} t={t} />
      <section className="confirmation">
        <CheckCircle2 size={42} />
	        <p className="eyebrow">{t('profile.saved')}</p>
        <h2>{displayName(profile?.full_name) || t('profile.yourProfile')} {t('profile.ready')}</h2>
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
    const fileError = validatePortfolioFile(file, t);
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

    const portfolioFileError = validatePortfolioFile(form.portfolio_file, t);
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
        void trackProductEvent('request_created', {
          profileId: profile.id,
          entityType: 'team_request',
          entityId: createdRequest.id,
          metadata: {
            request_scope: payload.request_scope,
            class_id: payload.class_id,
            total_team_size: payload.total_team_size,
            teammates_needed_initial: payload.teammates_needed_initial,
          },
          dedupeKey: `request_created:${createdRequest.id}`,
        });
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
      <StepRail step={1} t={t} />
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
          <span>{formatSchoolMajorLine(profile.school, profile.major)}</span>
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
		                      <option value={type} key={type}>{localizedOption(type, 'options.opportunity', t)}</option>
		                    ))}
		                  </select>
		                </label>
		                <label>
		                  {t('request.field')}
		                  <select value={form.opportunity_field} onChange={(event) => updateOpportunityField(event.target.value)} required>
		                    <option value="">{t('request.selectField')}</option>
		                    {opportunityFields.map((field) => (
		                      <option value={field} key={field}>{localizedOption(field, 'options.field', t)}</option>
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
              labelFor={(option) => localizedOption(option, 'options.skill', t)}
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
              labelFor={(option) => localizedOption(option, 'options.workStyle', t)}
            />
          </fieldset>
          <fieldset className="wide">
            <legend>{t('request.requirementsTitle')}</legend>
            <p className="field-helper">{t('request.requirementsHelper')}</p>
            <CheckboxGrid
              options={requirementOptions}
              selected={form.requirements_selected}
              onToggle={toggleRequirement}
              labelFor={(option) => localizedOption(option, 'options.requirement', t)}
            />
            {form.requirements_selected.includes('Minimum GPA') && (
              <label>
                {localizedOption('Minimum GPA', 'options.requirement', t)}
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
                  labelFor={(option) => localizedOption(option, 'options.skill', t)}
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
  const liveMetrics = getRequestStatusMetrics(request);
  const teamStatusText = teamStatus.status_label
    || (liveMetrics.remaining > 0
      ? `${t('matches.lookingFor')} ${liveMetrics.remaining} ${liveMetrics.remaining === 1 ? t('matches.spot') : t('matches.spots')}`
      : t('matches.teamNotSpecified'));
  const canConnect = connectionState === 'none' && !connecting;

  return (
    <article className={isPremiumProfile(request.profile) || isRequestPinned(request) ? 'match-card premium-card' : 'match-card'}>
      <div className="score">
        <Sparkles size={18} />
        {t('matches.matchPercent', { score: request.matchScore })}
      </div>
      {request.ruleBasedScore !== undefined && request.ruleBasedScore !== request.matchScore && (
        <p className="note">{t('matches.standardScore')}: {request.ruleBasedScore}%</p>
      )}
      <h3>{displayName(request.profile.full_name)} {request.profile.is_demo && <DemoBadge />} {isPremiumProfile(request.profile) && <PremiumBadge t={t} />}</h3>
      <p>{formatProfileAcademicLine(request.profile)}</p>
      <p className="note">{reviewSummaryLabel(request.profile, null, t)}</p>
      <div className="match-meta">
        <span>{getCourseDisplay(request)}</span>
        <span>{getLocalizedSessionDisplay(request, t)}</span>
        <span>{teammateCountSummary(liveMetrics, t)}</span>
        <span>{remainingSummary(liveMetrics, t)}</span>
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
      <ConnectionStateBadge state={connectionState} t={t} />
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
  const matchesViewedTrackedRef = useRef(new Set());

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
        const activeRequests = sortRequestsByVisibility(requests.filter((request) => request.status === 'looking'));
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
            error: t('matches.activeLoadFail'),
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

  useEffect(() => {
    const currentRequest = state.data?.currentRequest;
    if (!currentProfileId || !currentRequest?.id) return;

    const trackingKey = `${currentProfileId}:${currentRequest.id}`;
    if (matchesViewedTrackedRef.current.has(trackingKey)) return;
    matchesViewedTrackedRef.current.add(trackingKey);

    const aiMatchCount = (state.data.matches || []).filter((match) => match.aiFallbackUsed === false).length;
    void trackProductEvent('matches_viewed', {
      profileId: currentProfileId,
      entityType: 'team_request',
      entityId: currentRequest.id,
      metadata: {
        match_count: state.data.matches?.length || 0,
        ai_match_count: aiMatchCount,
        request_scope: currentRequest.request_scope || (currentRequest.class_id ? 'class' : 'open_opportunity'),
      },
      dedupeKey: `matches_viewed:${trackingKey}`,
    });

    if (aiMatchCount > 0) {
      void trackProductEvent('ai_matching_used', {
        profileId: currentProfileId,
        entityType: 'team_request',
        entityId: currentRequest.id,
        metadata: {
          ai_match_count: aiMatchCount,
          match_count: state.data.matches?.length || 0,
        },
        dedupeKey: `ai_matching_used:${trackingKey}`,
      });
    }
  }, [currentProfileId, state.data?.currentRequest?.id]);

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

  const viewMatchProfile = (candidateRequestId, score) => {
    const candidate = visibleMatches.find((match) => match.id === candidateRequestId);
    if (candidate?.profile_id) {
      void trackProductEvent('match_profile_viewed', {
        profileId: currentProfileId,
        entityType: 'profile',
        entityId: candidate.profile_id,
        metadata: {
          candidate_request_id: candidate.id,
          current_request_id: currentRequest.id,
          match_score: score,
        },
        dedupeKey: `match_profile_viewed:${currentProfileId}:${currentRequest.id}:${candidate.profile_id}`,
      });
    }
    onViewProfile(candidateRequestId, score);
  };

  const sendMatchConnect = async (request) => {
    if (!currentProfileId || !currentRequest?.id) return;

    setState((current) => ({
      ...current,
      connectError: '',
      sendingProfileId: request.profile_id,
    }));

    try {
      let connection = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: request.profile_id,
        senderTeamRequestId: currentRequest.id,
        introMessage: t('connect.matchIntro', { name: displayName(request.profile?.full_name) }),
      });
      void trackProductEvent('connection_requested', {
        profileId: currentProfileId,
        entityType: 'connection',
        entityId: connection.id,
        metadata: {
          receiver_profile_id: request.profile_id,
          sender_team_request_id: currentRequest.id,
          source: 'matches',
        },
        dedupeKey: connection.id ? `connection_requested:${connection.id}` : null,
      });
      if (currentRequest.class_id && request.profile?.is_demo) {
        connection = await simulateDemoAcceptance(connection.id, currentProfileId);
      }
      let updatedProgress = await getTeamRequestProgress(currentRequest.id, currentProfileId)
        .catch(() => state.progressById[currentRequest.id] || { found_count: 0, teammates: [] });
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        progressById: {
          ...current.progressById,
          [currentRequest.id]: updatedProgress,
        },
        connectionsByProfile: {
          ...current.connectionsByProfile,
          [request.profile_id]: {
            ...connection,
            sender_profile_id: currentProfileId,
            receiver_profile_id: request.profile_id,
          },
        },
      }));
    } catch (err) {
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        connectError: getFriendlyError(err, t('connections.sendFail')),
      }));
    }
  };

  const isClassRequest = Boolean(currentRequest.class_id);

  return (
    <main className="screen results">
      <StepRail step={2} t={t} />
      <div className="results-header">
        <div>
	          <p className="eyebrow">{isClassRequest ? t('matches.recommended') : t('matches.results')}</p>
	          <h2>{isClassRequest ? t('matches.best') : t('matches.byRequest')}</h2>
        </div>
        <button className="secondary" onClick={() => onViewCurrent(currentRequest)}>
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
              onView={viewMatchProfile}
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
  const discoveryOpenTrackedRef = useRef(false);

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

  useEffect(() => {
    if (discoveryOpenTrackedRef.current) return;
    discoveryOpenTrackedRef.current = true;
    void trackProductEvent('discovery_opened', {
      profileId: currentProfileId,
      metadata: { source: 'discover' },
      dedupeKey: currentProfileId ? `discovery_opened:${currentProfileId}` : null,
    });
  }, [currentProfileId]);

  const requestsByProfile = state.activeRequests.reduce((map, request) => {
    map[request.profile_id] = [...(map[request.profile_id] || []), request];
    return map;
  }, {});
  const discoverCourseOptions = (filters.school
    ? getCoursesForSchool(filters.school)
    : getAllCourses()
  ).filter((course, index, list) => list.findIndex((item) => item.code === course.code) === index);
  const discoverUniversityOptions = mergeAcademicOptions(
    universityOptions,
    state.profiles.map((profile) => profile.university),
  );
  const discoverSchoolOptions = mergeAcademicOptions(
    schoolOptions,
    state.profiles.map((profile) => profile.school),
  );
  const filteredProfiles = state.profiles
    .filter((profile) => profile.id !== currentProfileId)
    .filter((profile) => !filters.university || normalizeAcademicValue(profile.university || 'RMIT University').toLowerCase() === normalizeAcademicValue(filters.university).toLowerCase())
    .filter((profile) => !filters.school || normalizeAcademicValue(profile.school).toLowerCase() === normalizeAcademicValue(filters.school).toLowerCase())
    .filter((profile) => !filters.major || normalizeAcademicValue(profile.major).toLowerCase() === normalizeAcademicValue(filters.major).toLowerCase())
    .filter((profile) => !filters.course || requestsByProfile[profile.id]?.some((request) => courseMatchesFilter(request, filters.course)))
    .filter((profile) => !filters.skill || profile.skills?.includes(filters.skill));

  const schoolFilteredProfiles = filters.school
    ? state.profiles.filter((profile) => normalizeAcademicValue(profile.school).toLowerCase() === normalizeAcademicValue(filters.school).toLowerCase())
    : state.profiles;
  const availableMajors = mergeAcademicOptions(
    filters.school ? majorsBySchool[filters.school] || [] : [...new Set(Object.values(majorsBySchool).flat())],
    schoolFilteredProfiles.map((profile) => profile.major),
  );
  const discoverSkillOptions = getAllSkills().filter((skill) => skill !== 'Other');
  const updateDiscoveryFilters = (nextFilters, filterName) => {
    const changed = filters[filterName] !== nextFilters[filterName];
    setFilters(nextFilters);
    if (!changed) return;

    void trackProductEvent('discovery_filtered', {
      profileId: currentProfileId,
      metadata: {
        filter_name: filterName,
        has_value: Boolean(nextFilters[filterName]),
        active_filter_count: Object.values(nextFilters).filter(Boolean).length,
      },
    });
  };

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
      void trackProductEvent('connection_requested', {
        profileId: currentProfileId,
        entityType: 'connection',
        entityId: connection.id,
        metadata: {
          receiver_profile_id: state.modalProfile.id,
          source: 'discover',
        },
        dedupeKey: connection.id ? `connection_requested:${connection.id}` : null,
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

  const unsendDiscoverConnect = async (profile) => {
    if (!profile || !currentProfileId) return;
    const connection = state.sentByProfile[profile.id] ?? state.connectionsByProfile[profile.id];
    if (!connection?.id) return;

    setState((current) => ({ ...current, sendingProfileId: profile.id, modalError: '' }));

    try {
      await cancelConnectionRequest(connection.id, currentProfileId);
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        sentByProfile: { ...current.sentByProfile, [profile.id]: null },
        connectionsByProfile: { ...current.connectionsByProfile, [profile.id]: null },
      }));
    } catch (error) {
      console.error('Discover connection withdrawal failed', error);
      setState((current) => ({
        ...current,
        sendingProfileId: '',
        modalError: t('connections.cancelFail'),
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
            onChange={(event) => updateDiscoveryFilters({ ...filters, university: event.target.value }, 'university')}
          >
            <option value="">{t('discover.allUniversities')}</option>
            {discoverUniversityOptions.map((university) => (
              <option value={university.value} key={university.value}>{localizedOption(university.value, 'options.university', t)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.school')}
          <select
            value={filters.school}
            onChange={(event) => updateDiscoveryFilters({
              ...filters,
              school: event.target.value,
              major: '',
              course: '',
            }, 'school')}
          >
            <option value="">{t('discover.allSchools')}</option>
            {discoverSchoolOptions.map((school) => (
              <option value={school.value} key={school.value}>{localizedOption(school.value, 'options.school', t)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.major')}
          <select value={filters.major} onChange={(event) => updateDiscoveryFilters({ ...filters, major: event.target.value }, 'major')}>
            <option value="">{t('discover.allMajors')}</option>
            {availableMajors.map((major) => (
              <option value={major.value} key={major.value}>{localizedOption(major.value, 'options.major', t)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('class.course')}
          <select value={filters.course} onChange={(event) => updateDiscoveryFilters({ ...filters, course: event.target.value }, 'course')}>
            <option value="">{t('discover.allCourses')}</option>
            {discoverCourseOptions.map((course) => (
              <option value={course.code} key={course.code}>{formatCourseOption(course)}</option>
            ))}
          </select>
        </label>
        <label>
          {t('profile.skills')}
          <select value={filters.skill} onChange={(event) => updateDiscoveryFilters({ ...filters, skill: event.target.value }, 'skill')}>
            <option value="">{t('discover.allSkills')}</option>
            {discoverSkillOptions.map((skill) => (
              <option value={skill} key={skill}>{localizedOption(skill, 'options.skill', t)}</option>
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
            const connection = state.sentByProfile[profile.id] ?? state.connectionsByProfile[profile.id];
            const connectionState = getConnectionState(connection, currentProfileId);

            return (
              <article className={isPremiumProfile(profile) ? 'discover-card premium-card' : 'discover-card'} key={profile.id}>
                <div className="avatar">{displayInitial(profile.full_name)}</div>
                <h3>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />} {isPremiumProfile(profile) && <PremiumBadge t={t} />}</h3>
                <p>{universityLabel(profile.university)}</p>
                {hasDisplaySchool(profile.school) && <p>{schoolLabel(profile.school)}</p>}
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
                {connectionState === 'sent_pending' && <ConnectionStateBadge state={connectionState} t={t} />}
                {connectionState === 'received_pending' && <ConnectionStateBadge state={connectionState} t={t} />}
                <div className="hero-actions discover-connection-actions">
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
                      {discoverConnectedButtonLabel(t)}
                    </button>
                  ) : connectionState === 'sent_pending' ? (
                    <button
                      className="secondary"
                      onClick={() => unsendDiscoverConnect(profile)}
                      disabled={state.sendingProfileId === profile.id}
                    >
                      {state.sendingProfileId === profile.id ? t('common.updating') : t('connections.unsend')}
                    </button>
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

function DiscoverProfileDetail({ profileId, currentProfileId, currentProfile, onBack, onOpenChat, onOpenConnections, t = translate.bind(null, 'en') }) {
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
  const profileViewTrackedRef = useRef(new Set());

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
          const trackingKey = `${currentProfileId || 'anonymous'}:${profile.id}:discover`;
          if (profile.id !== currentProfileId && !profileViewTrackedRef.current.has(trackingKey)) {
            profileViewTrackedRef.current.add(trackingKey);
            void trackProductEvent('profile_viewed', {
              profileId: currentProfileId,
              entityType: 'profile',
              entityId: profile.id,
              metadata: {
                source: 'discover',
                has_active_request: Boolean(activeRequest?.id),
              },
              dedupeKey: `profile_viewed:${trackingKey}`,
            });
          }
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
  }, [profileId, currentProfileId]);

  if (state.loading) {
    return <main className="screen compact"><p className="loading">{t('ui.loadingProfile')}</p></main>;
  }

  if (state.error) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const profile = state.profile;
  const activeRequestMetrics = state.activeRequest ? getRequestStatusMetrics(state.activeRequest) : null;
  const isOwnProfile = profile.id === currentProfileId;
  const connectionState = getConnectionState(state.connection, currentProfileId);
  const reviewTeamRequestId = state.connection?.connection_context === 'team_request' && state.connection?.relationship_type === 'teammate'
    ? state.connection.sender_team_request_id || state.connection.receiver_team_request_id || state.activeRequest?.id
    : null;
  const disabledReason = isOwnProfile
      ? t('ui.thisIsYourProfile')
      : !currentProfileId
        ? t('connect.needProfile')
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
      void trackProductEvent('connection_requested', {
        profileId: currentProfileId,
        entityType: 'connection',
        entityId: connection.id,
        metadata: {
          receiver_profile_id: profile.id,
          source: 'discover_profile',
        },
        dedupeKey: connection.id ? `connection_requested:${connection.id}` : null,
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
        actionError: t('connections.sendFail'),
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
        actionError: t('ui.demoAcceptanceFail'),
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
        actionSuccess: t('ui.unmatchSuccess', { name: displayName(profile.full_name) }),
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: t('connections.unmatchFail'),
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
        <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />} {isPremiumProfile(profile) && <PremiumBadge t={t} />}</h2>
        <p>{profile.short_bio || t('matches.noBio')}</p>
          <dl>
          <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
          {hasDisplaySchool(profile.school) && <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>}
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
        <ReviewsSection profile={profile} reviews={state.reviews} viewerProfile={currentProfile} t={t} />
        {state.activeRequest && (
          <div className="request-summary-box">
            <p className="eyebrow">{t('matches.lookingTeammate')}</p>
            <h3>{getCourseDisplay(state.activeRequest)}</h3>
            <dl>
              <div><dt>{t('matches.classSession')}</dt><dd>{getLocalizedSessionDisplay(state.activeRequest, t)}</dd></div>
              <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(state.activeRequest.skills_needed)}</dd></div>
              <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(state.activeRequest))}</dd></div>
              <div><dt>{t('matches.requirements')}</dt><dd>{describeRequirements(state.activeRequest, t)}</dd></div>
              <div><dt>{t('matches.teamSize')}</dt><dd>{getTotalTeamSize(state.activeRequest)}</dd></div>
              <div><dt>{t('opportunities.progress')}</dt><dd>{teammateCountSummary(activeRequestMetrics, t)} · {remainingSummary(activeRequestMetrics, t)}</dd></div>
              <div><dt>{t('matches.lookingFor')}</dt><dd>{getInitialNeeded(state.activeRequest)} {getInitialNeeded(state.activeRequest) === 1 ? t('matches.spot') : t('matches.spots')}</dd></div>
          <PortfolioReference request={state.activeRequest} t={t} />
            </dl>
          </div>
        )}
        <TeammateFeedbackPanel
          connection={state.connection}
          currentProfileId={currentProfileId}
          reviewedProfileId={profile.id}
          teamRequestId={reviewTeamRequestId}
          t={t}
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
          <div className="stacked-actions profile-connection-actions">
            <button className="connected-button" disabled>
              <CheckCircle2 size={18} />
              {connectedButtonLabel(state.connection, t)}
            </button>
            <div className="connection-action-row">
              <button className="primary link-button" onClick={() => onOpenChat(state.connection.id)}>
                <MessageCircle size={18} />
                {t('common.message')}
              </button>
              <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
                {t('common.unmatch')}
              </button>
            </div>
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
            t={t}
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
          t={t}
        />
      )}
    </main>
  );
}

function ReviewsSection({ reviews = [], profile, title = '', viewerProfile = null, t = translate.bind(null, 'en') }) {
  const canReadFullReviews = profile?.id === viewerProfile?.id || isPremiumProfile(viewerProfile);

  return (
    <section className="request-summary-box">
      <p className="eyebrow">{title || t('profile.reviews')}</p>
      <h3>{reviewSummaryLabel(profile, reviews, t)}</h3>
      {reviews.length === 0 ? (
        <p className="note">{t('profile.noReviews')}</p>
      ) : !canReadFullReviews ? (
        <p className="note">{t('premium.upgradeReviews')}</p>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              {review.is_demo && <span className="status-badge pending">DEMO</span>}
              <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
              {review.review_text && <p>"{review.review_text}"</p>}
              {review.course_name && <span>{t('class.course')}: {review.course_name}</span>}
              {review.review_context && <span>{t('profile.reviewContext')}: {review.review_context}</span>}
              <span>{review.reviewer_name || t('profile.aTeammate')}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TeammateFeedbackPanel({ connection, currentProfileId, reviewedProfileId, teamRequestId, t = translate.bind(null, 'en') }) {
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
      const review = await createReview({
        reviewerProfileId: currentProfileId,
        reviewedProfileId,
        connectionId: connection.id,
        teamRequestId,
        rating: Number(reviewRating),
        reviewText,
      });
      void trackProductEvent('review_submitted', {
        profileId: currentProfileId,
        entityType: 'review',
        entityId: review.id,
        metadata: {
          connection_id: connection.id,
          reviewed_profile_id: reviewedProfileId,
          team_request_id: teamRequestId,
          rating: Number(reviewRating),
        },
        dedupeKey: review.id ? `review_submitted:${review.id}` : null,
      });
      setMessage(t('ui.reviewSaved'));
    } catch (err) {
      setError(getFriendlyError(err, t('ui.reviewSaveFail')));
    } finally {
      setSaving('');
    }
  };

  return (
    <section className="request-summary-box">
      <p className="eyebrow">{t('ui.writeReview')}</p>
      <form className="feedback-form" onSubmit={submitReview}>
        <h3>{t('ui.reviewPrompt')}</h3>
        <div>
          <strong>{t('ui.teammateRating')}</strong>
          <div className="star-rating" role="radiogroup" aria-label={t('ui.teammateRating')}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                className={Number(reviewRating) >= rating ? 'selected' : ''}
                key={rating}
                type="button"
                onClick={() => setReviewRating(rating)}
                aria-label={`${rating} ${rating === 1 ? t('ui.star') : t('ui.stars')}`}
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
          placeholder={t('ui.reviewPlaceholder')}
        />
        <button className="secondary" type="submit" disabled={saving === 'review'}>
          {saving === 'review' ? t('ui.saving') : t('ui.submitReview')}
        </button>
      </form>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function MatchUsefulnessPanel({ request, currentProfileId, teamComplete, t = translate.bind(null, 'en') }) {
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!request || !currentProfileId || !teamComplete) return null;

  const labels = {
    1: t('ui.ratingNotUseful'),
    2: t('ui.ratingNotVeryUseful'),
    3: t('ui.ratingOkay'),
    4: t('ui.ratingUseful'),
    5: t('ui.ratingVeryUseful'),
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const feedback = await createMatchFeedback({
        connectionId: null,
        teamRequestId: request.id,
        reviewerProfileId: currentProfileId,
        score: Number(rating),
        feedbackText,
      });
      void trackProductEvent('match_feedback_submitted', {
        profileId: currentProfileId,
        entityType: 'match_feedback',
        entityId: feedback.id,
        metadata: {
          team_request_id: request.id,
          rating: Number(rating),
        },
        dedupeKey: feedback.id ? `match_feedback_submitted:${feedback.id}` : null,
      });
      setMessage(t('ui.matchUsefulnessSaved'));
    } catch (err) {
      setError(getFriendlyError(err, t('ui.matchUsefulnessSaveFail')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="request-summary-box">
      <p className="eyebrow">{t('ui.matchUsefulnessRating')}</p>
      <h3>{t('ui.matchUsefulnessPrompt')}</h3>
      <p className="note">{t('ui.matchUsefulnessHelp')}</p>
      <form className="feedback-form" onSubmit={submit}>
        <div className="star-rating" role="radiogroup" aria-label={t('ui.matchUsefulnessAria')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              className={Number(rating) >= value ? 'selected' : ''}
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} ${t('ui.stars')} - ${labels[value]}`}
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
          placeholder={t('ui.matchUsefulnessPlaceholder')}
        />
        <button className="secondary" type="submit" disabled={saving}>
          {saving ? t('ui.saving') : t('ui.submitMatchUsefulness')}
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
  currentProfile,
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
  const detailViewTrackedRef = useRef(new Set());

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
          const profileTrackingKey = `${currentProfileId || 'anonymous'}:${request.profile.id}:match:${request.id}`;
          if (request.profile.id !== currentProfileId && !detailViewTrackedRef.current.has(profileTrackingKey)) {
            detailViewTrackedRef.current.add(profileTrackingKey);
            void trackProductEvent('profile_viewed', {
              profileId: currentProfileId,
              entityType: 'profile',
              entityId: request.profile.id,
              metadata: {
                source: 'match_detail',
                team_request_id: request.id,
                current_request_id: currentRequestId || null,
              },
              dedupeKey: `profile_viewed:${profileTrackingKey}`,
            });
          }
          const requestTrackingKey = `${currentProfileId || 'anonymous'}:${request.id}`;
          if (!detailViewTrackedRef.current.has(requestTrackingKey)) {
            detailViewTrackedRef.current.add(requestTrackingKey);
            void trackProductEvent('request_viewed', {
              profileId: currentProfileId,
              entityType: 'team_request',
              entityId: request.id,
              metadata: {
                source: 'match_detail',
                owner_profile_id: request.profile_id,
                current_request_id: currentRequestId || null,
              },
              dedupeKey: `request_viewed:${requestTrackingKey}`,
            });
          }
        }
      })
      .catch(() => {
        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: t('matches.loadingFail'),
            request: null,
          }));
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId]);

  if (state.loading) {
    return <main className="screen compact"><p className="loading">{t('ui.loadingProfile')}</p></main>;
  }

  if (state.error) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const request = state.request;
  const profile = request.profile;
  const requestMetrics = getRequestStatusMetrics(request);
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
      void trackProductEvent('connection_requested', {
        profileId: currentProfileId,
        entityType: 'connection',
        entityId: created.id,
        metadata: {
          receiver_profile_id: profile.id,
          sender_team_request_id: currentRequestId || null,
          source: 'match_detail',
        },
        dedupeKey: created.id ? `connection_requested:${created.id}` : null,
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
        actionError: t('connections.sendFail'),
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
        actionError: t('ui.demoAcceptanceFail'),
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
        actionSuccess: t('ui.unmatchSuccess', { name: displayName(profile.full_name) }),
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: t('connections.unmatchFail'),
      }));
    }
  };

  const renderConnectionAction = () => {
    if (isOwnProfile) {
      return (
        <div className="stacked-actions">
          <button className="disabled-contact" disabled>
            <UserPlus size={18} />
            {t('common.connect')}
          </button>
          <p className="connection-hint">{t('ui.thisIsYourProfile')}</p>
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
        <div className="stacked-actions profile-connection-actions">
          <button className="connected-button" disabled>
            <CheckCircle2 size={18} />
            {connectedButtonLabel(connection, t)}
          </button>
          <div className="connection-action-row">
            <button className="primary link-button" onClick={() => onOpenChat(connection.id)}>
              <MessageCircle size={18} />
              {t('common.message')}
            </button>
            <button className="secondary link-button quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
              {t('common.unmatch')}
            </button>
          </div>
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
	          <h2>{displayName(profile.full_name)} {profile.is_demo && <DemoBadge />} {isPremiumProfile(profile) && <PremiumBadge t={t} />}</h2>
	          <p>{profile.short_bio || t('matches.noBio')}</p>
	          <dl>
	            <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
	            {hasDisplaySchool(profile.school) && <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>}
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
          <ReviewsSection profile={profile} reviews={state.reviews} viewerProfile={currentProfile} t={t} />
          {profile.is_demo && (
            <DemoSimulationPanel
              connection={connection}
              accepting={state.simulating}
              onAccept={simulateAcceptance}
              onStartChat={() => onOpenChat(connection.id)}
              onViewConnection={null}
              onReset={resetDemo}
              t={t}
            />
          )}
        </div>

        <div className="request-panel">
	          <p className="eyebrow">{t('matches.lookingTeammate')}</p>
          <h3>{getCourseDisplay(request)}</h3>
          <dl>
	            {typeof matchScore === 'number' && <div><dt>{t('matches.matchScore')}</dt><dd>{t('matches.matchPercent', { score: matchScore })}</dd></div>}
	            {hasDisplaySchool(request.school || profile.school) && <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(request.school || profile.school)}</dd></div>}
	            <div><dt>{t('profile.major')}</dt><dd>{request.major || profile.major}</dd></div>
	            <div><dt>{t('matches.classSession')}</dt><dd>{getLocalizedSessionDisplay(request, t)}</dd></div>
	            <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(request.skills_needed)}</dd></div>
	            <div><dt>{t('matches.teamSize')}</dt><dd>{getTotalTeamSize(request)}</dd></div>
	            <div><dt>{t('opportunities.progress')}</dt><dd>{teammateCountSummary(requestMetrics, t)} · {remainingSummary(requestMetrics, t)}</dd></div>
	            <div><dt>{t('matches.lookingFor')}</dt><dd>{getInitialNeeded(request)} {getInitialNeeded(request) === 1 ? t('matches.spot') : t('matches.spots')}</dd></div>
	            <div><dt>{t('matches.workStyle')}</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
	            <div><dt>{t('matches.requirements')}</dt><dd>{describeRequirements(request, t)}</dd></div>
            <PortfolioReference request={request} t={t} />
          </dl>
	          {currentRequestId === request.id && <p className="note">{t('matches.thisRequest')}</p>}
          <TeammateFeedbackPanel
            connection={connection}
            currentProfileId={currentProfileId}
            reviewedProfileId={profile.id}
            teamRequestId={feedbackTeamRequestId}
            t={t}
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
          t={t}
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
    onOpenProfile,
	  onSelectRequest,
	  onViewRecommended,
	  onCreateNew,
	  t = translate.bind(null, 'en'),
}) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    requests: [],
    collabProfiles: [],
    collabRequestsByProfile: {},
    collabConnectionsByProfile: {},
    collabSendingProfileId: '',
    progressById: {},
    selectedId: requestId || '',
    editingRequest: null,
    cancelTarget: null,
    saving: false,
    success: '',
    dismissedComplete: false,
    dismissedReopen: false,
  });
  const requestViewTrackedRef = useRef(new Set());

  const loadRequests = () => {
    let alive = true;

    if (!currentProfileId) {
      setState((current) => ({ ...current, loading: false, requests: [], progressById: {} }));
      return () => { alive = false; };
    }

    Promise.all([
      listMyTeamRequests(currentProfileId),
      getDiscoverProfiles().catch(() => []),
      getActiveTeamRequests().catch(() => []),
    ])
      .then(async ([requests, profiles, activeRequests]) => {
        const standaloneRequests = sortRequestsByVisibility(
          requests.filter((request) => !request.class_id),
        );
        const visibleProfiles = (profiles || [])
          .filter((candidate) => getProfileRole(candidate) === 'student')
          .filter((candidate) => candidate.id !== currentProfileId);
        const collabRequestsByProfile = (activeRequests || [])
          .filter((request) => request.profile_id !== currentProfileId)
          .filter((request) => !request.class_id)
          .filter((request) => request.request_scope === 'open_opportunity' || request.opportunity_name)
          .reduce((map, request) => {
            map[request.profile_id] = [...(map[request.profile_id] || []), request];
            return map;
          }, {});
        const connectionEntries = await Promise.all(
          visibleProfiles.map(async (candidate) => {
            try {
              return [candidate.id, await getConnectionBetween(currentProfileId, candidate.id)];
            } catch {
              return [candidate.id, null];
            }
          }),
        );
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
            collabProfiles: visibleProfiles,
            collabRequestsByProfile,
            collabConnectionsByProfile: Object.fromEntries(connectionEntries),
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
            error: t('matches.loadingFail'),
            saving: false,
          }));
        }
      });

    return () => { alive = false; };
  };

  useEffect(() => {
    return loadRequests();
  }, [requestId, currentProfileId]);

  useEffect(() => {
    if (!currentProfileId || state.loading || !state.selectedId) return;
    const selectedRequest = state.requests.find((request) => request.id === state.selectedId);
    if (!selectedRequest?.id) return;

    const trackingKey = `${currentProfileId}:${selectedRequest.id}:current-request`;
    if (requestViewTrackedRef.current.has(trackingKey)) return;
    requestViewTrackedRef.current.add(trackingKey);

    void trackProductEvent('request_viewed', {
      profileId: currentProfileId,
      entityType: 'team_request',
      entityId: selectedRequest.id,
      metadata: {
        source: 'current_request',
        request_scope: selectedRequest.request_scope || (selectedRequest.class_id ? 'class' : 'open_opportunity'),
        status: selectedRequest.status,
      },
      dedupeKey: `request_viewed:${trackingKey}`,
    });
  }, [currentProfileId, state.loading, state.selectedId, state.requests]);

  const markFound = async () => {
    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      const updated = await markTeamRequestFound(state.selectedId, {
        editToken: getStoredRequestEditToken(),
      });
      void trackProductEvent('request_completed', {
        profileId: currentProfileId,
        entityType: 'team_request',
        entityId: updated.id,
        metadata: { source: 'current_request' },
        dedupeKey: updated.id ? `request_completed:${updated.id}` : null,
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

  const pinRequest = async (request) => {
    if (!request || !isPremiumProfile(profile)) return;
    setState((current) => ({ ...current, saving: true, error: '', success: '' }));

    try {
      const updated = await pinTeamRequestFor48Hours(request.id, currentProfileId);
      setState((current) => ({
        ...current,
        saving: false,
        requests: sortRequestsByVisibility(current.requests.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        )),
        selectedId: updated.id,
        success: t('premium.pinSuccess'),
      }));
    } catch (err) {
      console.error('Pin request failed', err);
      setState((current) => ({
        ...current,
        saving: false,
        error: t('premium.pinFail'),
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

  const getCandidateCollabRequests = (candidate) =>
    state.collabRequestsByProfile[candidate.id] || [];

  const collabProfileScore = (candidate, request = null) => {
    if (!candidate) return 0;
    const candidateRequests = getCandidateCollabRequests(candidate);
    const skillMatches = arrayOverlapCount(candidate.skills, request?.skills_needed || profile?.skills || []);

    if (!request) {
      return Math.min(100, 36 + skillMatches * 10 + (candidateRequests.length ? 8 : 0));
    }

    const requestName = normalizeFilterValue(request.opportunity_name || request.course_name || request.course);
    const requestType = normalizeFilterValue(request.opportunity_type || request.course_code);
    const requestField = normalizeFilterValue(request.opportunity_field || request.major);
    const sameCompetition = candidateRequests.some((candidateRequest) =>
      requestName && normalizeFilterValue(candidateRequest.opportunity_name || candidateRequest.course_name || candidateRequest.course) === requestName,
    );
    const sameType = candidateRequests.some((candidateRequest) =>
      requestType && normalizeFilterValue(candidateRequest.opportunity_type || candidateRequest.course_code) === requestType,
    );
    const sameField = requestField && (
      normalizeFilterValue(candidate.major) === requestField
      || candidateRequests.some((candidateRequest) =>
        normalizeFilterValue(candidateRequest.opportunity_field || candidateRequest.major) === requestField,
      )
    );
    const complementaryNeeds = Math.max(
      ...candidateRequests.map((candidateRequest) => arrayOverlapCount(profile?.skills || [], candidateRequest.skills_needed || [])),
      0,
    );
    const hasCapacity = candidateRequests.some((candidateRequest) =>
      Number(candidateRequest.team_status?.remaining_members ?? candidateRequest.members_needed ?? 0) > 0,
    );

    return Math.min(
      100,
      30
        + (sameCompetition ? 24 : 0)
        + (sameType ? 8 : 0)
        + (sameField ? 14 : 0)
        + skillMatches * 10
        + complementaryNeeds * 8
        + (hasCapacity ? 6 : 0),
    );
  };

  const collabProfileReason = (candidate, request = null) => {
    const reasons = [];
    const candidateRequests = getCandidateCollabRequests(candidate);
    const requestName = normalizeFilterValue(request?.opportunity_name || request?.course_name || request?.course);
    if (requestName && candidateRequests.some((candidateRequest) =>
      normalizeFilterValue(candidateRequest.opportunity_name || candidateRequest.course_name || candidateRequest.course) === requestName
    )) {
      reasons.push(t('opportunities.reasonCompetition'));
    }
    if (request && normalizeFilterValue(candidate.major) === normalizeFilterValue(request.opportunity_field || request.major)) {
      reasons.push(t('opportunities.reasonField'));
    }
    if (arrayOverlapCount(candidate.skills, request?.skills_needed || profile?.skills || []) > 0) {
      reasons.push(t('opportunities.reasonSkills'));
    }
    if (request && candidateRequests.some((candidateRequest) =>
      arrayOverlapCount(profile?.skills || [], candidateRequest.skills_needed || []) > 0
    )) {
      reasons.push(t('opportunities.reasonComplement'));
    }
    if (request && candidateRequests.some((candidateRequest) =>
      Number(candidateRequest.team_status?.remaining_members ?? candidateRequest.members_needed ?? 0) > 0
    )) {
      reasons.push(t('opportunities.reasonCapacity'));
    }
    return reasons.slice(0, 2).join(' ') || t('opportunities.reasonDefault');
  };

  const connectCollabProfile = async (candidate) => {
    if (!candidate || !currentProfileId) return;
    setState((current) => ({ ...current, collabSendingProfileId: candidate.id, error: '', success: '' }));

    try {
      let connection = await sendConnectionRequest({
        senderProfileId: currentProfileId,
        receiverProfileId: candidate.id,
        senderTeamRequestId: selectedRequest?.status === 'looking' ? selectedRequest.id : null,
        introMessage: t('connect.collabIntro', { name: displayName(candidate.full_name) }),
      });
      void trackProductEvent('connection_requested', {
        profileId: currentProfileId,
        entityType: 'connection',
        entityId: connection.id,
        metadata: {
          receiver_profile_id: candidate.id,
          sender_team_request_id: selectedRequest?.status === 'looking' ? selectedRequest.id : null,
          source: 'open_opportunities',
        },
        dedupeKey: connection.id ? `connection_requested:${connection.id}` : null,
      });
      if (candidate.is_demo) {
        connection = await simulateDemoAcceptance(connection.id, currentProfileId).catch(() => connection);
      }
      setState((current) => ({
        ...current,
        collabSendingProfileId: '',
        success: t('connections.requestSent'),
        collabConnectionsByProfile: {
          ...current.collabConnectionsByProfile,
          [candidate.id]: {
            ...connection,
            sender_profile_id: currentProfileId,
            receiver_profile_id: candidate.id,
          },
        },
      }));
    } catch (err) {
      console.error('Collab connect failed', err);
      setState((current) => ({
        ...current,
        collabSendingProfileId: '',
        error: t('connections.sendFail'),
      }));
    }
  };

  const unsendCollabConnect = async (candidate) => {
    if (!candidate || !currentProfileId) return;
    const connection = state.collabConnectionsByProfile[candidate.id];
    if (!connection?.id) return;

    setState((current) => ({ ...current, collabSendingProfileId: candidate.id, error: '', success: '' }));

    try {
      await cancelConnectionRequest(connection.id, currentProfileId);
      setState((current) => ({
        ...current,
        collabSendingProfileId: '',
        success: t('connections.withdrawn'),
        collabConnectionsByProfile: {
          ...current.collabConnectionsByProfile,
          [candidate.id]: null,
        },
      }));
    } catch (error) {
      console.error('Collab connection withdrawal failed', error);
      setState((current) => ({
        ...current,
        collabSendingProfileId: '',
        error: t('connections.cancelFail'),
      }));
    }
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
  const collabProfiles = [...state.collabProfiles]
    .sort((a, b) => {
      const requestForScoring = selectedRequest?.status === 'looking' ? selectedRequest : null;
      return collabProfileScore(b, requestForScoring) - collabProfileScore(a, requestForScoring)
        || Number(isPremiumProfile(b)) - Number(isPremiumProfile(a));
    })
    .slice(0, selectedRequest?.status === 'looking' ? 8 : 12);

  const renderCollabHeader = () => (
    <div className="results-header collabs-page-header">
      <div>
        <p className="eyebrow">{t('opportunities.title')}</p>
        <h2>{t('opportunities.profileIntro')}</h2>
      </div>
      <div className="collabs-header-actions">
        <button className="ghost collabs-inline-back" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t('common.back')}
        </button>
        <button className="primary" onClick={onCreateNew}>
          <Plus size={18} />
          {t('opportunities.new')}
        </button>
      </div>
    </div>
  );

  const renderCollabProfiles = (request = null) => (
    <section className="request-panel standalone collab-discovery-panel">
      {collabProfiles.length === 0 ? (
        <section className="empty-state inline-empty">
          <p>{t('opportunities.noProfiles')}</p>
        </section>
      ) : (
        <div className="discover-grid compact-discover-grid">
          {collabProfiles.map((candidate) => {
            const connection = state.collabConnectionsByProfile[candidate.id];
            const connectionState = getConnectionState(connection, currentProfileId);
            return (
              <article className={isPremiumProfile(candidate) ? 'discover-card premium-card' : 'discover-card'} key={candidate.id}>
                <div className="avatar">{displayInitial(candidate.full_name)}</div>
                <h3>{displayName(candidate.full_name)} {candidate.is_demo && <DemoBadge />} {isPremiumProfile(candidate) && <PremiumBadge t={t} />}</h3>
                <p>{universityLabel(candidate.university)}</p>
                <p>{formatSchoolMajorLine(candidate.school, candidate.major)}</p>
                <p className="note">{reviewSummaryLabel(candidate, null, t)}</p>
                <div className="score inline-score">
                  <Sparkles size={16} />
                  {t('matches.matchPercent', { score: collabProfileScore(candidate, request) })}
                </div>
                <div className="mini-detail">
                  <strong>{t('matches.skillsHave')}</strong>
                  <span>{joinList(candidate.skills)}</span>
                </div>
                <div className="mini-detail">
                  <strong>{t('matches.why')}</strong>
                  <span>{collabProfileReason(candidate, request)}</span>
                </div>
                {connectionState === 'sent_pending' && <ConnectionStateBadge state={connectionState} t={t} />}
                {connectionState === 'received_pending' && <ConnectionStateBadge state={connectionState} t={t} />}
                <div className="hero-actions discover-connection-actions">
                  <button className="secondary" onClick={() => onOpenProfile?.(candidate.id)}>
                    {t('common.viewProfile')}
                  </button>
                  {connectionState === 'none' ? (
                    <button
                      className="primary"
                      onClick={() => connectCollabProfile(candidate)}
                      disabled={state.collabSendingProfileId === candidate.id}
                    >
                      <UserPlus size={18} />
                      {state.collabSendingProfileId === candidate.id ? t('matches.sending') : t('matches.connect')}
                    </button>
                  ) : connectionState === 'accepted' ? (
                    <button className="connected-button" disabled>
                      <CheckCircle2 size={18} />
                      {discoverConnectedButtonLabel(t)}
                    </button>
                  ) : connectionState === 'sent_pending' ? (
                    <button
                      className="secondary"
                      onClick={() => unsendCollabConnect(candidate)}
                      disabled={state.collabSendingProfileId === candidate.id}
                    >
                      {state.collabSendingProfileId === candidate.id ? t('common.updating') : t('connections.unsend')}
                    </button>
                  ) : connectionState === 'received_pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile?.(candidate.id)}>
                      {t('connections.respond')}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const RequestRow = ({ request }) => {
    const requestProgress = state.progressById[request.id] || { found_count: 0 };
    const requestMetrics = getTeamProgress(request, requestProgress);
    const isSelected = selectedRequest?.id === request.id;

    return (
      <article className={[
        'request-list-row',
        isSelected ? 'selected' : '',
        (isPremiumProfile(request.profile || profile) || isRequestPinned(request)) ? 'premium-card' : '',
      ].filter(Boolean).join(' ')}>
        <div>
          <h3>{getCourseDisplay(request)} {isPremiumProfile(request.profile || profile) && <PremiumBadge t={t} />} {isRequestPinned(request) && <span className="premium-badge pinned">{t('premium.pinned')}</span>}</h3>
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
          {request.status === 'looking' && isPremiumProfile(profile) && !isRequestPinned(request) && (
            <button className="secondary" onClick={() => pinRequest(request)} disabled={state.saving}>
              <Sparkles size={18} />
              {t('premium.pin')}
            </button>
          )}
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
      <main className="screen collabs-screen">
        {renderCollabHeader()}
        {renderCollabProfiles(null)}
      </main>
    );
  }

  const request = selectedRequest;

  return (
    <main className="screen collabs-screen">
      {renderCollabHeader()}

      {renderCollabProfiles(request.status === 'looking' ? request : null)}

      <div className="request-management-grid">
        <section className="request-list-panel">
          <RequestSection title={t('common.active')} requests={groupedRequests.active} />
          <RequestSection title={t('common.completed')} requests={groupedRequests.completed} />
          <RequestSection title={t('common.cancelled')} requests={groupedRequests.cancelled} />
        </section>

      <section className="request-panel standalone">
	        <p className="eyebrow">{t('opportunities.selected')}</p>
	        <h2>{getCourseDisplay(request)} {isPremiumProfile(profile) && <PremiumBadge t={t} />} {isRequestPinned(request) && <span className="premium-badge pinned">{t('premium.pinned')}</span>}</h2>
	        <dl>
	          <div><dt>{t('request.opportunityType')}</dt><dd>{request.opportunity_type || request.course_code || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.field')}</dt><dd>{request.opportunity_field || request.major || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.deadline')}</dt><dd>{request.deadline || t('common.notSpecified')}</dd></div>
	          <div><dt>{t('request.skillsNeeded')}</dt><dd>{joinList(request.skills_needed)}</dd></div>
	          <div><dt>{t('request.teamSize')}</dt><dd>{getTotalTeamSize(request)}</dd></div>
          <div><dt>{t('opportunities.progress')}</dt><dd>{teammateCountSummary(metrics, t)} · {remainingSummary(metrics, t)}</dd></div>
          <div><dt>{t('opportunities.initiallyLooking')}</dt><dd>{getInitialNeeded(request)}</dd></div>
          <div><dt>{t('request.teammateKind')}</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
          <div><dt>{t('request.requirementsTitle')}</dt><dd>{describeRequirements(request, t)}</dd></div>
          <PortfolioReference request={request} t={t} />
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
          {request.status === 'looking' && isPremiumProfile(profile) && !isRequestPinned(request) && (
            <button className="secondary" onClick={() => pinRequest(request)} disabled={state.saving}>
              <Sparkles size={18} />
              {t('premium.pin')}
            </button>
          )}
          {request.status === 'looking' && !isPremiumProfile(profile) && (
            <p className="note inline-note">{t('premium.pinUpgrade')}</p>
          )}
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
          <div className="progress-track" aria-label={t('ui.classFormationProgress')}>
            <div className="progress-fill" style={{ width: `${metrics.percent}%` }} />
          </div>
	          {teamComplete ? <p className="success">{t('status.teamComplete')}</p> : <p className="note">{remainingSummary(metrics, t)}</p>}
          {metrics.matchedCount > 0 && !teamComplete && <p className="note">{t('opportunities.foundAnother')} {remainingSummary(metrics, t)}</p>}
        </section>

        <MatchUsefulnessPanel
          request={request}
          currentProfileId={currentProfileId}
          teamComplete={teamComplete}
          t={t}
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
      const loadConnectionGroup = (direction) =>
        getConnectionRequests(currentProfileId, direction).catch((error) => {
          console.error(`Could not load ${direction} connections`, error);
          return [];
        });
	      const [received, sent, connected, friends, currentRequest] = await Promise.all([
	        loadConnectionGroup('received'),
	        loadConnectionGroup('sent'),
	        loadConnectionGroup('connected'),
	        listFriends(currentProfileId).catch(() => []),
	        currentRequestId ? getTeamRequestById(currentRequestId).catch(() => null) : Promise.resolve(null),
	      ]);
      const [declined, unmatched] = await Promise.all([
        loadConnectionGroup('declined'),
        loadConnectionGroup('unmatched'),
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
      if (status === 'accepted' || status === 'declined') {
        void trackProductEvent(status === 'accepted' ? 'connection_accepted' : 'connection_declined', {
          profileId: currentProfileId,
          entityType: 'connection',
          entityId: connectionId,
          metadata: { source: 'connections' },
          dedupeKey: `${status === 'accepted' ? 'connection_accepted' : 'connection_declined'}:${connectionId}`,
        });
      }
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
	    { id: 'messages', label: t('nav.messages') },
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
	  const showingMessages = tab === 'messages';

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
              {item.label}{item.rows?.length ? ` (${item.rows.length})` : ''}
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

      {currentProfileId && !state.loading && !showingMessages && activeRows.length === 0 && (
        <section className="empty-state">
          <p>{emptyCopy[tab]}</p>
        </section>
      )}

	      {currentProfileId && !state.loading && showingMessages && (
	        <MessagesList
	          currentProfileId={currentProfileId}
	          onOpenChat={onOpenChat}
	          onViewProfile={onViewProfile}
	          onNotificationsChanged={onNotificationsChanged}
	          t={t}
	          embedded
	        />
	      )}

	      {currentProfileId && !state.loading && showingFriends && activeRows.length > 0 && (
	        <div className="discover-grid">
	          {activeRows.map((friend) => (
	            <article className="discover-card" key={friend.connection_id}>
	              <div className="avatar">{displayInitial(friend.teammate_full_name)}</div>
	              <h3>{displayName(friend.teammate_full_name)} {friend.teammate_is_demo && <DemoBadge />}</h3>
	              <p>{friend.teammate_university || 'RMIT University'}</p>
	              <p>{formatSchoolMajorLine(friend.teammate_school, friend.teammate_major)}</p>
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
                  {tab === 'connected' && `${localizedConnectionRelationshipLabel(request, t)} · ${t('connections.connectedWith', { name: displayName(request.teammate_full_name) })}`}
                  {tab === 'declined' && (
                    request.status === 'unmatched'
                      ? t('connections.endedWith', { name: displayName(request.teammate_full_name) })
                      : t('connections.declinedWith', { name: displayName(request.teammate_full_name) })
                  )}
                </p>
                <h3>{displayName(request.teammate_full_name)} {(request.teammate_is_demo || request.teammate_full_name?.includes('(Demo)')) && <DemoBadge />}</h3>
                <p>{formatSchoolMajorLine(request.teammate_school, request.teammate_major)}</p>
                {getCourseFilterValue(request) ? (
                  <p>{getCourseDisplay(request)} | {getSessionDisplay(request)}</p>
                ) : (
                  <p>{t('connections.discoverConnection')}</p>
                )}
                {request.intro_message && <blockquote className="intro-message">{request.intro_message}</blockquote>}
                {request.sender_team_request_id && state.currentRequest && (
                  <div className="score inline-score">
                    <Sparkles size={16} />
                    {t('matches.matchPercent', { score: calculateMatchScore(state.currentRequest.profile, state.currentRequest, {
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
                    }) })}
                  </div>
                )}
                <div className="connection-skills-summary">
                  <div className="mini-detail">
                    <strong>{t('matches.skillsHave')}</strong>
                    <SkillList items={request.teammate_skills} />
                  </div>
                  <div className="mini-detail">
                    <strong>{t('matches.lookingFor')}</strong>
                    <SkillList items={request.skills_needed} />
                  </div>
                </div>
              </div>
              <div className="connection-actions">
                <span className={`status-badge ${request.status}`}>{connectionStatusLabel(request.status, tab, t)}</span>
                {request.status === 'accepted' && <ConnectionRelationshipBadge connection={request} t={t} />}
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
	          t={t}
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

function FriendsPage({ currentProfileId, onOpenChat, onViewProfile, t = translate.bind(null, 'en') }) {
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
        error: t('connections.loadFriendsFail'),
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
        success: t('connections.friendRemoved', { name: displayName(target.teammate_full_name) }),
      }));
      loadFriends();
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: t('connections.removeFriendFail'),
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
        success: t('connections.friendMatched', { name: displayName(target.teammate_full_name), request: option.course_name || t('connections.thisRequest') }),
      }));
      loadFriends();
    } catch (err) {
      setState((current) => ({
        ...current,
        saving: false,
        error: getFriendlyError(err, t('connections.friendMatchFail')),
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
          <p className="eyebrow">{t('connections.friends')}</p>
          <h2>{t('connections.discoverFriends')}</h2>
        </div>
      </div>
      {!currentProfileId && <section className="empty-state"><p>{t('connections.needProfile')}</p></section>}
      {state.loading && currentProfileId && <p className="loading">{t('connections.loadingFriends')}</p>}
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">{state.success}</p>}
      {!state.loading && currentProfileId && state.friends.length === 0 && (
        <section className="empty-state">
          <p>{t('connections.noneFriends')}</p>
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
                {hasSuitableOption && <span className="status-badge suitable">{t('connections.suitable')}</span>}
              </h3>
              <p>{universityLabel(friend.teammate_university)}</p>
              <p>{formatSchoolMajorLine(friend.teammate_school, friend.teammate_major)}</p>
              <div className="mini-detail">
                <strong>{t('matches.skills')}</strong>
                <span>{joinList(friend.teammate_skills)}</span>
              </div>
              <div className="hero-actions">
                <button
                  className="primary match-plus-button"
                  title={t('connections.matchPlusTitle')}
                  onClick={() => openMatchPlus(friend, matchOptions)}
                >
                  <Sparkles size={18} />
                  {t('connections.matchPlus')}
                </button>
                <button className="primary" onClick={() => onOpenChat(friend.connection_id)}>
                  <MessageCircle size={18} />
                  {t('common.message')}
                </button>
                <button className="secondary" onClick={() => onViewProfile(friend.teammate_profile_id)}>
                  {t('common.viewProfile')}
                </button>
                <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, removeTarget: friend }))}>
                  {t('connections.removeFriend')}
                </button>
              </div>
              {!canMatch && <p className="note">{t('connections.matchPlusNeedsRequest')}</p>}
              {canMatch && !hasSuitableOption && <p className="note">{t('connections.matchPlusStillAllowed')}</p>}
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      )}
      {state.matchTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('connections.matchPlusConfirmLabel')}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Match+</p>
                <h2>{t('connections.matchWith', { name: displayName(state.matchTarget.teammate_full_name) })}</h2>
              </div>
              <button
                className="ghost"
                onClick={() => setState((current) => ({ ...current, matchTarget: null, selectedMatchIndex: 0 }))}
                type="button"
              >
                {t('common.close')}
              </button>
            </div>
            {(state.matchTarget.match_options || []).length > 0 && (
              <label>
                {t('connections.chooseMatchRequest')}
                <select
                  value={state.selectedMatchIndex}
                  onChange={(event) => setState((current) => ({ ...current, selectedMatchIndex: Number(event.target.value) }))}
                >
                  {state.matchTarget.match_options.map((option, index) => (
                    <option value={index} key={`${option.current_request_id}-${option.friend_request_id || 'friend-optional'}`}>
                      {option.course_name || t('class.course')} {option.course_code ? `(${option.course_code})` : ''} | {getSessionDisplay(option)}{option.is_suitable ? ` · ${t('connections.suitable')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(state.matchTarget.match_options || []).length === 0 && (
              <div className="request-summary-box">
                <p className="eyebrow">{t('connections.noActiveRequest')}</p>
                <h3>{t('connections.createOrReopen')}</h3>
                <p className="note">{t('connections.matchPlusRequestHelper')}</p>
              </div>
            )}
            {(() => {
              const option = state.matchTarget.match_options?.[state.selectedMatchIndex] || state.matchTarget.match_options?.[0];
              return option ? (
                <div className="request-summary-box">
                  <p className="eyebrow">{option.is_suitable ? t('connections.suitableForRequest') : t('connections.selectedRequest')}</p>
                  <h3>{option.course_name || t('connections.selectedCourse')} {option.course_code ? `(${option.course_code})` : ''}</h3>
                  <p>{getSessionDisplay(option)}</p>
                  {!option.is_suitable && <p className="note">{t('connections.weakSignal')}</p>}
                </div>
              ) : null;
            })()}
            <div className="hero-actions">
              <button
                className="secondary"
                onClick={() => setState((current) => ({ ...current, matchTarget: null, selectedMatchIndex: 0 }))}
                type="button"
              >
                {t('common.cancel')}
              </button>
              <button
                className="primary match-plus-button"
                onClick={confirmMatchPlus}
                disabled={state.saving || !(state.matchTarget.match_options || []).length}
              >
                {state.saving ? t('connections.matching') : t('connections.confirmMatch')}
              </button>
            </div>
          </section>
        </div>
      )}
      {state.removeTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="connect-modal" role="dialog" aria-modal="true" aria-label={t('connections.removeFriendConfirmLabel')}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{t('connections.removeFriend')}</p>
                <h2>{t('connections.removeFriendQuestion', { name: displayName(state.removeTarget.teammate_full_name) })}</h2>
              </div>
              <button className="ghost" onClick={() => setState((current) => ({ ...current, removeTarget: null }))} type="button">{t('common.close')}</button>
            </div>
            <p className="note">{t('connections.removeFriendHelper')}</p>
            <div className="hero-actions">
              <button className="secondary" onClick={() => setState((current) => ({ ...current, removeTarget: null }))} type="button">
                {t('common.cancel')}
              </button>
              <button className="primary danger-action" onClick={() => removeFriend()} disabled={state.saving}>
                {state.saving ? t('connections.removingFriend') : t('connections.removeFriend')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function MessagesList({ currentProfileId, onOpenChat, onViewProfile, onNotificationsChanged, t = translate.bind(null, 'en'), embedded = false }) {
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
            error: t('messages.loadListFail'),
            threads: [],
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [currentProfileId]);

  const Shell = embedded ? 'section' : 'main';

  return (
    <Shell className={embedded ? 'messages-tab-panel' : 'screen compact'}>
      {!embedded && (
        <div className="results-header">
          <div>
            <p className="eyebrow">{t('messages.title')}</p>
            <h2>{t('messages.accepted')}</h2>
          </div>
        </div>
      )}

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
    </Shell>
  );
}

function ChatPage({ connectionId, currentProfileId, currentRequestId, onBack, onViewProfile, onNotificationsChanged, t = translate.bind(null, 'en') }) {
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
  const conversationOpenTrackedRef = useRef(new Set());

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
          error: t('messages.connectionRequired'),
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
      const trackingKey = `${currentProfileId}:${connectionId}`;
      if (!quiet && !conversationOpenTrackedRef.current.has(trackingKey)) {
        conversationOpenTrackedRef.current.add(trackingKey);
        void trackProductEvent('conversation_opened', {
          profileId: currentProfileId,
          entityType: 'connection',
          entityId: connectionId,
          metadata: {
            status: detail.status,
            teammate_profile_id: detail.teammate_profile_id,
          },
          dedupeKey: `conversation_opened:${trackingKey}`,
        });
      }
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        error: t('messages.loadFail'),
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
      const firstMessageFromCurrentProfile = !state.messages.some((message) =>
        message.sender_profile_id === currentProfileId
      );
      const message = await sendChatMessage({
        connectionId,
        senderProfileId: currentProfileId,
        messageText: body,
      });
      void trackProductEvent('message_sent', {
        profileId: currentProfileId,
        entityType: 'message',
        entityId: message.id,
        metadata: {
          connection_id: connectionId,
          current_request_id: currentRequestId || null,
        },
        dedupeKey: message.id ? `message_sent:${message.id}` : null,
      });
      if (firstMessageFromCurrentProfile) {
        void trackProductEvent('first_message_sent', {
          profileId: currentProfileId,
          entityType: 'message',
          entityId: message.id,
          metadata: {
            connection_id: connectionId,
            current_request_id: currentRequestId || null,
          },
          dedupeKey: message.id ? `first_message_sent:${message.id}` : null,
        });
      }
      setMessageText('');
      setState((current) => ({
        ...current,
        sending: false,
        messages: mergeMessagesById(current.messages, [message]),
      }));

      if (state.detail?.teammate_is_demo) {
        const replyText = t(`messages.demoReply${(state.messages.length % 4) + 1}`);
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
              error: t('ui.demoReplyFail'),
            }));
          }
        }, 900);
      }
    } catch {
      setState((current) => ({
        ...current,
        sending: false,
        error: t('ui.messageSendFail'),
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
        actionSuccess: t('ui.unmatchSuccess', { name: displayName(current.detail?.teammate_full_name) || t('connections.teammate') }),
      }));
    } catch {
      setState((current) => ({
        ...current,
        unmatchSaving: false,
        actionError: t('connections.unmatchFail'),
      }));
    }
  };

  const chatEnded = state.detail?.status === 'unmatched';

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        {t('common.back')}
      </button>

      <section className="chat-shell">
        <div className="chat-header">
          <div>
            <h2>{displayName(state.detail?.teammate_full_name) || t('ui.conversation')}</h2>
            <p>
              {state.detail?.teammate_is_demo
                ? t('ui.demoConversation')
                : state.detail?.status === 'accepted'
                  ? connectedButtonLabel(state.detail, t)
                  : chatEnded
                    ? t('connections.connectionEnded')
                    : t('messages.connectionRequired')}
            </p>
          </div>
          <div className="chat-header-actions">
            {state.detail?.teammate_profile_id && (
              <button className="secondary" onClick={() => onViewProfile(state.detail.teammate_profile_id)}>
                {t('common.viewProfile')}
              </button>
            )}
            {state.detail?.status === 'accepted' && (
              <button className="secondary quiet-action" onClick={() => setState((current) => ({ ...current, unmatchOpen: true, actionError: '' }))}>
                {t('common.unmatch')}
              </button>
            )}
          </div>
        </div>

        {chatEnded && <p className="note">{t('ui.connectionEnded')}</p>}
        {state.actionSuccess && <p className="success">{state.actionSuccess}</p>}
        {state.actionError && <p className="error">{state.actionError}</p>}
        {state.loading && <p className="loading">{t('ui.loadingChat')}</p>}
        {state.error && <p className="error">{state.error}</p>}

        {!state.loading && !state.error && (
          <>
            <div className="message-window">
              {state.messages.length === 0 && (
                <div className="empty-state inline-empty">
                  <p>{t('messages.none')}</p>
                </div>
              )}
              {state.messages.map((message) => {
                const mine = message.sender_profile_id === currentProfileId;
                return (
                  <div className={mine ? 'message-bubble mine' : 'message-bubble'} key={message.id}>
                    <span>{mine ? t('ui.you') : displayName(state.detail.teammate_full_name)}</span>
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
                placeholder={chatEnded ? t('ui.connectionEnded') : t('ui.typeMessage')}
                disabled={chatEnded}
              />
              <button className="primary" onClick={send} disabled={!messageText.trim() || state.sending || chatEnded}>
                <SendHorizontal size={18} />
                {state.sending ? t('matches.sending') : t('common.send')}
              </button>
            </div>
          </>
        )}
      </section>
      {state.unmatchOpen && (
        <UnmatchModal
          teammateName={displayName(state.detail?.teammate_full_name) || t('connections.teammate')}
          saving={state.unmatchSaving}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, unmatchOpen: false, actionError: '' }))}
          onConfirm={unmatch}
          t={t}
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
  academicValues = emptyAcademicValues,
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
  const [fieldErrors, setFieldErrors] = useState({});
  const currentRole = activeRole === 'lecturer' ? 'lecturer' : 'student';
  const editingAsLecturer = form.role === 'lecturer';
  const authEmail = getAuthSessionEmail(authSession);
  const signedInWithGoogle = hasGoogleAuthSession(authSession);
  const resolvedUniversity = resolveProfileUniversity(form);
  const usesOtherUniversity = isOtherUniversityForm(form);
  const isRequiredField = (field) => isProfileFieldRequired(form, field);
  const profileSkillOptions = mergeOptionSets(
    getProfileSkillSuggestions({ major: form.major, school: form.school }),
    form.skills,
  );
  const profileUniversityComboOptions = mergeAcademicOptions(universityOptions, academicValues.universities);
  const profileSchoolOptions = getSchoolsForUniversity(resolvedUniversity);
  const profileSchoolComboOptions = mergeAcademicOptions(profileSchoolOptions, academicValues.schools).map((school) => ({
    value: school.value,
    label: localizedOption(school.value, 'options.school', t),
  }));
  const profileMajorValues = mergeOptionSets(
    ...Object.values(majorsBySchool),
    form.major === OTHER_OPTION_VALUE ? '' : form.major,
    ...academicValues.majors,
  );
  const profileMajorComboOptions = profileMajorValues.map((major) => ({
    value: major,
    label: localizedOption(major, 'options.major', t),
  }));
  const profileSubjectComboOptions = mergeAcademicOptions(
    opportunityFields.filter((field) => field !== 'Other'),
    academicValues.subjects.filter((field) => field !== 'Other'),
  ).map((field) => ({
    value: field.value,
    label: localizedOption(field.value, 'options.field', t),
  }));

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
            error: t('profile.reviewsLoadFail'),
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
    const knownSchool = schoolOptions.some((option) => option.value === profile.school);
    const school = knownSchool || !profile.school ? profile.school || '' : OTHER_OPTION_VALUE;
    const roleForEdit = currentRole;
    setForm({
      role: roleForEdit,
      full_name: profile.full_name || '',
      university: profile.university || 'RMIT University',
      university_choice: getUniversityChoice(profile.university || 'RMIT University'),
      custom_university: getUniversityChoice(profile.university || 'RMIT University') === OTHER_UNIVERSITY_VALUE
        ? profile.university || ''
        : '',
      school,
      custom_school: knownSchool ? '' : profile.school || '',
      major: roleForEdit === 'lecturer'
        ? 'Lecturer'
        : school && majorsBySchool[school]?.includes(profile.major) ? profile.major : profile.major || '',
      custom_major: '',
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
	      custom_subject: profile.academic_field && !opportunityFields.includes(profile.academic_field)
        ? profile.academic_field
        : '',
	      lecturer_contact_method: profile.lecturer_contact_method || 'Email',
	      lecturer_contact_detail: profile.lecturer_contact_detail || profile.contact_value || '',
	      student_id: profile.student_id || '',
	      is_available: profile.is_available ?? true,
      subscription_status: profile.subscription_status || 'free',
      consent_public_visibility: profile.consent_public_visibility ?? true,
    });
    setMessage('');
    setError('');
    setFieldErrors({});
    setEditing(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const updateSchool = (value) => {
    setForm((current) => ({
      ...current,
      school: value,
      custom_school: value === OTHER_OPTION_VALUE ? current.custom_school : '',
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
    }));
    setFieldErrors((current) => ({ ...current, school: '', major: '', skills: '' }));
  };

  const updateCustomSchool = (value) => {
    setForm((current) => ({ ...current, school: OTHER_OPTION_VALUE, custom_school: value }));
    setFieldErrors((current) => ({ ...current, school: '' }));
  };

  const updateSubject = (value) => {
    setForm((current) => ({
      ...current,
      academic_field: value,
      custom_subject: value === OTHER_OPTION_VALUE ? current.custom_subject : '',
    }));
    setFieldErrors((current) => ({ ...current, academic_field: '' }));
  };

  const updateMajor = (value) => {
    setForm((current) => ({
      ...current,
      major: value,
      custom_major: value === OTHER_OPTION_VALUE ? current.custom_major : '',
    }));
    setFieldErrors((current) => ({ ...current, major: '' }));
  };

  const updateCustomMajor = (value) => {
    setForm((current) => ({ ...current, major: OTHER_OPTION_VALUE, custom_major: value }));
    setFieldErrors((current) => ({ ...current, major: '' }));
  };

  const updateCustomSubject = (value) => {
    setForm((current) => ({ ...current, academic_field: OTHER_OPTION_VALUE, custom_subject: value }));
    setFieldErrors((current) => ({ ...current, academic_field: '' }));
  };

  const updateUniversityChoice = (value) => {
    setForm((current) => ({
      ...current,
      university_choice: value,
      custom_university: value === OTHER_UNIVERSITY_VALUE ? current.custom_university : '',
      university: value === OTHER_UNIVERSITY_VALUE ? current.custom_university : value,
      school: isRmitUniversity(value) ? current.school : '',
      major: isRmitUniversity(value) ? current.major : '',
    }));
    setFieldErrors((current) => ({ ...current, university: '', school: '', major: '' }));
  };

  const updateCustomUniversity = (value) => {
    setForm((current) => ({
      ...current,
      university_choice: OTHER_UNIVERSITY_VALUE,
      custom_university: value,
      university: value,
    }));
    setFieldErrors((current) => ({ ...current, university: '', custom_university: '' }));
  };

  const toggleProfileSkill = (skill) => {
    setForm((current) => ({
      ...current,
      skills: toggleValue(current.skills, skill),
      other_skill: skill === 'Other' && current.skills.includes('Other') ? '' : current.other_skill,
    }));
    setFieldErrors((current) => ({ ...current, skills: '' }));
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
    setFieldErrors({});
  };

  const submitLecturerLogin = (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const account = findDemoLecturerAccount(lecturerForm.university, lecturerForm.lecturerId);
    if (!account) {
      setError(t('profile.lecturerIdNotFound', { hint: demoLecturerHelperText }));
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
    setFieldErrors({});

    const skills = getProfileSkillsFromForm(form);
	    const nextFieldErrors = getProfileFieldErrors({ ...form, skills }, t);
	    setFieldErrors(nextFieldErrors);
	    if (Object.keys(nextFieldErrors).length > 0) {
      setError(t('validation.fixMissing'));
      return;
    }

    setSaving(true);

    try {
      const updated = await updateProfile(profile.id, {
        full_name: form.full_name.trim(),
        university: resolveProfileUniversity(form) || 'RMIT University',
        school: getFormSchoolValue(form),
        major: editingAsLecturer ? 'Lecturer' : getFormMajorValue(form),
        skills: editingAsLecturer ? ['Teaching'] : skills,
        avatar_url: form.avatar_url || null,
        availability: [],
        preferred_active_time: null,
        work_styles: editingAsLecturer ? [] : form.work_styles,
	        contact_type: editingAsLecturer ? 'email' : form.contact_type,
	        contact_value: editingAsLecturer ? form.lecturer_contact_detail.trim() : form.contact_value.trim(),
        short_bio: editingAsLecturer
          ? form.short_bio.trim() || t('profile.lecturerBioDefault')
          : form.short_bio.trim(),
	        is_available: profile.is_available ?? !editingAsLecturer,
	        role: editingAsLecturer ? 'lecturer' : 'student',
	        lecturer_title: editingAsLecturer ? form.lecturer_title.trim() || null : null,
	        lecturer_id: editingAsLecturer ? form.lecturer_id.trim() : null,
        academic_field: editingAsLecturer ? getFormSubjectValue(form) : getFormMajorValue(form),
	        lecturer_contact_method: editingAsLecturer ? form.lecturer_contact_method : null,
	        lecturer_contact_detail: editingAsLecturer ? form.lecturer_contact_detail.trim() : null,
	        student_id: editingAsLecturer ? null : form.student_id || null,
        subscription_status: form.subscription_status || 'free',
	      });
      void trackProductEvent('profile_updated', {
        profileId: updated.id,
        entityType: 'profile',
        entityId: updated.id,
        metadata: {
          role: editingAsLecturer ? 'lecturer' : 'student',
        },
      });
      onProfileUpdated(updated);
      setEditing(false);
      setMessage(t('profile.updated'));
    } catch (err) {
      setError(getFriendlyError(err, t('profile.updateFail')));
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
                <p className="required-note">{t('profile.requiredNote')}</p>
                <div className="form-grid single">
                  <label>
                    <FieldLabel required={isRequiredField('full_name')}>{t('profile.fullName')}</FieldLabel>
                    <input value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
                    <FieldError message={fieldErrors.full_name} />
                  </label>
                  <label>
                    <FieldLabel required={isRequiredField('university')}>{t('profile.university')}</FieldLabel>
                    <SearchableCombobox
                      value={form.university_choice}
                      options={profileUniversityComboOptions.map((university) => ({
                        value: university.value,
                        label: localizedOption(university.value, 'options.university', t),
                      }))}
                      onSelect={updateUniversityChoice}
                      onCustom={updateCustomUniversity}
                      placeholder={t('profile.searchUniversity')}
                      otherLabel={t('profile.otherUniversity')}
                      addLabel={t('profile.addValue')}
                      noResultsLabel={t('profile.noResults')}
                      otherValue={OTHER_UNIVERSITY_VALUE}
                      t={t}
                    />
                    <FieldError message={fieldErrors.university} />
                  </label>
                  {usesOtherUniversity && (
                    <label>
                      <FieldLabel required={isRequiredField('custom_university')}>{t('profile.universityName')}</FieldLabel>
                      <input
                        value={form.custom_university}
                        onChange={(event) => updateCustomUniversity(event.target.value)}
                        placeholder={t('profile.universityNamePlaceholder')}
                        required
                      />
                      <FieldError message={fieldErrors.university} />
                    </label>
                  )}
                  {(editingAsLecturer || !usesOtherUniversity) && (
                  <label>
                    <FieldLabel required={isRequiredField('school')}>{editingAsLecturer ? t('profile.department') : t('profile.school')}</FieldLabel>
                    <SearchableCombobox
                      value={form.school}
                      options={profileSchoolComboOptions}
                      onSelect={updateSchool}
                      placeholder={t('profile.searchSchool')}
                      otherLabel={t('profile.other')}
                      addLabel={t('profile.addValue')}
                      noResultsLabel={t('profile.noResults')}
                      t={t}
                    />
                    {form.school === OTHER_OPTION_VALUE && (
                      <input
                        value={form.custom_school}
                        onChange={(event) => updateCustomSchool(event.target.value)}
                        placeholder={t('profile.enterSchool')}
                        required
                      />
                    )}
                    <FieldError message={fieldErrors.school} />
                  </label>
                  )}
	                  {editingAsLecturer ? (
	                    <>
                      <label>
                        <FieldLabel>{t('profile.lecturerTitle')}</FieldLabel>
	                        <input
	                          value={form.lecturer_title}
	                          onChange={(event) => updateField('lecturer_title', event.target.value)}
                          placeholder={t('profile.lecturerTitlePlaceholder')}
	                        />
	                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('academic_field')}>{t('profile.subject')}</FieldLabel>
                        <SearchableCombobox
                          value={form.academic_field}
                          options={profileSubjectComboOptions}
                          onSelect={updateSubject}
                          placeholder={t('profile.searchSubject')}
                          otherLabel={t('profile.other')}
                          addLabel={t('profile.addValue')}
                          noResultsLabel={t('profile.noResults')}
                          t={t}
                        />
                        {form.academic_field === OTHER_OPTION_VALUE && (
                          <input
                            value={form.custom_subject}
                            onChange={(event) => updateCustomSubject(event.target.value)}
                            placeholder={t('profile.enterSubject')}
                            required
                          />
                        )}
                        <FieldError message={fieldErrors.academic_field} />
                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('lecturer_id')}>{t('profile.lecturerId')}</FieldLabel>
	                        <input
	                          value={form.lecturer_id}
	                          onChange={(event) => updateField('lecturer_id', event.target.value)}
                          placeholder={t('profile.lecturerIdPlaceholder')}
	                          required
	                        />
                        <span className="field-helper">{t('profile.demoLecturerIds')}: {demoLecturerHelperText}</span>
                        <FieldError message={fieldErrors.lecturer_id} />
                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('lecturer_contact_method')}>{t('profile.preferredContact')}</FieldLabel>
	                        <select
	                          value={form.lecturer_contact_method}
	                          onChange={(event) => updateField('lecturer_contact_method', event.target.value)}
	                          required
	                        >
                          {lecturerContactMethods.map((method) => (
                            <option value={method} key={method}>{localizedOption(method, 'options.lecturerContact', t)}</option>
                          ))}
	                        </select>
	                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('lecturer_contact_detail')}>{t('profile.contactDetail')}</FieldLabel>
	                        <input
	                          value={form.lecturer_contact_detail}
	                          onChange={(event) => updateField('lecturer_contact_detail', event.target.value)}
                          placeholder={t('profile.lecturerContactPlaceholder')}
                          required
                        />
                        <FieldError message={fieldErrors.lecturer_contact_detail} />
	                      </label>
	                    </>
	                  ) : (
	                    <>
                      <label>
                        <FieldLabel required={isRequiredField('major')}>{t('profile.major')}</FieldLabel>
                        <SearchableCombobox
                          value={form.major}
                          options={profileMajorComboOptions}
                          onSelect={updateMajor}
                          onCustom={updateCustomMajor}
                          placeholder={t('profile.searchMajor')}
                          otherLabel={t('profile.other')}
                          addLabel={t('profile.addValue')}
                          noResultsLabel={t('profile.noResults')}
                          t={t}
                        />
                        {form.major === OTHER_OPTION_VALUE && (
                          <input
                            value={form.custom_major}
                            onChange={(event) => updateCustomMajor(event.target.value)}
                            placeholder={t('profile.enterMajor')}
                            required
                          />
                        )}
                        <FieldError message={fieldErrors.major} />
                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('student_id')}>{t('profile.studentId')}</FieldLabel>
	                        <input
	                          value={form.student_id}
	                          onChange={(event) => updateField('student_id', event.target.value)}
                          placeholder={t('profile.studentIdPlaceholder')}
                          required
                        />
                        <FieldError message={fieldErrors.student_id} />
	                      </label>
	                      <fieldset className="wide">
                        <legend><FieldLabel required={isRequiredField('skills')}>{t('profile.skills')}</FieldLabel></legend>
                        <p className="field-helper">{t('profile.skillHelper')}</p>
                        <CheckboxGrid
                          options={profileSkillOptions}
                          selected={form.skills}
                          onToggle={toggleProfileSkill}
                          labelFor={(option) => localizedOption(option, 'options.skill', t)}
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
                          labelFor={(option) => localizedOption(option, 'options.workStyle', t)}
                        />
                      </fieldset>
                      <label>
                        {t('premium.subscription')}
                        <select value={form.subscription_status} onChange={(event) => updateField('subscription_status', event.target.value)}>
                          <option value="free">{t('premium.free')}</option>
                          <option value="premium">{t('premium.premium')}</option>
                        </select>
                        <span className="field-helper">{t('premium.demoHelper')}</span>
                      </label>
                    </>
                  )}
	                  {!editingAsLecturer && (
	                    <>
                      <label>
                        <FieldLabel>{t('profile.contactMethod')}</FieldLabel>
	                        <select value={form.contact_type} onChange={(event) => updateField('contact_type', event.target.value)}>
                          {contactTypes.map((type) => (
                            <option value={type} key={type}>{localizedOption(type, 'options.contact', t)}</option>
	                          ))}
	                        </select>
	                      </label>
                      <label>
                        <FieldLabel required={isRequiredField('contact_value')}>{t('profile.contactInfo')}</FieldLabel>
	                        <input
	                          value={form.contact_value}
	                          onChange={(event) => updateField('contact_value', event.target.value)}
                          placeholder={t('profile.contactPlaceholder')}
                          required
                        />
                        <FieldError message={fieldErrors.contact_value} />
	                      </label>
	                    </>
	                  )}
                  <label>
                    <FieldLabel required={isRequiredField('short_bio')}>{editingAsLecturer ? t('profile.bioNote') : t('profile.shortBio')}</FieldLabel>
                    <textarea
                      value={form.short_bio}
                      onChange={(event) => updateField('short_bio', event.target.value)}
                      rows="4"
                      required={!editingAsLecturer}
                    />
                    {!editingAsLecturer && <FieldError message={fieldErrors.short_bio} />}
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
                    <div><dt>{t('premium.subscription')}</dt><dd>{subscriptionLabel(profile, t)} {isPremiumProfile(profile) && <PremiumBadge t={t} />}</dd></div>
                  <div><dt>{t('profile.university')}</dt><dd>{universityLabel(profile.university)}</dd></div>
                  {hasDisplaySchool(profile.school) && <div><dt>{t('profile.school')}</dt><dd>{schoolLabel(profile.school)}</dd></div>}
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
                    viewerProfile={profile}
                    t={t}
                  />
                )}
                {message && <p className="success">{message}</p>}
                <div className="stacked-actions profile-actions">
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
                  {hasDisplaySchool(profile.school) && <div><dt>{t('profile.department')}</dt><dd>{schoolLabel(profile.school)}</dd></div>}
                  <div><dt>{t('profile.subject')}</dt><dd>{profile.academic_field || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.lecturerId')}</dt><dd>{profile.lecturer_id || lecturerSession?.lecturerId || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.contact')}</dt><dd>{profile.lecturer_contact_detail || profile.contact_value || t('common.notSpecified')}</dd></div>
                  <div><dt>{t('profile.bio')}</dt><dd>{profile.short_bio || t('common.notSpecified')}</dd></div>
                </dl>
                {message && <p className="success">{message}</p>}
                {error && <p className="error">{error}</p>}
                <div className="stacked-actions profile-actions">
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
  const [academicValues, setAcademicValues] = useState(emptyAcademicValues);
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
  const [appTheme, setAppTheme] = useState(() => getPreferredLandingTheme());
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
    if (!hasSupabaseConfig || !supabase) return undefined;
    let alive = true;
    getDiscoverProfiles()
      .then((profiles) => {
        if (alive) setAcademicValues(getAcademicValuesFromProfiles(profiles));
      })
      .catch(() => {
        // Static catalog values remain available when dynamic loading is unavailable.
      });
    return () => {
      alive = false;
    };
  }, []);

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
      getProfileById(storedProfileId, { claimLegacy: true, ownedOnly: true })
        .then(setProfile)
        .catch(() => {
          clearProfileId();
          clearCurrentRequest();
          setProfileId('');
          setRequestId('');
          setProfile(null);
        });
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
          const storedProfile = await getProfileById(storedProfileId, { claimLegacy: true, ownedOnly: true });
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
          return;
        } catch {
          if (!alive) return;
          clearProfileId();
          clearCurrentRequest();
          setProfileId('');
          setRequestId('');
          setProfile(null);
        }
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
    return t('errors.supabaseConfig');
  }, [t]);

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

  const toggleAppTheme = () => {
    setAppTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      storeLandingTheme(nextTheme);
      return nextTheme;
    });
  };

	  const continueWithExistingGoogleSession = async (session, nextRole) => {
	    setAuthSession(session);
	    let ownedProfile = null;
	    const storedProfileId = getStoredProfileId();
	    const sessionEmail = getAuthSessionEmail(session);

	    try {
	      if (storedProfileId) {
	        ownedProfile = await getProfileById(storedProfileId, { claimLegacy: true, ownedOnly: true }).catch(() => {
	          clearProfileId();
	          clearCurrentRequest();
	          return null;
	        });
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
      setBootError(getFriendlyError(err, t('profile.logoutFail')));
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
      const loadedProfile = await getProfileById(profileId, { claimLegacy: true, ownedOnly: true });
      setProfile(loadedProfile);
      navigate(currentRole === 'lecturer' ? (lecturerSession ? 'lecturer' : 'my-profile') : 'request');
    } catch {
      clearProfileId();
      clearCurrentRequest();
      setProfileId('');
      setRequestId('');
      setProfile(null);
      setBootError(t('profile.loadSavedFail'));
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

  const activeNavGroups = {
    'my-classes': ['my-classes', 'join-class', 'class-detail'],
    discover: ['discover', 'discover-profile'],
    lecturer: ['lecturer'],
    'current-request': ['current-request', 'request', 'matches', 'profile-detail', 'found'],
    connections: ['connections', 'messages', 'chat'],
    'my-profile': ['my-profile', 'profile', 'profile-saved'],
  };
  const navButtonClass = (targetView, extraClass = '') => [
    'ghost',
    extraClass,
    activeNavGroups[targetView]?.includes(view) ? 'active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`app theme-${appTheme} view-${view}${view === 'home' ? ` landing-mode landing-${appTheme}` : ''}`}
      data-theme={appTheme}
    >
      <header className="topbar">
        <button className="logo-button" onClick={() => navigate('home')}>
          <span className="brand-logo">
            <span className="brand-blue">TEAM</span><span className="brand-red">ERGENCY</span>
          </span>
        </button>
	        <div className="top-actions">
	          <div className="language-switch" aria-label={t('ui.language')}>
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
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleAppTheme}
              aria-label={appTheme === 'dark' ? t('ui.switchToLight') : t('ui.switchToDark')}
              title={appTheme === 'dark' ? t('ui.lightMode') : t('ui.darkMode')}
            >
              {appTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
	          {view === 'home' ? (
	            <>
	              <button className={navButtonClass('my-profile', 'nav-outline')} onClick={() => navigate('my-profile')}>{t('nav.myProfile')}</button>
	            </>
	          ) : (
	            <>
	              {showStudentNavigation && <button className={navButtonClass('my-classes')} onClick={() => navigate('my-classes')}>{t('nav.myClasses')}</button>}
	              {showStudentNavigation && <button className={navButtonClass('discover')} onClick={() => navigate('discover')}>{t('nav.discover')}</button>}
	              {showLecturerNavigation && <button className={navButtonClass('lecturer')} onClick={() => navigate('lecturer')}>{t('nav.lecturer')}</button>}
	              {showStudentNavigation && profileId && <button className={navButtonClass('current-request')} onClick={() => navigate('current-request')}>{t('nav.openOpportunities')}</button>}
	              {showStudentNavigation && <button className={navButtonClass('connections')} onClick={() => navigate('connections')}>{t('nav.connections')}{notificationCounts.connections > 0 && <span className="nav-badge">{notificationCounts.connections}</span>}</button>}
	              {showLecturerNavigation && <button className={navButtonClass('connections')} onClick={() => navigate('messages')}>{t('nav.messages')}{notificationCounts.messages > 0 && <span className="nav-badge">{notificationCounts.messages}</span>}</button>}
	              <button className={navButtonClass('my-profile')} onClick={() => navigate('my-profile')}>{t('nav.myProfile')}</button>
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
            academicValues={academicValues}
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
              navigate('class-detail');
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
	          onViewCurrent={(currentRequest) => {
              selectCurrentRequest(currentRequest.id);
              if (currentRequest.class_id) {
                openClass(currentRequest.class_id);
              } else {
                navigate('current-request');
              }
            }}
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
          currentProfile={profile}
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
          onOpenProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            navigate('discover-profile');
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
          t={t}
        />
      )}

      {view === 'discover-profile' && selectedDiscoverProfileId && (
        <DiscoverProfileDetail
          profileId={selectedDiscoverProfileId}
          currentProfileId={profileId}
          currentProfile={profile}
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
          t={t}
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
          t={t}
        />
      )}

      {view === 'my-profile' && (
        <MyProfile
	          profile={profile}
	          activeRole={currentRole}
	          authSession={authSession}
	          lecturerSession={lecturerSession}
	          academicValues={academicValues}
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
