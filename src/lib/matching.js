const normalize = (value = '') => String(value || '').trim().toLowerCase();

const toSet = (items = []) =>
  new Set(items.map(normalize).filter(Boolean));

const ratioOverlap = (left = [], right = []) => {
  const leftSet = toSet(left);
  const rightSet = toSet(right);

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  const matches = [...leftSet].filter((item) => rightSet.has(item)).length;
  return matches / Math.max(leftSet.size, rightSet.size);
};

const complementarySkillScore = (currentProfile, currentRequest, candidate) => {
  const candidateProfile = candidate.profile;
  const candidateRequest = candidate;

  const candidateHasWhatUserNeeds = ratioOverlap(
    candidateProfile?.skills,
    currentRequest?.skills_needed,
  );
  const userHasWhatCandidateNeeds = ratioOverlap(
    currentProfile?.skills,
    candidateRequest?.skills_needed,
  );

  if (currentProfile?.skills?.length && candidateRequest?.skills_needed?.length) {
    return (candidateHasWhatUserNeeds + userHasWhatCandidateNeeds) / 2;
  }

  return candidateHasWhatUserNeeds;
};

const courseAliases = (request = {}) =>
  [...new Set([
    request.course_code,
    request.course_name,
    request.course,
  ].map(normalize).filter(Boolean))];

const sessionCodeFromValue = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^session\s*0?(\d{1,2})$/i) || normalized.match(/^0?(\d{1,2})$/);
  return match ? match[1].padStart(2, '0') : '';
};

const sessionKey = (request = {}) => {
  const sessionCode = sessionCodeFromValue(request.session_code || request.class_session);
  if (sessionCode) return `session-${sessionCode}`;
  return normalize(request.class_session || '');
};

const coursesMatch = (left, right) => {
  const leftAliases = courseAliases(left);
  const rightAliases = new Set(courseAliases(right));
  return leftAliases.some((alias) => rightAliases.has(alias));
};

export const calculateMatchScore = (currentProfile, currentRequest, candidate) => {
  const sameCourse = coursesMatch(currentRequest, candidate);
  const sameClass =
    sessionKey(currentRequest) && sessionKey(currentRequest) === sessionKey(candidate);
  const sameMajor =
    normalize(currentRequest?.major || currentProfile?.major || '') ===
    normalize(candidate?.major || candidate?.profile?.major || '');
  const sameSchool =
    normalize(currentRequest?.school || currentProfile?.school || '') ===
    normalize(candidate?.school || candidate?.profile?.school || '');

  const courseScore = sameCourse ? 30 : 0;
  const classScore = sameClass ? 20 : 0;
  const majorScore = sameMajor ? 10 : 0;
  const schoolScore = sameSchool ? 5 : 0;
  const skillScore = complementarySkillScore(currentProfile, currentRequest, candidate) * 30;
  const workStyleScore = ratioOverlap(currentRequest?.work_styles, candidate?.work_styles) * 5;

  return Math.round(Math.min(100, courseScore + classScore + majorScore + schoolScore + skillScore + workStyleScore));
};

export const sortMatches = (matches) =>
  [...matches].sort((a, b) => b.matchScore - a.matchScore || b.created_at.localeCompare(a.created_at));
