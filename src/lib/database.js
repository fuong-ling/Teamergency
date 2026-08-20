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
    p_university: profileData.university || 'RMIT University',
    p_school: profileData.school,
    p_major: profileData.major,
    p_full_name: profileData.full_name,
    p_skills: profileData.skills,
    p_contact_type: profileData.contact_type,
    p_contact_value: profileData.contact_value,
    p_short_bio: profileData.short_bio,
    p_is_available: profileData.is_available ?? true,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Profile was not updated.');
  }

  return data[0];
};

const fallbackAssessment = (match) => ({
  ...match,
  aiScore: match.matchScore,
  aiExplanation: 'Calculated using standard matching.',
  aiStrengths: [],
  aiGaps: [],
  aiFallbackUsed: true,
});

const saveAIMatchResult = async (client, currentRequest, candidate, ruleBasedScore, assessment) => {
  if (!assessment || assessment.fallback_used) return;

  await client
    .from('ai_match_results')
    .insert({
      request_id: currentRequest.id,
      candidate_profile_id: candidate.profile_id,
      candidate_request_id: candidate.id,
      rule_based_score: ruleBasedScore,
      ai_score: assessment.match_score,
      explanation: assessment.explanation,
      strengths: assessment.strengths || [],
      potential_gaps: assessment.potential_gaps || [],
      fallback_used: false,
    })
    .throwOnError()
    .catch(() => null);
};

const getAIMatchAssessment = async (client, currentProfile, currentRequest, candidate) => {
  const { data, error } = await client.functions.invoke('ai-match', {
    body: {
      ruleBasedScore: candidate.matchScore,
      currentProfile,
      currentRequest,
      candidateProfile: candidate.profile,
      candidateRequest: candidate,
      reviewSummary: candidate.profile?.review_summary || null,
    },
  });

  if (error) throw error;
  if (!data || data.fallback_used) {
    throw new Error('AI assessment unavailable.');
  }

  return {
    match_score: Math.max(0, Math.min(100, Math.round(Number(data.match_score || candidate.matchScore)))),
    explanation: data.explanation || 'Calculated using AI-assisted matching.',
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    potential_gaps: Array.isArray(data.potential_gaps) ? data.potential_gaps : [],
    fallback_used: false,
  };
};

const enhanceMatchesWithAI = async (currentProfile, currentRequest, matches) => {
  const { client } = await getAuthenticatedClient();

  const enhanced = await Promise.all(
    matches.map(async (match) => {
      try {
        const assessment = await getAIMatchAssessment(client, currentProfile, currentRequest, match);
        await saveAIMatchResult(client, currentRequest, match, match.matchScore, assessment);

        return {
          ...match,
          ruleBasedScore: match.matchScore,
          matchScore: assessment.match_score,
          aiScore: assessment.match_score,
          aiExplanation: assessment.explanation,
          aiStrengths: assessment.strengths,
          aiGaps: assessment.potential_gaps,
          aiFallbackUsed: false,
        };
      } catch {
        return fallbackAssessment(match);
      }
    }),
  );

  return enhanced;
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
    p_total_team_size: requestData.total_team_size,
    p_teammates_needed_initial: requestData.teammates_needed_initial,
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

export const listMyTeamRequests = async (profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_my_team_requests', {
    current_profile: profileId,
  });

  if (error) throw error;
  return data || [];
};

export const updateTeamRequest = async (requestId, profileId, requestData) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('update_team_request', {
    p_request_id: requestId,
    p_profile_id: profileId,
    p_school: requestData.school,
    p_major: requestData.major,
    p_course: requestData.course,
    p_course_name: requestData.course_name,
    p_course_code: requestData.course_code,
    p_class_session: requestData.class_session,
    p_skills_needed: requestData.skills_needed,
    p_members_needed: requestData.members_needed,
    p_total_team_size: requestData.total_team_size,
    p_teammates_needed_initial: requestData.teammates_needed_initial,
    p_work_styles: requestData.work_styles,
    p_requirements_data: requestData.requirements_data,
    p_requires_portfolio: requestData.requires_portfolio,
    p_portfolio_reference_path: requestData.portfolio_reference_path,
    p_portfolio_reference_name: requestData.portfolio_reference_name,
    p_requirements: requestData.requirements,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team request was not updated.');
  }

  return data[0];
};

export const cancelTeamRequest = async (requestId, profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('cancel_team_request', {
    request_id: requestId,
    current_profile: profileId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team request was not cancelled.');
  }

  return data[0];
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
    .filter((request) => {
      const currentUniversity = (currentProfile?.university || 'RMIT University').trim().toLowerCase();
      const candidateUniversity = (request.profile?.university || 'RMIT University').trim().toLowerCase();
      return currentUniversity === candidateUniversity;
    })
    .map((request) => ({
      ...request,
      matchScore: calculateMatchScore(currentProfile, currentRequest, request),
    }));
  const sortedRuleMatches = sortMatches(matches);
  const enhancedMatches = await enhanceMatchesWithAI(currentProfile, currentRequest, sortedRuleMatches);

  return {
    currentProfile,
    currentRequest,
    matches: sortMatches(enhancedMatches),
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

export const reopenTeamRequest = async (requestId, profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('reopen_team_request', {
    request_id: requestId,
    current_profile: profileId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Request was not reopened.');
  }

  return data[0];
};

export const getTeamRequestProgress = async (requestId, profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_team_request_progress', {
    request_id: requestId,
    current_profile: profileId,
  });

  if (error) throw error;
  return data?.[0] || { found_count: 0, teammates: [] };
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

export const getConnectionBetween = async (currentProfileId, teammateProfileId, context = '') => {
  const { client } = await getAuthenticatedClient();
  let result = context
    ? await client.rpc('get_connection_between_for_context', {
      current_profile: currentProfileId,
      teammate_profile: teammateProfileId,
      requested_context: context,
    })
    : await client.rpc('get_connection_between', {
      current_profile: currentProfileId,
      teammate_profile: teammateProfileId,
    });

  if (result.error && context && result.error.message?.includes('get_connection_between_for_context')) {
    result = await client.rpc('get_connection_between', {
      current_profile: currentProfileId,
      teammate_profile: teammateProfileId,
    });
  }

  const { data, error } = result;
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

export const unmatchConnectionRequest = async ({
  connectionId,
  currentProfileId,
  reason,
  note,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('unmatch_connection_request', {
    connection_request: connectionId,
    current_profile: currentProfileId,
    reason,
    note: note || null,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Connection was not unmatched.');
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

export const listFriends = async (currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_friends', {
    current_profile: currentProfileId,
  });

  if (error) throw error;
  return data || [];
};

export const listProfileReviews = async (profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_profile_reviews', {
    requested_profile: profileId,
  });

  if (error) throw error;
  return data || [];
};

export const createReview = async ({
  reviewerProfileId,
  reviewedProfileId,
  connectionId,
  teamRequestId,
  rating,
  reviewText,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('create_review', {
    reviewer_profile: reviewerProfileId,
    reviewed_profile: reviewedProfileId,
    connection_request: connectionId,
    team_request: teamRequestId,
    rating_value: rating,
    review_body: reviewText || '',
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Review was not saved.');
  }

  return data[0];
};

export const createMatchFeedback = async ({
  connectionId,
  teamRequestId,
  reviewerProfileId,
  score,
  feedbackText,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('create_match_usefulness_feedback', {
    team_request: teamRequestId,
    reviewer_profile: reviewerProfileId,
    connection_request: connectionId || null,
    rating_value: score,
    feedback_body: feedbackText || '',
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Feedback was not saved.');
  }

  return data[0];
};
