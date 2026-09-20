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

const getAnalyticsEnvironment = () =>
  import.meta.env.VITE_PRODUCT_ANALYTICS_ENV || import.meta.env.MODE || 'development';

const cleanAnalyticsMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .map(([key, item]) => [key, item instanceof Date ? item.toISOString() : item]),
  );
};

export const trackProductEvent = async (
  eventName,
  {
    profileId = null,
    entityType = null,
    entityId = null,
    metadata = {},
    environment = getAnalyticsEnvironment(),
    dedupeKey = null,
  } = {},
) => {
  if (!eventName) return null;

  try {
    const { client, session } = await getAuthenticatedClient();
    const { data, error } = await client.rpc('track_product_event', {
      p_event_name: eventName,
      p_profile_id: profileId || null,
      p_anonymous_user_id: session?.user?.id || null,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_metadata: cleanAnalyticsMetadata(metadata),
      p_environment: environment || 'development',
      p_dedupe_key: dedupeKey || null,
    });

    if (error) throw error;
    return data || null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Product analytics event was not recorded', eventName, error);
    }
    return null;
  }
};

const visibleDemoClassCodes = new Set(['200206']);

const filterVisibleDemoDashboards = (rows = []) =>
  (rows || []).filter((row) => visibleDemoClassCodes.has(String(
    row.class_code || row.join_code || row.lecturer_access_code || '',
  ).trim()));

const isMissingSchemaFeature = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return ['PGRST202', 'PGRST204', '42703'].includes(error?.code)
    || message.includes('could not find the function')
    || message.includes('could not find')
    || message.includes('schema cache')
    || message.includes('column');
};

const isOptionalMembershipBackendError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const membershipIdentifier = [
    'team_request_memberships',
    'get_team_request_members',
    'get_joined_team_requests',
    'remove_team_request_member',
    'leave_team_request',
  ].some((identifier) => message.includes(identifier));

  return membershipIdentifier
    && (
      ['PGRST202', 'PGRST204', '42P01', '42883'].includes(code)
      || message.includes('could not find')
      || message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('relation')
      || message.includes('function')
    );
};

const createOptionalMembershipBackendError = (backendError) => {
  const error = new Error('Project membership management is unavailable until the membership migration is applied.');
  error.code = 'OPTIONAL_MEMBERSHIP_BACKEND_UNAVAILABLE';
  error.cause = backendError;
  error.backendCode = backendError?.code;
  error.backendMessage = backendError?.message;
  return error;
};

const isOptionalClassTeamBackendError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const classTeamIdentifier = [
    'class_team_memberships',
    'class_team_invites',
    'get_class_team_members',
    'list_class_team_invite_candidates',
    'list_class_team_invites',
    'invite_class_team_member',
    'respond_class_team_invite',
    'remove_class_team_member',
    'leave_class_team',
    'leave_class',
  ].some((identifier) => message.includes(identifier));

  return classTeamIdentifier && (
    ['PGRST202', 'PGRST204', '42P01', '42883'].includes(code)
    || message.includes('could not find')
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('function')
  );
};

const createOptionalClassTeamBackendError = (backendError) => {
  const error = new Error('Class team management is unavailable until the class-team migration is applied.');
  error.code = 'OPTIONAL_CLASS_TEAM_BACKEND_UNAVAILABLE';
  error.cause = backendError;
  error.backendCode = backendError?.code;
  error.backendMessage = backendError?.message;
  return error;
};

const isClassProfileRestrictionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('class code not found for this profile')
    || message.includes('does not match your current academic profile');
};

const getProfileExtraPayload = (profileData = {}) => ({
  // social_links is the only optional profile column introduced by the current
  // profile privacy migration. Other form values belong to different models or
  // are demo-only and must not be sent as profiles columns.
  social_links: profileData.social_links && typeof profileData.social_links === 'object'
    ? profileData.social_links
    : {},
});

const profileRows = (data) => (Array.isArray(data) ? data : data ? [data] : []);

const logProfileSchemaFallback = (stage, error) => {
  if (import.meta.env.DEV) {
    console.warn(`Profile operation fell back from ${stage}.`, error);
  }
};

const logCreateProfileAttempt = (label, payload, result) => {
  if (!import.meta.env.DEV) return;

  const error = result?.error;
  console.groupCollapsed(`[createProfile] attempt: ${label}`);
  console.log('operation:', 'profiles.insert');
  console.log('payload keys:', Object.keys(payload));
  if (error) {
    console.log('error code:', error.code || '(none)');
    console.log('error message:', error.message || '(none)');
    console.log('error details:', error.details || '(none)');
    console.log('error hint:', error.hint || '(none)');
  } else {
    console.log('result:', 'core profile created');
    console.log('profile id:', result?.data?.id || '(none returned)');
  }
  console.groupEnd();
};

const logCreateProfileLookup = (result, profileId) => {
  if (!import.meta.env.DEV) return;

  const error = result?.error;
  console.groupCollapsed('[createProfile] existing profile lookup');
  console.log('operation:', 'profiles.select by owner_id');
  if (error) {
    console.log('error code:', error.code || '(none)');
    console.log('error message:', error.message || '(none)');
    console.log('error details:', error.details || '(none)');
    console.log('error hint:', error.hint || '(none)');
  } else {
    console.log('existing profile id:', profileId || '(none)');
  }
  console.groupEnd();
};

