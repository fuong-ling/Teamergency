const PROFILE_ID_KEY = 'currentProfileId';
const REQUEST_ID_KEY = 'currentTeamRequestId';
const REQUEST_EDIT_TOKEN_KEY = 'currentTeamRequestEditToken';
const CLASS_ID_KEY = 'currentClassId';
const ACTIVE_ROLE_KEY = 'teamergencyActiveRole';
const PENDING_ROLE_KEY = 'teamergencyPendingRole';
const LOGGED_OUT_KEY = 'teamergencyLoggedOut';
const LECTURER_SESSION_KEY = 'teamergencyDemoLecturerSession';
const LANGUAGE_KEY = 'teamergencyLanguage';

export const getStoredProfileId = () => localStorage.getItem(PROFILE_ID_KEY);

export const storeProfileId = (profileId) => {
  localStorage.setItem(PROFILE_ID_KEY, profileId);
};

export const getStoredRequestId = () => localStorage.getItem(REQUEST_ID_KEY);

export const getStoredRequestEditToken = () =>
  localStorage.getItem(REQUEST_EDIT_TOKEN_KEY);

export const storeCurrentRequest = (requestId, editToken) => {
  localStorage.setItem(REQUEST_ID_KEY, requestId);
  if (editToken) {
    localStorage.setItem(REQUEST_EDIT_TOKEN_KEY, editToken);
  }
};

export const clearCurrentRequest = () => {
  localStorage.removeItem(REQUEST_ID_KEY);
  localStorage.removeItem(REQUEST_EDIT_TOKEN_KEY);
};

export const getStoredClassId = () => localStorage.getItem(CLASS_ID_KEY);

export const storeClassId = (classId) => {
  if (classId) {
    localStorage.setItem(CLASS_ID_KEY, classId);
  }
};

export const getStoredActiveRole = () =>
  localStorage.getItem(ACTIVE_ROLE_KEY) === 'lecturer' ? 'lecturer' : 'student';

export const storeActiveRole = (role) => {
  localStorage.setItem(ACTIVE_ROLE_KEY, role === 'lecturer' ? 'lecturer' : 'student');
};

export const clearActiveRole = () => {
  localStorage.removeItem(ACTIVE_ROLE_KEY);
};

export const getStoredPendingRole = () => {
  const role = localStorage.getItem(PENDING_ROLE_KEY);
  return role === 'lecturer' || role === 'student' ? role : '';
};

export const storePendingRole = (role) => {
  localStorage.setItem(PENDING_ROLE_KEY, role === 'lecturer' ? 'lecturer' : 'student');
};

export const clearPendingRole = () => {
  localStorage.removeItem(PENDING_ROLE_KEY);
};

export const getStoredLoggedOut = () =>
  localStorage.getItem(LOGGED_OUT_KEY) === 'true';

export const storeLoggedOut = () => {
  localStorage.setItem(LOGGED_OUT_KEY, 'true');
};

export const clearLoggedOut = () => {
  localStorage.removeItem(LOGGED_OUT_KEY);
};

export const getStoredLecturerSession = () => {
  try {
    return JSON.parse(localStorage.getItem(LECTURER_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storeLecturerSession = (session) => {
  if (session) {
    localStorage.setItem(LECTURER_SESSION_KEY, JSON.stringify(session));
  }
};

export const clearLecturerSession = () => {
  localStorage.removeItem(LECTURER_SESSION_KEY);
};

export const getStoredLanguage = () =>
  localStorage.getItem(LANGUAGE_KEY) === 'vi' ? 'vi' : 'en';

export const storeLanguage = (language) => {
  localStorage.setItem(LANGUAGE_KEY, language === 'vi' ? 'vi' : 'en');
};

export const createEditToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
