import { calculateMatchScore, sortMatches } from './matching';
import { ensureAnonymousSession, supabase } from './supabase';

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
};

const getAuthenticatedClient = async () => {
  const client = requireSupabase();
  const session = await ensureAnonymousSession();
  return { client, session };
};

export const createProfile = async (profileData) => {
  const { client, session } = await getAuthenticatedClient();
  const { data, error } = await client
    .from('profiles')
    .insert({
      ...profileData,
      is_demo: false,
      owner_id: session.user.id,
      consent_public_visibility: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getProfileById = async (profileId, options = {}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  if (options.claimLegacy) {
    const { data: claimed, error: claimError } = await client.rpc('claim_legacy_profile', {
      requested_profile: profileId,
    });

    if (claimError) throw claimError;
    if (claimed?.length) return claimed[0];
  }

  const { data: publicData, error: publicError } = await client.rpc('get_public_profile', {
    requested_profile: profileId,
  });

  if (publicError) throw publicError;
  if (!publicData?.length) {
    throw new Error('Profile was not found.');
  }

  return publicData[0];
};

export const updateProfile = async (profileId, profileData) => {
  const { client } = await getAuthenticatedClient();
  try {
    await client.rpc('claim_legacy_profile', {
      requested_profile: profileId,
    });
  } catch {
    // New profiles already have an owner; this only helps older local profiles.
  }

  const { data, error } = await client.rpc('update_profile', {
    p_profile_id: profileId,
    p_full_name: profileData.full_name,
    p_school: profileData.school,
    p_major: profileData.major,
    p_skills: profileData.skills,
    p_contact_type: profileData.contact_type,
    p_contact_value: profileData.contact_value,
    p_short_bio: profileData.short_bio,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Profile was not updated.');
  }

  return data[0];
};

export const createTeamRequest = async (profileId, requestData) => {
  const { client } = await getAuthenticatedClient();
  try {
    await client.rpc('claim_legacy_profile', {
      requested_profile: profileId,
    });
  } catch {
    // New profiles already have an owner; this only helps older local profiles.
  }

  const { data, error } = await client.rpc('create_team_request', {
    p_profile_id: profileId,
    p_school: requestData.school,
    p_major: requestData.major,
    p_course: requestData.course,
    p_course_name: requestData.course_name,
    p_course_code: requestData.course_code,
    p_class_session: requestData.class_session,
    p_skills_needed: requestData.skills_needed,
    p_members_needed: requestData.members_needed,
    p_work_styles: requestData.work_styles,
    p_requirements_data: requestData.requirements_data,
    p_requires_portfolio: requestData.requires_portfolio,
    p_portfolio_reference_path: requestData.portfolio_reference_path,
    p_portfolio_reference_name: requestData.portfolio_reference_name,
    p_requirements: requestData.requirements,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team request was not created.');
  }

  return { ...data[0], editToken: data[0].edit_token };
};

const portfolioFileRules = {
  maxSize: 10 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  extensions: ['pdf', 'png', 'jpg', 'jpeg'],
};

const validatePortfolioFile = (file) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!portfolioFileRules.extensions.includes(extension)) {
    throw new Error('Invalid portfolio reference file extension.');
  }

  if (!portfolioFileRules.mimeTypes.includes(file.type)) {
    throw new Error('Invalid portfolio reference file type.');
  }

  if (file.size > portfolioFileRules.maxSize) {
    throw new Error('Portfolio reference file is too large.');
  }

  return extension;
};

const sanitizeFileName = (fileName) =>
  fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

export const uploadPortfolioReference = async (file, profileId) => {
  const { client, session } = await getAuthenticatedClient();
  validatePortfolioFile(file);

  const safeName = sanitizeFileName(file.name) || 'portfolio-reference';
  const randomPart = crypto.randomUUID();
  const path = `${session.user.id}/${profileId}/${Date.now()}-${randomPart}-${safeName}`;
  const { error } = await client.storage
    .from('request-portfolios')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;
  return { path, name: file.name };
};

export const getPortfolioReferenceUrl = (path) => {
  if (!path || !supabase) return '';
  const { data } = supabase.storage.from('request-portfolios').getPublicUrl(path);
  return data?.publicUrl || '';
};

export const getDiscoverProfiles = async () => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_public_profiles');

  if (error) throw error;
  return data || [];
};

export const getActiveTeamRequests = async () => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_active_team_requests');

  if (error) throw error;
  return data;
};

export const getTeamRequestById = async (requestId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_team_request_public', {
    requested_request: requestId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team request was not found.');
  }

  return data[0];
};