const logCreateProfileOptionalAttempt = (payload, result) => {
  if (!import.meta.env.DEV) return;

  const error = result?.error;
  console.groupCollapsed('[createProfile] optional social-links persistence');
  console.log('operation:', 'profiles.update');
  console.log('payload keys:', Object.keys(payload));
  if (error) {
    console.log('error code:', error.code || '(none)');
    console.log('error message:', error.message || '(none)');
    console.log('error details:', error.details || '(none)');
    console.log('error hint:', error.hint || '(none)');
  } else {
    console.log('result:', 'optional social links persisted');
  }
  console.groupEnd();
};

const normalizeProfileSchool = (school) => {
  const value = String(school || '').trim().replace(/\s+/g, ' ');
  if (!value) return null;
  // Preserve legacy catalog codes and valid custom School names alike.
  return value;
};

const profileContactTypes = new Set(['email', 'instagram', 'messenger', 'url']);

export const normalizeProfileContact = (contactType, contactValue) => {
  const value = String(contactValue ?? '').trim();
  if (!value) {
    return { contact_type: null, contact_value: null };
  }

  const type = String(contactType ?? '').trim().toLowerCase();
  if (!profileContactTypes.has(type)) {
    throw new Error(`Unsupported profile contact type: ${contactType || '(empty)'}`);
  }

  return { contact_type: type, contact_value: value };
};

