const PROFILE_ID_KEY = 'currentProfileId';
const REQUEST_ID_KEY = 'currentTeamRequestId';
const REQUEST_EDIT_TOKEN_KEY = 'currentTeamRequestEditToken';
const CLASS_ID_KEY = 'currentClassId';
const ACTIVE_ROLE_KEY = 'teamergencyActiveRole';
const LECTURER_SESSION_KEY = 'teamergencyDemoLecturerSession';

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

export const createEditToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