export const getMatchesForRequest = async (requestId) => {
  const currentRequest = await getTeamRequestById(requestId);
  const currentProfile = currentRequest.profile;
  const activeRequests = await getActiveTeamRequests();

  const matches = activeRequests
    .filter((request) => request.id !== requestId)
    .filter((request) => request.profile_id !== currentRequest.profile_id)
    .map((request) => ({
      ...request,
      matchScore: calculateMatchScore(currentProfile, currentRequest, request),
    }));

  return {
    currentProfile,
    currentRequest,
    matches: sortMatches(matches),
  };
};

export const markTeamRequestFound = async (requestId, ownershipData) => {
  const { client } = await getAuthenticatedClient();
  const { editToken } = ownershipData;
  const { data, error } = await client.rpc('mark_team_request_found', {
    request_id: requestId,
    request_edit_token: editToken,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Request was not found or edit token is invalid.');
  }

  return data[0];
};

export const sendConnectionRequest = async ({
  senderProfileId,
  receiverProfileId,
  senderTeamRequestId,
  introMessage,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('send_connection_request', {
    sender_profile: senderProfileId,
    receiver_profile: receiverProfileId,
    sender_request: senderTeamRequestId || null,
    intro_message: introMessage || '',
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Connection request was not created.');
  }

  return data[0];
};

export const getConnectionBetween = async (currentProfileId, teammateProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_connection_between', {
    current_profile: currentProfileId,
    teammate_profile: teammateProfileId,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const getConnectionRequests = async (currentProfileId, direction) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_connection_requests', {
    current_profile: currentProfileId,
    direction,
  });

  if (error) throw error;
  return data || [];
};

export const respondConnectionRequest = async ({
  connectionId,
  receiverProfileId,
  status,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('respond_connection_request', {
    connection_request: connectionId,
    receiver_profile: receiverProfileId,
    response_status: status,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Connection request was not updated.');
  }

  return data[0];
};

export const cancelConnectionRequest = async (connectionId, senderProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('cancel_connection_request', {
    connection_request: connectionId,
    sender_profile: senderProfileId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Connection request was not cancelled.');
  }

  return data[0];
};

export const getMessageThreads = async (currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_message_threads', {
    current_profile: currentProfileId,
  });

  if (error) throw error;
  return data || [];
};

export const getConnectionDetail = async (connectionId, currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_connection_detail', {
    connection_request: connectionId,
    current_profile: currentProfileId,
  });

  if (error) throw error;
  const detail = data?.[0] || null;

  return detail;
};

export const getMessages = async (connectionId, currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_messages', {
    connection_request: connectionId,
    current_profile: currentProfileId,
  });

  if (error) throw error;
  return data || [];
};

export const sendChatMessage = async ({ connectionId, senderProfileId, messageText }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('send_message', {
    connection_request: connectionId,
    sender_profile: senderProfileId,
    body: messageText,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Message could not be sent.');
  }

  return data[0];
};

export const getNotificationCounts = async (currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_notification_counts', {
    current_profile: currentProfileId,
  });

  if (error) throw error;
  const row = data?.[0] || {};
  return {
    connections: Number(row.connections_count || 0),
    messages: Number(row.messages_count || 0),
  };
};

export const markNotificationsRead = async (currentProfileId, area) => {
  const { client } = await getAuthenticatedClient();
  const { error } = await client.rpc('mark_notifications_read', {
    current_profile: currentProfileId,
    area,
  });

  if (error) throw error;
};

export const simulateDemoAcceptance = async (connectionId, currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('simulate_demo_acceptance', {
    connection_request: connectionId,
    current_profile: currentProfileId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Demo connection was not accepted.');
  }

  return data[0];
};

export const sendDemoReply = async ({ connectionId, currentProfileId, replyText }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('send_demo_reply', {
    connection_request: connectionId,
    current_profile: currentProfileId,
    reply_text: replyText,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Demo reply could not be sent.');
  }

  return data[0];
};

export const resetDemoConnection = async (connectionId, currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('reset_demo_connection', {
    connection_request: connectionId,
    current_profile: currentProfileId,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const addTeamMember = async ({ currentProfileId, currentRequestId, connectionId }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('add_team_member', {
    current_profile: currentProfileId,
    current_request: currentRequestId,
    connection_request: connectionId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team member was not added.');
  }

  return data[0];
};

export const setConnectionTeamDecision = async ({ connectionId, currentProfileId, decision }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('set_connection_team_decision', {
    connection_request: connectionId,
    current_profile: currentProfileId,
    decision,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team decision was not updated.');
  }

  return data[0];
};