export const createProfile = async (profileData) => {
  const { client, session } = await getAuthenticatedClient();
  const normalizedSchool = normalizeProfileSchool(profileData.school);
  const normalizedContact = normalizeProfileContact(
    profileData.contact_type,
    profileData.contact_value,
  );
  const role = profileData.role === 'lecturer'
    ? 'lecturer'
    : profileData.role === 'participant'
      ? 'participant'
      : 'student';
  const corePayload = {
    full_name: String(profileData.full_name || '').trim(),
    school: normalizedSchool,
    major: profileData.major ? String(profileData.major).trim() : null,
    skills: Array.isArray(profileData.skills) ? profileData.skills : [],
    ...normalizedContact,
    short_bio: profileData.short_bio ? String(profileData.short_bio).trim() : null,
    is_demo: false,
  };
  const academicPayload = {
    university: profileData.university || 'RMIT University',
    is_available: profileData.is_available ?? true,
  };
  const ownershipPayload = {
    owner_id: session.user.id,
    consent_public_visibility: true,
  };
  const rolePayload = {
    role,
    lecturer_title: role === 'lecturer' ? profileData.lecturer_title || null : null,
  };

  const insertAttempts = [
    { label: 'full profile insert', payload: { ...corePayload, ...academicPayload, ...ownershipPayload, ...rolePayload } },
    { label: 'role profile insert', payload: { ...corePayload, ...ownershipPayload, ...rolePayload } },
    { label: 'academic profile insert', payload: { ...corePayload, ...academicPayload, ...ownershipPayload } },
    { label: 'owned core profile insert', payload: { ...corePayload, ...ownershipPayload } },
    { label: 'academic legacy profile insert', payload: { ...corePayload, ...academicPayload } },
    { label: 'legacy profile insert', payload: corePayload },
  ];

  const existingProfile = await client
    .from('profiles')
    .select('*')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  logCreateProfileLookup(existingProfile, existingProfile.data?.id);

  if (existingProfile.error && !isMissingSchemaFeature(existingProfile.error)) {
    throw existingProfile.error;
  }

  if (existingProfile.data?.id) {
    return updateProfile(existingProfile.data.id, profileData);
  }

  let createdProfile = null;
  let lastSchemaError = null;

  for (const attempt of insertAttempts) {
    const result = await client
      .from('profiles')
      .insert(attempt.payload)
      .select()
      .single();

    logCreateProfileAttempt(attempt.label, attempt.payload, result);

    if (!result.error) {
      createdProfile = {
        ...result.data,
        university: result.data.university || profileData.university || 'RMIT University',
        is_available: result.data.is_available ?? profileData.is_available ?? true,
        role: result.data.role || role,
        lecturer_title: result.data.lecturer_title || (role === 'lecturer' ? profileData.lecturer_title || null : null),
      };
      break;
    }

    if (!isMissingSchemaFeature(result.error)) {
      throw result.error;
    }

    lastSchemaError = result.error;
    logProfileSchemaFallback(attempt.label, result.error);
  }

  if (!createdProfile) {
    throw lastSchemaError || new Error('Profile was not created.');
  }

  const socialLinks = getProfileExtraPayload(profileData).social_links;
  if (Object.keys(socialLinks).length === 0) return createdProfile;

  const { data: socialData, error: socialError } = await client
    .from('profiles')
    .update({ social_links: socialLinks })
    .eq('id', createdProfile.id)
    .select()
    .maybeSingle();

  logCreateProfileOptionalAttempt({ social_links: socialLinks }, { data: socialData, error: socialError });

  if (socialError && isMissingSchemaFeature(socialError)) {
    if (import.meta.env.DEV) {
      console.warn('Optional profile social links were not persisted because the social_links column is unavailable.', socialError);
    }
    return { ...createdProfile, social_links: socialLinks };
  }

  if (socialError) throw socialError;
  return socialData || { ...createdProfile, social_links: socialLinks };
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

  if (options.ownedOnly) {
    throw new Error('This profile is not linked to the current sign-in session.');
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

export const getMyProfile = async () => {
  const { client, session } = await getAuthenticatedClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && isMissingSchemaFeature(error)) return null;
  if (error) throw error;
  return data || null;
};

export const getProfileByContactEmail = async (email) => {
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) return null;

  const { client } = await getAuthenticatedClient();
  const byStudentContact = await client
    .from('profiles')
    .select('*')
    .eq('contact_type', 'email')
    .ilike('contact_value', normalizedEmail)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!byStudentContact.error && byStudentContact.data) {
    return byStudentContact.data;
  }

  if (byStudentContact.error && !isMissingSchemaFeature(byStudentContact.error)) {
    throw byStudentContact.error;
  }

  const byLecturerContact = await client
    .from('profiles')
    .select('*')
    .ilike('lecturer_contact_detail', normalizedEmail)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byLecturerContact.error && !isMissingSchemaFeature(byLecturerContact.error)) {
    throw byLecturerContact.error;
  }

  return byLecturerContact.data || null;
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

  const role = profileData.role === 'lecturer'
    ? 'lecturer'
    : profileData.role === 'participant'
      ? 'participant'
      : 'student';
  const normalizedSchool = normalizeProfileSchool(profileData.school);
  const normalizedContact = normalizeProfileContact(
    profileData.contact_type,
    profileData.contact_value,
  );
  let { data, error } = await client.rpc('update_profile_with_role_v2', {
    p_profile_id: profileId,
    p_university: profileData.university || 'RMIT University',
    p_school: normalizedSchool,
    p_major: profileData.major,
    p_full_name: profileData.full_name,
    p_skills: profileData.skills,
    p_contact_type: normalizedContact.contact_type,
    p_contact_value: normalizedContact.contact_value,
    p_short_bio: profileData.short_bio,
    p_is_available: profileData.is_available ?? true,
    p_role: role,
    p_lecturer_title: profileData.lecturer_title || null,
    p_student_id: profileData.student_id || null,
    p_academic_field: profileData.academic_field || null,
    p_lecturer_id: profileData.lecturer_id || null,
    p_lecturer_contact_method: profileData.lecturer_contact_method || null,
    p_lecturer_contact_detail: profileData.lecturer_contact_detail || null,
  });

  if (error && isMissingSchemaFeature(error)) {
    logProfileSchemaFallback('update_profile_with_role_v2', error);
    const roleFallback = await client.rpc('update_profile_with_role', {
      p_profile_id: profileId,
      p_university: profileData.university || 'RMIT University',
      p_school: normalizedSchool,
      p_major: profileData.major,
      p_full_name: profileData.full_name,
      p_skills: profileData.skills,
      p_contact_type: normalizedContact.contact_type,
      p_contact_value: normalizedContact.contact_value,
      p_short_bio: profileData.short_bio,
      p_is_available: profileData.is_available ?? true,
      p_role: role,
      p_lecturer_title: profileData.lecturer_title || null,
    });

    data = roleFallback.data;
    error = roleFallback.error;
    if (error && isMissingSchemaFeature(error)) {
      logProfileSchemaFallback('update_profile_with_role', error);
    }
  }

  if (error && isMissingSchemaFeature(error)) {
    const fallback = await client.rpc('update_profile', {
      p_profile_id: profileId,
      p_university: profileData.university || 'RMIT University',
      p_school: normalizedSchool,
      p_major: profileData.major,
      p_full_name: profileData.full_name,
      p_skills: profileData.skills,
      p_contact_type: normalizedContact.contact_type,
      p_contact_value: normalizedContact.contact_value,
      p_short_bio: profileData.short_bio,
      p_is_available: profileData.is_available ?? true,
    });

    data = fallback.data?.length
      ? fallback.data.map((profile) => ({
          ...profile,
          role,
          lecturer_title: role === 'lecturer' ? profileData.lecturer_title || null : null,
        }))
      : fallback.data;
    error = fallback.error;
    if (error && isMissingSchemaFeature(error)) {
      logProfileSchemaFallback('update_profile (university/is_available)', error);
    }
  }

  if (error && isMissingSchemaFeature(error)) {
    const legacyFallback = await client.rpc('update_profile', {
      p_profile_id: profileId,
      p_full_name: profileData.full_name,
      p_school: normalizedSchool,
      p_major: profileData.major,
      p_skills: profileData.skills,
      p_contact_type: normalizedContact.contact_type,
      p_contact_value: normalizedContact.contact_value,
      p_short_bio: profileData.short_bio,
    });

    data = profileRows(legacyFallback.data).map((profile) => ({
      ...profile,
      university: profile.university || profileData.university || 'RMIT University',
      is_available: profile.is_available ?? profileData.is_available ?? true,
      role,
      lecturer_title: role === 'lecturer' ? profileData.lecturer_title || null : null,
    }));
    error = legacyFallback.error;
    if (error && isMissingSchemaFeature(error)) {
      logProfileSchemaFallback('legacy update_profile', error);
    }
  }

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Profile was not updated.');
  }

  const updatedProfile = data[0];
  const extraPayload = getProfileExtraPayload(profileData);
  const { data: extraData, error: extraError } = await client
    .from('profiles')
    .update(extraPayload)
    .eq('id', profileId)
    .select()
    .maybeSingle();

  if (extraError && isMissingSchemaFeature(extraError)) {
    if (import.meta.env.DEV) {
      console.warn('Optional profile fields were not persisted because the corresponding production columns are unavailable.', extraError);
    }
  } else if (extraError) {
    throw extraError;
  }

  return extraData || { ...updatedProfile, ...extraPayload };
};

