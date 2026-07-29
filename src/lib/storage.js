const PROFILE_ID_KEY = 'currentProfileId';
const REQUEST_ID_KEY = 'currentTeamRequestId';
const REQUEST_EDIT_TOKEN_KEY = 'currentTeamRequestEditToken';

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

export const createEditToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