export const getLecturerDashboardByCode = async (classCode) => {
  const { client } = await getAuthenticatedClient();
  const v2 = await client.rpc('get_lecturer_dashboard_by_code_v2', {
    p_class_code: classCode,
  });

  if (!v2.error) return v2.data?.[0] || null;
  if (!isMissingSchemaFeature(v2.error)) throw v2.error;

  const { data, error } = await client.rpc('get_lecturer_dashboard_by_code', {
    class_code: classCode,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const getDemoLecturerDashboards = async ({ university, lecturerId }) => {
  const { client } = await getAuthenticatedClient();
  const v2 = await client.rpc('get_demo_lecturer_dashboards_v2', {
    p_university: university,
    p_lecturer_id: lecturerId,
  });

  if (!v2.error) return filterVisibleDemoDashboards(v2.data || []);
  if (!isMissingSchemaFeature(v2.error)) throw v2.error;

  const result = await client.rpc('get_demo_lecturer_dashboards', {
    p_university: university,
    p_lecturer_id: lecturerId,
  });

  if (!result.error) return filterVisibleDemoDashboards(result.data || []);

  if (!isMissingSchemaFeature(result.error)) {
    throw result.error;
  }

  const dashboards = await Promise.all(
    ['200206'].map((code) =>
      getLecturerDashboardByCode(code).catch(() => null),
    ),
  );

  return dashboards
    .filter(Boolean)
    .filter((row) => visibleDemoClassCodes.has(String(row.class_code || row.join_code || row.lecturer_access_code || '').trim()))
    .filter((row) => !university || (row.university || 'RMIT University') === university);
};

export const getDemoClassForProfile = async (profileId, classCode) => {
  const { client } = await getAuthenticatedClient();
  const v2 = await client.rpc('get_demo_class_for_profile_v2', {
    current_profile: profileId,
    p_class_code: classCode,
  });

  if (!v2.error) return v2.data?.[0] || null;
  if (!isMissingSchemaFeature(v2.error)) throw v2.error;

  const { data, error } = await client.rpc('get_demo_class_for_profile', {
    current_profile: profileId,
    p_class_code: classCode,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const joinDemoClassByCode = async ({ profileId, classCode, networkStatus }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('join_demo_class_by_code', {
    current_profile: profileId,
    p_class_code: classCode,
    preferred_teammate_status: networkStatus || null,
  });

  if (error) {
    if (!isMissingSchemaFeature(error) && !isClassProfileRestrictionError(error)) throw error;

    const classItem = await getClassByJoinCode(classCode);
    if (!classItem) throw error;
    return joinClassById({ profileId, classItem, networkStatus });
  }

  if (!data?.length) {
    const classItem = await getClassByJoinCode(classCode);
    if (classItem) return joinClassById({ profileId, classItem, networkStatus });
    throw new Error('Demo class could not be joined.');
  }

  return data[0];
};

export const joinClassById = async ({ profileId, classItem, networkStatus }) => {
  const { client } = await getAuthenticatedClient();
  const rpcResult = await client.rpc('join_class_by_id', {
    current_profile: profileId,
    target_class: classItem.id,
    preferred_teammate_status: networkStatus || null,
  });

  if (!rpcResult.error) {
    if (!rpcResult.data?.length) {
      throw new Error('Class membership could not be saved.');
    }
    return {
      ...rpcResult.data[0],
      class_data: rpcResult.data[0].class_data || classItem,
    };
  }

  if (!isMissingSchemaFeature(rpcResult.error)) {
    throw rpcResult.error;
  }

  const { data, error } = await client
    .from('class_members')
    .upsert({
      class_id: classItem.id,
      profile_id: profileId,
      network_status: networkStatus || null,
    }, {
      onConflict: 'class_id,profile_id',
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error('Class membership could not be saved.');
  }

  return {
    ...data,
    class_data: classItem,
  };
};

export const createClassCohort = async (classData) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('create_class_cohort', {
    p_university: classData.university || 'RMIT University',
    p_school: classData.school || null,
    p_major: classData.major,
    p_course_name: classData.course_name || classData.course,
    p_course_code: classData.course_code,
    p_session_code: classData.session_code,
    p_semester: classData.semester || 'Semester 2',
    p_academic_year: Number(classData.academic_year || 2026),
    p_lecturer_name: classData.lecturer_name || null,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Class was not created.');
  }

  return data[0];
};

export const createLecturerClass = async (classData) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('create_lecturer_class_v2', {
    p_lecturer_profile_id: classData.lecturer_profile_id,
    p_university: classData.university || 'RMIT University',
    p_school: classData.school || null,
    p_major: classData.major,
    p_course_name: classData.course_name,
    p_course_code: classData.course_code,
    p_session_code: classData.session_code,
    p_lecturer_name: classData.lecturer_name || null,
    p_lecturer_id: classData.lecturer_id || null,
    p_approximate_student_count: Number(classData.approximate_student_count || 28),
    p_required_members_per_team: Number(classData.required_members_per_team || 4),
    p_team_formation_deadline: classData.team_formation_deadline || null,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Class was not created.');
  }

  return data[0];
};

export const getMyClassTeamStatus = async (profileId, classId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_my_class_team_status', {
    p_profile_id: profileId,
    p_class_id: classId,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const saveClassTeamStatus = async ({
  profileId,
  classId,
  teamName,
  requiredMembers,
  currentMembers,
  externalStudentIds,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('upsert_class_team_status', {
    p_profile_id: profileId,
    p_class_id: classId,
    p_team_name: teamName || null,
    p_required_members: Number(requiredMembers || 2),
    p_current_members: Number(currentMembers || 1),
    p_external_student_ids: externalStudentIds || [],
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team status was not saved.');
  }

  return data[0];
};

export const sendLecturerReminder = async ({
  lecturerProfileId,
  studentProfileId,
  classId,
  message,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('send_lecturer_reminder', {
    lecturer_profile: lecturerProfileId,
    student_profile: studentProfileId,
    target_class: classId,
    reminder_body: message,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const openLecturerStudentThread = async ({
  lecturerProfileId,
  studentProfileId,
  classId,
  message,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('open_lecturer_student_thread', {
    lecturer_profile: lecturerProfileId,
    student_profile: studentProfileId,
    target_class: classId,
    intro_message: message || '',
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Lecturer message thread could not be opened.');
  }

  return data[0];
};

export const closeClassTeamFormation = async ({ lecturerProfileId, classId }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('close_class_team_formation_v2', {
    lecturer_profile: lecturerProfileId,
    target_class: classId,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Class team formation could not be closed.');
  }

  return data[0];
};

export const confirmClassTeamProposals = async ({ lecturerProfileId, classId, proposals }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('confirm_class_team_proposals_v2', {
    lecturer_profile: lecturerProfileId,
    target_class: classId,
    proposals,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Proposed teams could not be confirmed.');
  }

  return data[0];
};

export const getClassByJoinCode = async (joinCode) => {
  const { client } = await getAuthenticatedClient();
  const normalizedCode = String(joinCode || '').trim();
  if (!normalizedCode) return null;

  const codeFields = ['lecturer_access_code', 'join_code', 'demo_class_code'];
  const results = await Promise.all(
    codeFields.map((field) => client
      .from('classes')
      .select('*')
      .eq('status', 'active')
      .eq(field, normalizedCode)),
  );

  const failedResult = results.find(({ error }) => error);
  if (failedResult?.error) throw failedResult.error;

  const matches = [...new Map(
    results
      .flatMap(({ data }) => data || [])
      .map((classItem) => [classItem.id, classItem]),
  ).values()];

  if (matches.length > 1) {
    const error = new Error('Multiple active classes match this code.');
    error.code = 'CLASS_CODE_AMBIGUOUS';
    throw error;
  }

  return matches[0] || null;
};

export const joinClassByCode = async ({ profileId, joinCode, networkStatus }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('join_class_by_code', {
    current_profile: profileId,
    class_code: joinCode,
    preferred_teammate_status: networkStatus || null,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Class could not be joined.');
  }

  return data[0];
};

export const listMyClasses = async (profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_my_classes', {
    current_profile: profileId,
  });

  if (error) throw error;
  return data || [];
};

export const listMyClassesWithStatus = async (profileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_my_classes_with_status', {
    current_profile: profileId,
  });

  if (error && isMissingSchemaFeature(error)) {
    return listMyClasses(profileId);
  }

  if (error) throw error;
  return data || [];
};

// The directory intentionally reads the real classes table so newly created
// lecturer classes appear without frontend constants. Membership/status details
// continue to come from the existing authoritative per-profile RPC above.
export const listAllClasses = async () => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client
    .from('classes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const listLecturerClasses = async () => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('list_lecturer_classes');

  if (error) throw error;
  return data || [];
};

export const getClassDashboard = async (classId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_class_dashboard', {
    target_class: classId,
  });

  if (error) throw error;
  return data?.[0] || null;
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

  if (requestData.request_scope === 'open_opportunity') {
    let { data, error } = await client.rpc('create_open_opportunity_request_v3', {
      p_profile_id: profileId,
      p_opportunity_type: requestData.opportunity_type,
      p_opportunity_field: requestData.opportunity_field,
      p_opportunity_name: requestData.opportunity_name,
      p_skills_needed: requestData.skills_needed,
      p_members_needed: requestData.members_needed,
      p_total_team_size: requestData.total_team_size,
      p_teammates_needed_initial: requestData.teammates_needed_initial,
      p_availability: requestData.availability,
      p_preferred_active_time: requestData.preferred_active_time,
      p_work_styles: requestData.work_styles,
      p_requirements_data: requestData.requirements_data,
      p_requires_portfolio: requestData.requires_portfolio,
      p_portfolio_reference_path: requestData.portfolio_reference_path,
      p_portfolio_reference_name: requestData.portfolio_reference_name,
      p_requirements: requestData.requirements,
      p_deadline: requestData.deadline || null,
    });

    if (error && isMissingSchemaFeature(error)) {
      const fallback = await client.rpc('create_open_opportunity_request_v2', {
        p_profile_id: profileId,
        p_opportunity_type: requestData.opportunity_type,
        p_opportunity_field: requestData.opportunity_field,
        p_opportunity_name: requestData.opportunity_name,
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
        p_deadline: requestData.deadline || null,
      });
      data = fallback.data;
      error = fallback.error;
    }

    if (!error) {
      if (!data?.length) {
        throw new Error('Team request was not created.');
      }

      return { ...data[0], editToken: data[0].edit_token };
    }

    if (!isMissingSchemaFeature(error)) {
      throw error;
    }
  }

  const args = {
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
  };
  if (requestData.class_id) {
    const { data, error } = await client.rpc('create_team_request_with_class', {
      ...args,
      p_class_id: requestData.class_id,
    });

    if (error) throw error;
    if (!data?.length) {
      throw new Error('Team request was not created.');
    }

    return { ...data[0], editToken: data[0].edit_token };
  }

  const rpcName = requestData.class_id ? 'create_team_request_with_class' : 'create_team_request';
  const { data, error } = await client.rpc(rpcName, args);

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

  if (requestData.request_scope === 'open_opportunity' || requestData.opportunity_name) {
    const { data, error } = await client.rpc('update_open_opportunity_request_v1', {
      p_request_id: requestId,
      p_profile_id: profileId,
      p_opportunity_type: requestData.opportunity_type,
      p_opportunity_field: requestData.opportunity_field,
      p_opportunity_name: requestData.opportunity_name,
      p_skills_needed: requestData.skills_needed,
      p_members_needed: requestData.members_needed,
      p_total_team_size: requestData.total_team_size,
      p_teammates_needed_initial: requestData.teammates_needed_initial,
      p_availability: requestData.availability,
      p_preferred_active_time: requestData.preferred_active_time,
      p_work_styles: requestData.work_styles,
      p_requirements_data: requestData.requirements_data,
      p_requires_portfolio: requestData.requires_portfolio,
      p_portfolio_reference_path: requestData.portfolio_reference_path,
      p_portfolio_reference_name: requestData.portfolio_reference_name,
      p_requirements: requestData.requirements,
      p_deadline: requestData.deadline || null,
    });

    if (!error) {
      if (!data?.length) {
        throw new Error('Team request was not updated.');
      }

      return data[0];
    }

    if (!isMissingSchemaFeature(error)) {
      throw error;
    }
  }

  const rpcName = requestData.class_id ? 'update_team_request_with_class' : 'update_team_request';
  const args = {
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
  };
  if (requestData.class_id) args.p_class_id = requestData.class_id;

  const { data, error } = await client.rpc(rpcName, args);

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Team request was not updated.');
  }

  return data[0];
};

export const pinTeamRequestFor48Hours = async (requestId, profileId) => {
  const { client } = await getAuthenticatedClient();
  const pinnedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('team_requests')
    .update({ pinned_until: pinnedUntil })
    .eq('id', requestId)
    .eq('profile_id', profileId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error('Request was not pinned.');
  }

  return data;
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
  const v2 = await client.rpc('list_active_team_requests_v2');

  if (!v2.error) return v2.data || [];
  if (!isMissingSchemaFeature(v2.error)) throw v2.error;

  const { data, error } = await client.rpc('list_active_team_requests');

  if (error) throw error;
  return data || [];
};

const normalizeValue = (value = '') => String(value || '').trim().toLowerCase();

const requestCourseKey = (request = {}) =>
  normalizeValue(request.course_code || request.course_name || request.course);

const parseSession = (session = '') => {
  const [day = '', startTime = ''] = String(session || '').trim().split(/\s+/);
  return { day: normalizeValue(day), startTime: normalizeValue(startTime) };
};

const sessionCodeFromValue = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^session\s*0?(\d{1,2})$/i) || normalized.match(/^0?(\d{1,2})$/);
  return match ? match[1].padStart(2, '0') : '';
};

const requestSessionKey = (request = {}) => {
  const sessionCode = sessionCodeFromValue(request.session_code || request.class_session);
  if (sessionCode) return `session-${sessionCode}`;

  const parsed = parseSession(request.class_session);
  const day = normalizeValue(request.class_day || parsed.day);
  const startTime = normalizeValue(request.class_start_time || parsed.startTime);
  if (!day || !startTime) return normalizeValue(request.class_session);

  return `${day}|${startTime}`;
};

const requestsShareCourseAndSession = (left, right) => {
  if (left?.class_id || right?.class_id) {
    const sameClass = Boolean(
      left?.class_id
      && right?.class_id
      && normalizeValue(left.class_id) === normalizeValue(right.class_id),
    );
    const leftSession = requestSessionKey(left);
    const rightSession = requestSessionKey(right);
    return Boolean(sameClass && (!leftSession || !rightSession || leftSession === rightSession));
  }

  if (isOpenOpportunityRequest(left) || isOpenOpportunityRequest(right)) {
    if (!isOpenOpportunityRequest(left) || !isOpenOpportunityRequest(right)) return false;

    const sameOpportunity =
      normalizeValue(left.opportunity_name || left.course_name || left.course) &&
      normalizeValue(left.opportunity_name || left.course_name || left.course) ===
        normalizeValue(right.opportunity_name || right.course_name || right.course);
    const sameField =
      normalizeValue(left.opportunity_field || left.major) &&
      normalizeValue(left.opportunity_field || left.major) === normalizeValue(right.opportunity_field || right.major);
    const sameType =
      normalizeValue(left.opportunity_type || left.course_code) &&
      normalizeValue(left.opportunity_type || left.course_code) === normalizeValue(right.opportunity_type || right.course_code);

    return Boolean(sameOpportunity || sameField || sameType);
  }

  return requestCourseKey(left) &&
    requestCourseKey(left) === requestCourseKey(right) &&
    requestSessionKey(left) &&
    requestSessionKey(left) === requestSessionKey(right);
};

const isOpenOpportunityRequest = (request = {}) =>
  request.request_scope === 'open_opportunity' || Boolean(request.opportunity_name);

const requestCanAcceptTeammates = (request = {}) => {
  const teamStatus = request.team_status || {};
  if (String(teamStatus.status || '').toLowerCase() === 'complete') return false;
  const remaining = Number(teamStatus.remaining_members ?? request.members_needed ?? 1);
  return remaining > 0;
};

const arrayOverlapCount = (left = [], right = []) => {
  const rightValues = new Set((right || []).map(normalizeValue).filter(Boolean));
  return (left || []).map(normalizeValue).filter((item) => rightValues.has(item)).length;
};

const buildMatchReason = (currentProfile, currentRequest, candidate) => {
  const reasons = [];

  if (currentRequest.class_id && candidate.class_id === currentRequest.class_id) {
    reasons.push('same class');
  }

  if (arrayOverlapCount(candidate.profile?.skills, currentRequest.skills_needed) > 0) {
    reasons.push('they have skills your team needs');
  }

  if (arrayOverlapCount(currentProfile?.skills, candidate.skills_needed) > 0) {
    reasons.push('your skills match what they need');
  }

  if (arrayOverlapCount(getRequestWorkStyles(currentRequest), getRequestWorkStyles(candidate)) > 0) {
    reasons.push('similar work style');
  }

  if (candidate.team_status?.remaining_members !== undefined) {
    reasons.push(`their team is still missing ${candidate.team_status.remaining_members}`);
  }

  if (reasons.length === 0) {
    return 'Compatible request details and available team capacity.';
  }

  return `${reasons.slice(0, 3).join(', ')}.`;
};

const getRequestWorkStyles = (request = {}) => {
  if (request.work_styles?.length) return request.work_styles;
  return request.work_style ? [request.work_style] : [];
};

export const getTeamRequestById = async (requestId) => {
  const { client } = await getAuthenticatedClient();
  const v2 = await client.rpc('get_team_request_public_v2', {
    requested_request: requestId,
  });

  if (!v2.error) {
    if (!v2.data?.length) {
      throw new Error('Team request was not found.');
    }
    return v2.data[0];
  }

  if (!isMissingSchemaFeature(v2.error)) throw v2.error;

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
  const { client } = await getAuthenticatedClient();
  let activeRequests = [];

  try {
    const v2 = await client.rpc('get_match_candidates_for_request_v2', {
      requested_request: requestId,
      current_profile: currentRequest.profile_id,
    });

    if (!v2.error) {
      activeRequests = v2.data || [];
    } else {
      if (!isMissingSchemaFeature(v2.error)) throw v2.error;
      const { data, error } = await client.rpc('get_match_candidates_for_request', {
        requested_request: requestId,
        current_profile: currentRequest.profile_id,
      });

      if (error) throw error;
      activeRequests = data || [];
    }
  } catch {
    activeRequests = (await getActiveTeamRequests()).filter((request) =>
      requestsShareCourseAndSession(currentRequest, request),
    );
  }

  if (activeRequests.length === 0) {
    activeRequests = (await getActiveTeamRequests()).filter((request) =>
      requestsShareCourseAndSession(currentRequest, request),
    );
  }

  const matches = activeRequests
    .filter((request) => request.id !== requestId)
    .filter((request) => request.profile_id !== currentRequest.profile_id)
    .filter((request) => {
      if (currentRequest.class_id) {
        return Boolean(
          request.class_id
          && normalizeValue(request.class_id) === normalizeValue(currentRequest.class_id),
        );
      }

      if (isOpenOpportunityRequest(currentRequest)) {
        return isOpenOpportunityRequest(request);
      }

      const currentUniversity = (currentProfile?.university || 'RMIT University').trim().toLowerCase();
      const candidateUniversity = (request.profile?.university || 'RMIT University').trim().toLowerCase();
      return currentUniversity === candidateUniversity;
    })
    .filter((request) => requestsShareCourseAndSession(currentRequest, request))
    .filter((request) => requestCanAcceptTeammates(request))
    .map((request) => ({
      ...request,
      matchScore: calculateMatchScore(currentProfile, currentRequest, request),
      matchReason: buildMatchReason(currentProfile, currentRequest, request),
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

export const requestToJoinTeamRequest = async ({
  targetRequest,
  joiningProfile,
  introMessage,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('request_to_join_team_request', {
    target_request: targetRequest,
    joining_profile: joiningProfile,
    intro_message: introMessage || '',
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Join request was not created.');
  }

  return data[0];
};

export const getTeamRequestJoinState = async (targetRequest, joiningProfile) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_team_request_join_state', {
    target_request: targetRequest,
    joining_profile: joiningProfile,
  });

  if (error) throw error;
  return data?.[0] || null;
};

export const getTeamRequestMembers = async (requestId, currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_team_request_members', {
    target_request: requestId,
    current_profile: currentProfileId,
  });

  if (error) {
    if (isOptionalMembershipBackendError(error)) throw createOptionalMembershipBackendError(error);
    throw error;
  }
  return data || [];
};

export const getJoinedTeamRequests = async (currentProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_joined_team_requests', {
    current_profile: currentProfileId,
  });

  if (error) {
    if (isOptionalMembershipBackendError(error)) return [];
    throw error;
  }
  return data || [];
};

export const removeTeamRequestMember = async ({ requestId, ownerProfileId, memberProfileId }) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('remove_team_request_member', {
    target_request: requestId,
    owner_profile: ownerProfileId,
    member_profile: memberProfileId,
  });

  if (error) {
    if (isOptionalMembershipBackendError(error)) {
      throw new Error('Project membership management is unavailable until the membership migration is applied.');
    }
    throw error;
  }
  if (!data?.length) throw new Error('Project member could not be removed.');
  return data[0];
};

const callClassTeamRpc = async (functionName, params, { fallback = null } = {}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc(functionName, params);
  if (!error) return data || fallback;
  if (isOptionalClassTeamBackendError(error)) {
    if (fallback !== null) return fallback;
    throw createOptionalClassTeamBackendError(error);
  }
  throw error;
};

export const getClassTeamMembers = async ({ classId, teamRequestId, profileId }) => (
  callClassTeamRpc('get_class_team_members', {
    p_class_id: classId,
    p_team_request_id: teamRequestId,
    p_profile_id: profileId,
  }, { fallback: [] })
);

export const listClassTeamInviteCandidates = async ({ classId, teamRequestId, ownerProfileId }) => (
  callClassTeamRpc('list_class_team_invite_candidates', {
    p_class_id: classId,
    p_team_request_id: teamRequestId,
    p_owner_profile_id: ownerProfileId,
  }, { fallback: [] })
);

export const listClassTeamInvites = async ({ classId, profileId }) => (
  callClassTeamRpc('list_class_team_invites', {
    p_class_id: classId,
    p_profile_id: profileId,
  }, { fallback: [] })
);

export const listAccessibleClassTeamRequests = async ({ classId, profileId }) => (
  callClassTeamRpc('list_class_team_requests_for_class', {
    p_class_id: classId,
    p_profile_id: profileId,
  }, { fallback: [] })
);

export const inviteClassTeamMember = async ({ classId, teamRequestId, ownerProfileId, inviteeProfileId }) => (
  callClassTeamRpc('invite_class_team_member', {
    p_class_id: classId,
    p_team_request_id: teamRequestId,
    p_owner_profile_id: ownerProfileId,
    p_invitee_profile_id: inviteeProfileId,
  })
);

export const respondClassTeamInvite = async ({ inviteId, profileId, response }) => (
  callClassTeamRpc('respond_class_team_invite', {
    p_invite_id: inviteId,
    p_profile_id: profileId,
    p_response: response,
  })
);

export const removeClassTeamMember = async ({ classId, teamRequestId, ownerProfileId, memberProfileId }) => (
  callClassTeamRpc('remove_class_team_member', {
    p_class_id: classId,
    p_team_request_id: teamRequestId,
    p_owner_profile_id: ownerProfileId,
    p_member_profile_id: memberProfileId,
  })
);

export const leaveClassTeam = async ({ classId, teamRequestId, profileId }) => (
  callClassTeamRpc('leave_class_team', {
    p_class_id: classId,
    p_team_request_id: teamRequestId,
    p_profile_id: profileId,
  })
);

export const leaveClass = async ({ classId, profileId }) => (
  callClassTeamRpc('leave_class', {
    p_class_id: classId,
    p_profile_id: profileId,
  })
);

export const leaveTeamRequest = async (requestId, memberProfileId) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('leave_team_request', {
    target_request: requestId,
    member_profile: memberProfileId,
  });

  if (error) {
    if (isOptionalMembershipBackendError(error)) {
      throw new Error('Project membership management is unavailable until the membership migration is applied.');
    }
    throw error;
  }
  if (!data?.length) throw new Error('Project could not be left.');
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

const uniqueConnectionRows = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row?.id;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const listConnectionRequestRows = async (client, currentProfileId, direction) => {
  const { data, error } = await client.rpc('list_connection_requests', {
    current_profile: currentProfileId,
    direction,
  });

  if (error) throw error;
  return data || [];
};

export const getConnectionRequests = async (currentProfileId, direction) => {
  const { client } = await getAuthenticatedClient();
  const rows = await listConnectionRequestRows(client, currentProfileId, direction);

  if (direction === 'received' && rows.length === 0) {
    const legacyRows = await listConnectionRequestRows(client, currentProfileId, 'incoming').catch(() => []);
    return uniqueConnectionRows([...rows, ...legacyRows]);
  }

  if (direction === 'declined' && rows.length === 0) {
    const legacyRows = await listConnectionRequestRows(client, currentProfileId, 'not_accepted').catch(() => []);
    return uniqueConnectionRows([...rows, ...legacyRows]);
  }

  return rows;
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

export const updatePendingConnectionMessage = async ({ connectionId, senderProfileId, introMessage }) => {
  const { client } = await getAuthenticatedClient();
  const trimmedMessage = String(introMessage || '').trim();

  const rpcResult = await client.rpc('update_pending_connection_message', {
    connection_request: connectionId,
    sender_profile: senderProfileId,
    intro_message: trimmedMessage,
  });

  if (!rpcResult.error) {
    if (!rpcResult.data?.length) {
      throw new Error('Connection request message was not updated.');
    }

    return rpcResult.data[0];
  }

  if (!isMissingSchemaFeature(rpcResult.error)) {
    throw rpcResult.error;
  }

  const { data, error } = await client
    .from('connections')
    .update({ intro_message: trimmedMessage || null })
    .eq('id', connectionId)
    .eq('sender_profile_id', senderProfileId)
    .eq('status', 'pending')
    .select('id, intro_message, status, updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error('Connection request message was not updated.');
  }

  return data;
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

export const confirmFriendMatch = async ({
  connectionId,
  currentProfileId,
  currentRequestId,
  friendRequestId,
}) => {
  const { client } = await getAuthenticatedClient();
  const { data, error } = await client.rpc('confirm_friend_match', {
    connection_request: connectionId,
    current_profile: currentProfileId,
    current_request: currentRequestId,
    friend_request: friendRequestId || null,
  });

  if (error) throw error;
  if (!data?.length) {
    throw new Error('Match+ was not created.');
  }

  return data[0];
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
