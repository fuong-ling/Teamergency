import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  GraduationCap,
  MessageCircle,
  Search,
  SendHorizontal,
  Sparkles,
  UserPlus,
  UserRound,
  UsersRound,
  XCircle,
} from 'lucide-react';
import {
  addTeamMember,
  cancelConnectionRequest,
  createProfile,
  createTeamRequest,
  getConnectionBetween,
  getConnectionDetail,
  getConnectionRequests,
  getDiscoverProfiles,
  getMatchesForRequest,
  getMessages,
  getMessageThreads,
  getProfileById,
  getTeamRequestById,
  getPortfolioReferenceUrl,
  markTeamRequestFound,
  respondConnectionRequest,
  resetDemoConnection,
  sendDemoReply,
  sendChatMessage,
  sendConnectionRequest,
  simulateDemoAcceptance,
  updateProfile,
  uploadPortfolioReference,
} from './lib/database';
import { hasSupabaseConfig } from './lib/supabase';
import {
  classSessionsByCourseCode,
  connectMessageSuggestions,
  contactTypes,
  coursesBySchool,
  demoReplyPool,
  majorsBySchool,
  requirementOptions,
  schoolOptions,
  skillOptions,
  toolOptions,
  workStyleOptions,
} from './lib/catalog';
import {
  clearCurrentRequest,
  getStoredProfileId,
  getStoredRequestEditToken,
  getStoredRequestId,
  storeCurrentRequest,
  storeProfileId,
} from './lib/storage';
import { calculateMatchScore } from './lib/matching';

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

const emptyProfile = {
  full_name: '',
  school: '',
  major: '',
  skills: [],
  other_skill: '',
  contact_type: 'email',
  contact_value: '',
  short_bio: '',
  consent_public_visibility: false,
};

const emptyRequest = {
  school: '',
  major: '',
  course_name: '',
  course_code: '',
  class_session: '',
  skills_needed: [],
  other_skill: '',
  members_needed: 1,
  work_styles: [],
  requirements_selected: [],
  required_courses: '',
  minimum_gpa: '',
  portfolio_link_required: false,
  portfolio_upload_enabled: false,
  portfolio_file: null,
  required_tools: [],
  other_tool: '',
  requirements: '',
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

  if (error?.message?.includes('Profile ownership required')) {
    return 'This profile is not linked to the current browser session. Refresh the app first. If this keeps happening, create a new profile on this browser.';
  }

  if (error?.message?.includes('Profile was not updated')) {
    return 'This profile is not linked to the current browser session, so it cannot be edited from here. Refresh first; if it still happens, create a new profile on this browser.';
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

const allCourseOptions = Object.values(coursesBySchool).flat();

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

const getCourseFilterValue = (request) =>
  request?.course_code || request?.course_name || request?.course || '';

const joinList = (items) => {
  if (!items?.length) return 'Not specified';
  return items.join(', ');
};

const getWorkStyles = (request) => {
  if (request?.work_styles?.length) return request.work_styles;
  if (request?.work_style) return [request.work_style];
  return [];
};

const getProfileSkillsFromForm = (form) => [
  ...form.skills.filter((skill) => skill !== 'Other'),
  ...splitList(form.other_skill),
];

const describeRequirements = (request) => {
  const data = request?.requirements_data || {};
  const parts = [];

  if (data.selected?.length) {
    parts.push(...data.selected);
  }

  if (data.required_courses?.length) {
    parts.push(`Courses: ${data.required_courses.join(', ')}`);
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
        <div className="brand-mark">
          <UsersRound size={32} />
        </div>
        <p className="eyebrow">TEAMERGENCY</p>
        <h1>Find your team before it becomes an emergency.</h1>
        <p className="lead">
          Create a reusable student profile, post one current teammate search, then browse
          classmates who fit your course, skills, and schedule.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={profileId ? onStartRequest : onStartProfile}>
            {profileId ? 'Create Teammate Search' : 'Create Profile'}
          </button>
          {requestId && (
            <button className="secondary" onClick={onFindMatches}>
              <Search size={18} />
              Find Matches
            </button>
          )}
        </div>
      </section>

      <section className="flow-panel" aria-label="Current setup">
        <StepRail step={profileId ? (requestId ? 2 : 1) : 0} />
        <div className="status-grid">
          <div>
            <UserRound size={22} />
            <strong>{profileId ? 'Profile saved' : 'Profile needed'}</strong>
            <span>Long-term student details</span>
          </div>
          <div>
            <Search size={22} />
            <strong>{requestId ? 'Search active' : 'No current search'}</strong>
            <span>One course-specific request</span>
          </div>
          <div>
            <CheckCircle2 size={22} />
            <strong>Found is per request</strong>
            <span>Your profile stays reusable</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProfileForm({ onSaved }) {
  const [form, setForm] = useState(emptyProfile);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateSchool = (value) => {
    setForm((current) => ({
      ...current,
      school: value,
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
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
        school: form.school.trim(),
        major: form.major.trim(),
        skills,
        contact_type: form.contact_type,
        contact_value: form.contact_value.trim() || null,
        short_bio: form.short_bio.trim(),
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
            School
            <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
              <option value="">Select school</option>
              {schoolOptions.map((school) => (
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
            <CheckboxGrid
              options={skillOptions}
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
        <h2>{profile?.full_name || 'Your profile'} is ready.</h2>
        <p>Your profile ID is saved on this device and will be used for new teammate searches.</p>
        <button className="primary" onClick={onContinue}>Create Teammate Search Request</button>
      </section>
    </main>
  );
}

function RequestForm({ profile, onCreated, onBack }) {
  const [form, setForm] = useState({
    ...emptyRequest,
    school: schoolOptions.some((school) => school.value === profile.school) ? profile.school : '',
    major: profile.major || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateRequestSchool = (value) => {
    const currentCourse = findCourseByCode(form.course_code);
    const courseStillBelongsToSchool = coursesBySchool[value]?.some(
      (course) => course.code === currentCourse?.code,
    );

    setForm((current) => ({
      ...current,
      school: value,
      major: majorsBySchool[value]?.includes(current.major) ? current.major : '',
      course_name: courseStillBelongsToSchool ? current.course_name : '',
      course_code: courseStillBelongsToSchool ? current.course_code : '',
      class_session: '',
    }));
  };

  const updateCourse = (courseCode) => {
    const selectedCourse = findCourseByCode(courseCode);
    setForm((current) => ({
      ...current,
      course_name: selectedCourse?.name || '',
      course_code: selectedCourse?.code || '',
      class_session: '',
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
          required_courses: '',
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

    if (!form.school || !form.major || !form.course_name || !form.course_code || !form.class_session || skillsNeeded.length === 0 || Number(form.members_needed) < 1) {
      setError('Please fill in school, major, course, class/session, skills needed, and teammates needed.');
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

      const request = await createTeamRequest(profile.id, {
        school: form.school,
        major: form.major,
        course: form.course_name.trim(),
        course_name: form.course_name.trim(),
        course_code: form.course_code.trim(),
        class_session: form.class_session,
        skills_needed: skillsNeeded,
        members_needed: Number(form.members_needed),
        availability: [],
        preferred_active_time: null,
        work_style: null,
        work_styles: form.work_styles,
        requirements_data: {
          selected: form.requirements_selected,
          required_courses: splitList(form.required_courses),
          minimum_gpa: form.minimum_gpa ? Number(form.minimum_gpa) : null,
          portfolio_link_required: requiresPortfolio && form.portfolio_link_required,
          required_tools: requiredTools,
        },
        requires_portfolio: requiresPortfolio,
        portfolio_reference_path: portfolioUpload?.path || null,
        portfolio_reference_name: portfolioUpload?.name || null,
        requirements: form.requirements.trim() || null,
      });
      storeCurrentRequest(request.id, request.editToken);
      onCreated(request);
    } catch (err) {
      setError(getFriendlyError(err, "We couldn't create your teammate search. Please try again."));
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
            <p className="eyebrow">Create Teammate Search Request</p>
            <h2>What team do you need right now?</h2>
          </div>
        </div>

        <div className="profile-strip">
          <GraduationCap size={20} />
          <span>{profile.full_name}</span>
          <span>{schoolLabel(profile.school)} | {profile.major}</span>
        </div>

        <div className="form-grid">
          <label>
            School
            <select value={form.school} onChange={(event) => updateRequestSchool(event.target.value)} required>
              <option value="">Select school</option>
              {schoolOptions.map((school) => (
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
          <label>
            Course
            <select value={form.course_code} onChange={(event) => updateCourse(event.target.value)} required>
              <option value="">Select course</option>
              {(coursesBySchool[form.school] || []).map((course) => (
                <option value={course.code} key={course.code}>{formatCourseOption(course)}</option>
              ))}
            </select>
          </label>
          <label>
            Class / Session
            <select value={form.class_session} onChange={(event) => updateField('class_session', event.target.value)} required>
              <option value="">Select class/session</option>
              {(classSessionsByCourseCode[form.course_code] || []).map((session) => (
                <option value={session} key={session}>{session}</option>
              ))}
            </select>
          </label>
          <fieldset className="wide">
            <legend>What skills are you looking for?</legend>
            <CheckboxGrid
              options={skillOptions}
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
          <label>
            Number of Teammates Needed
            <input
              min="1"
              type="number"
              value={form.members_needed}
              onChange={(event) => updateField('members_needed', event.target.value)}
              required
            />
          </label>
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
            {form.requirements_selected.includes('Has completed specific courses') && (
              <label>
                Which courses?
                <input
                  value={form.required_courses}
                  onChange={(event) => updateField('required_courses', event.target.value)}
                  placeholder="Digital Media Studio 3, Web Programming"
                />
              </label>
            )}
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
          {saving ? 'Creating...' : 'Find Matches'}
        </button>
      </form>
    </main>
  );
}

function MatchCard({ request, onView }) {
  return (
    <article className="match-card">
      <div className="score">
        <Sparkles size={18} />
        {request.matchScore}% Match
      </div>
      <h3>{request.profile.full_name} {request.profile.is_demo && <DemoBadge />}</h3>
      <p>{schoolLabel(request.profile.school)} | {request.profile.major}</p>
      <div className="match-meta">
        <span>{getCourseDisplay(request)}</span>
        {request.class_session && <span>{request.class_session}</span>}
        <span>Needs {request.members_needed}</span>
      </div>
      <div className="mini-detail">
        <strong>Skills needed</strong>
        <span>{joinList(request.skills_needed)}</span>
      </div>
      <div className="mini-detail">
        <strong>Work style</strong>
        <span>{joinList(getWorkStyles(request))}</span>
      </div>
      <PillList items={request.profile.skills} />
      <button className="secondary" onClick={() => onView(request.id, request.matchScore)}>
        View Profile
      </button>
    </article>
  );
}

function MatchResults({ requestId, onViewProfile, onViewCurrent, onCreateNew }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [filters, setFilters] = useState({
    initialized: false,
    school: '',
    major: '',
    course: '',
    classSession: '',
    skill: '',
  });

  useEffect(() => {
    let alive = true;

    getMatchesForRequest(requestId)
      .then((data) => {
        if (alive) setState({ loading: false, error: '', data });
      })
      .catch(() => {
        if (alive) {
          setState({
            loading: false,
            error: "We couldn't load teammates right now. Please try again.",
            data: null,
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId]);

  useEffect(() => {
    if (state.data && !filters.initialized) {
      setFilters((current) => ({
        ...current,
        initialized: true,
        course: getCourseFilterValue(state.data.currentRequest),
      }));
    }
  }, [state.data, filters.initialized]);

  if (state.loading) {
    return <main className="screen compact"><p className="loading">Loading teammates...</p></main>;
  }

  if (state.error) {
    return (
      <main className="screen compact">
        <section className="empty-state">
          <p>{state.error}</p>
          <button className="secondary" onClick={onCreateNew}>Create New Search</button>
        </section>
      </main>
    );
  }

  const { currentRequest, matches } = state.data;
  const skillOptions = [...new Set(matches.flatMap((request) => request.skills_needed || []))];
  const availableMajors = filters.school
    ? majorsBySchool[filters.school] || []
    : [...new Set(Object.values(majorsBySchool).flat())];
  const filteredMatches = matches
    .filter((request) => !filters.school || request.school === filters.school || request.profile.school === filters.school)
    .filter((request) => !filters.major || request.major === filters.major || request.profile.major === filters.major)
    .filter((request) => !filters.course || getCourseFilterValue(request) === filters.course)
    .filter((request) => !filters.classSession || request.class_session === filters.classSession)
    .filter((request) => !filters.skill || request.skills_needed?.includes(filters.skill) || request.profile.skills?.includes(filters.skill));

  return (
    <main className="screen results">
      <StepRail step={2} />
      <div className="results-header">
        <div>
          <p className="eyebrow">Match Results</p>
          <h2>{getCourseDisplay(currentRequest)}</h2>
          <p>Looking for {joinList(currentRequest.skills_needed)}</p>
        </div>
        <button className="secondary" onClick={onViewCurrent}>
          <Clock3 size={18} />
          My Current Request
        </button>
      </div>

      <section className="filter-panel">
        <label>
          School
          <select
            value={filters.school}
            onChange={(event) => setFilters((current) => ({ ...current, school: event.target.value, major: '' }))}
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
          <select value={filters.course} onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value, classSession: '' }))}>
            <option value="">All courses</option>
            {[
              ...new Map(
                matches
                  .map((request) => [getCourseFilterValue(request), getCourseDisplay(request)])
                  .filter(([value]) => Boolean(value)),
              ),
            ].map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Class / Session
          <select value={filters.classSession} onChange={(event) => setFilters((current) => ({ ...current, classSession: event.target.value }))}>
            <option value="">All classes</option>
            {[...new Set(matches.map((request) => request.class_session).filter(Boolean))].map((session) => (
              <option value={session} key={session}>{session}</option>
            ))}
          </select>
        </label>
        <label>
          Skills
          <select value={filters.skill} onChange={(event) => setFilters((current) => ({ ...current, skill: event.target.value }))}>
            <option value="">All skills</option>
            {skillOptions.map((skill) => (
              <option value={skill} key={skill}>{skill}</option>
            ))}
          </select>
        </label>
      </section>

      {filteredMatches.length === 0 ? (
        <section className="empty-state">
          <p>No teammates match your current search yet. Try changing your criteria.</p>
          <button className="primary" onClick={onCreateNew}>Create Another Search</button>
        </section>
      ) : (
        <div className="match-grid">
          {filteredMatches.map((request) => (
            <MatchCard request={request} key={request.id} onView={onViewProfile} />
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
    sentByProfile: {},
    sendingProfileId: '',
    modalProfile: null,
    modalError: '',
  });
  const [filters, setFilters] = useState({ school: '', major: '', skill: '' });

  useEffect(() => {
    let alive = true;

    getDiscoverProfiles()
      .then((profiles) => {
        if (alive) setState((current) => ({ ...current, loading: false, error: '', profiles }));
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
  }, []);

  const filteredProfiles = state.profiles
    .filter((profile) => profile.id !== currentProfileId)
    .filter((profile) => !filters.school || profile.school === filters.school)
    .filter((profile) => !filters.major || profile.major === filters.major)
    .filter((profile) => !filters.skill || profile.skills?.includes(filters.skill));

  const availableMajors = filters.school
    ? majorsBySchool[filters.school] || []
    : [...new Set(Object.values(majorsBySchool).flat())];
  const discoverSkillOptions = skillOptions.filter((skill) => skill !== 'Other');

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
          School
          <select
            value={filters.school}
            onChange={(event) => setFilters({ school: event.target.value, major: '', skill: filters.skill })}
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
            const sentConnection = state.sentByProfile[profile.id];
            const sentStatus = sentConnection?.status;

            return (
              <article className="discover-card" key={profile.id}>
                <div className="avatar">{profile.full_name.slice(0, 1)}</div>
                <h3>{profile.full_name} {profile.is_demo && <DemoBadge />}</h3>
                <p>{schoolLabel(profile.school)}</p>
                <p>{profile.major}</p>
                <p>{profile.short_bio || 'No bio added yet.'}</p>
                <PillList items={profile.skills} />
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
                  ) : sentStatus === 'accepted' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>View Match</button>
                  ) : sentStatus === 'pending' ? (
                    <button className="secondary" onClick={() => onOpenProfile(profile.id)}>Continue Demo</button>
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
          receiverName={state.modalProfile.full_name}
          sending={state.sendingProfileId === state.modalProfile.id}
          error={state.modalError}
          onClose={() => setState((current) => ({ ...current, modalProfile: null, modalError: '' }))}
          onSend={sendDiscoverConnect}
        />
      )}
    </main>
  );
}

function DiscoverProfileDetail({ profileId, currentProfileId, onBack, onOpenChat }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    profile: null,
    connection: null,
    modalOpen: false,
    sending: false,
    simulating: false,
    actionError: '',
  });

  useEffect(() => {
    let alive = true;

    getProfileById(profileId)
      .then(async (profile) => {
        const connection = currentProfileId ? await getConnectionBetween(currentProfileId, profile.id) : null;
        if (alive) {
          setState((current) => ({ ...current, loading: false, error: '', profile, connection }));
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

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to Discover
      </button>
      <section className="profile-panel standalone">
        <div className="avatar">{profile.full_name.slice(0, 1)}</div>
        <p className="eyebrow">Discover Profile</p>
        <h2>{profile.full_name} {profile.is_demo && <DemoBadge />}</h2>
        <p>{profile.short_bio || 'No bio added yet.'}</p>
        <dl>
          <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
          <div><dt>Major</dt><dd>{profile.major}</dd></div>
          <div><dt>Skills</dt><dd>{joinList(profile.skills)}</dd></div>
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
        {state.actionError && <p className="error">{state.actionError}</p>}
        {disabledReason ? (
          <div className="stacked-actions">
            <button className="disabled-contact" disabled>
              <UserPlus size={18} />
              Connect
            </button>
            <p className="connection-hint">{disabledReason}</p>
          </div>
        ) : state.connection?.status === 'accepted' ? (
          <button className="connected-button" disabled>Connected</button>
        ) : state.connection?.status === 'pending' ? (
          <button className="disabled-contact" disabled>Request Sent</button>
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
          receiverName={profile.full_name}
          sending={state.sending}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, modalOpen: false, actionError: '' }))}
          onSend={sendConnect}
        />
      )}
    </main>
  );
}

function ProfileDetail({
  requestId,
  currentProfileId,
  currentRequestId,
  matchScore,
  onBack,
  onOpenChat,
}) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    request: null,
    connection: null,
    actionError: '',
    actionLoading: false,
    added: false,
    connectModalOpen: false,
    simulating: false,
  });

  useEffect(() => {
    let alive = true;

    getTeamRequestById(requestId)
      .then(async (request) => {
        const connection = currentProfileId
          ? await getConnectionBetween(currentProfileId, request.profile.id)
          : null;

        if (alive) {
          setState((current) => ({
            ...current,
            loading: false,
            error: '',
            request,
            connection,
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

  const addCurrentTeammate = async () => {
    setState((current) => ({ ...current, actionLoading: true, actionError: '' }));

    try {
      await addTeamMember({
        currentProfileId,
        currentRequestId,
        connectionId: connection.id,
      });
      setState((current) => ({ ...current, actionLoading: false, added: true }));
    } catch {
      setState((current) => ({
        ...current,
        actionLoading: false,
        actionError: "We couldn't add this teammate. Please try again.",
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

    if (!connection || connection.status === 'declined' || connection.status === 'cancelled') {
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

    if (connection.status === 'pending') {
      return <button className="disabled-contact" disabled>Request Sent</button>;
    }

    if (connection.status === 'accepted') {
      return (
        <div className="stacked-actions">
          <button className="connected-button" disabled>
            <CheckCircle2 size={18} />
            Connected
          </button>
          <button className="primary link-button" onClick={() => onOpenChat(connection.id)}>
            <MessageCircle size={18} />
            Message
          </button>
          {currentRequestId && (
            <button className="secondary link-button" onClick={addCurrentTeammate} disabled={state.actionLoading || state.added}>
              <UsersRound size={18} />
              {state.added ? 'Added to My Team' : 'Add to My Team'}
            </button>
          )}
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
          <div className="avatar">{profile.full_name.slice(0, 1)}</div>
          <p className="eyebrow">Profile Data</p>
          <h2>{profile.full_name} {profile.is_demo && <DemoBadge />}</h2>
          <p>{profile.short_bio || 'No bio added yet.'}</p>
          <dl>
            <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
            <div><dt>Major</dt><dd>{profile.major}</dd></div>
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
          <PillList items={profile.skills} />
          {state.actionError && <p className="error">{state.actionError}</p>}
          {renderConnectionAction()}
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
          <p className="eyebrow">Current Team Request</p>
          <h3>{getCourseDisplay(request)}</h3>
          <dl>
            {typeof matchScore === 'number' && <div><dt>Match Score</dt><dd>{matchScore}% Match</dd></div>}
            <div><dt>School</dt><dd>{schoolLabel(request.school || profile.school)}</dd></div>
            <div><dt>Major</dt><dd>{request.major || profile.major}</dd></div>
            <div><dt>Class / Session</dt><dd>{request.class_session || 'Not specified'}</dd></div>
            <div><dt>Skills Needed</dt><dd>{joinList(request.skills_needed)}</dd></div>
            <div><dt>Number of Teammates Needed</dt><dd>{request.members_needed}</dd></div>
            <div><dt>Work Style</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
            <div><dt>Requirements</dt><dd>{describeRequirements(request)}</dd></div>
            <PortfolioReference request={request} />
          </dl>
          {currentRequestId === request.id && <p className="note">This is your current request.</p>}
        </div>
      </section>
      {state.connectModalOpen && (
        <ConnectModal
          receiverName={profile.full_name}
          sending={state.actionLoading}
          error={state.actionError}
          onClose={() => setState((current) => ({ ...current, connectModalOpen: false, actionError: '' }))}
          onSend={connect}
        />
      )}
    </main>
  );
}

function CurrentRequest({ requestId, onBack, onFound }) {
  const [state, setState] = useState({ loading: true, error: '', request: null, saving: false });

  useEffect(() => {
    let alive = true;

    getTeamRequestById(requestId)
      .then((request) => {
        if (alive) setState({ loading: false, error: '', request, saving: false });
      })
      .catch(() => {
        if (alive) {
          setState({
            loading: false,
            error: "We couldn't load teammates right now. Please try again.",
            request: null,
            saving: false,
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [requestId]);

  const markFound = async () => {
    setState((current) => ({ ...current, saving: true, error: '' }));

    try {
      await markTeamRequestFound(requestId, {
        editToken: getStoredRequestEditToken(),
      });
      clearCurrentRequest();
      onFound();
    } catch {
      setState((current) => ({
        ...current,
        saving: false,
        error: "We couldn't update your request. Please try again.",
      }));
    }
  };

  if (state.loading) {
    return <main className="screen compact"><p className="loading">Loading request...</p></main>;
  }

  if (state.error && !state.request) {
    return <main className="screen compact"><p className="error">{state.error}</p></main>;
  }

  const request = state.request;

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back to Matches
      </button>
      <section className="request-panel standalone">
        <p className="eyebrow">My Current Request</p>
        <h2>{getCourseDisplay(request)}</h2>
        <dl>
          <div><dt>School</dt><dd>{schoolLabel(request.school || request.profile?.school)}</dd></div>
          <div><dt>Major</dt><dd>{request.major || request.profile?.major || 'Not specified'}</dd></div>
          <div><dt>Class / Session</dt><dd>{request.class_session || 'Not specified'}</dd></div>
          <div><dt>Skills Needed</dt><dd>{joinList(request.skills_needed)}</dd></div>
          <div><dt>Teammates Needed</dt><dd>{request.members_needed}</dd></div>
          <div><dt>Work Style</dt><dd>{joinList(getWorkStyles(request))}</dd></div>
          <div><dt>Requirements</dt><dd>{describeRequirements(request)}</dd></div>
          <PortfolioReference request={request} />
          <div><dt>Status</dt><dd>{titleCase(request.status)}</dd></div>
        </dl>
        {state.error && <p className="error">{state.error}</p>}
        <button className="primary" onClick={markFound} disabled={state.saving}>
          {state.saving ? 'Updating...' : 'I found my teammate'}
        </button>
      </section>
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

function ConnectionsPage({ currentProfileId, currentRequestId, onOpenChat }) {
  const [tab, setTab] = useState('incoming');
  const [state, setState] = useState({
    loading: true,
    error: '',
    incoming: [],
    sent: [],
    currentRequest: null,
    actionLoadingId: '',
  });

  const loadConnections = async () => {
    if (!currentProfileId) {
      setState((current) => ({ ...current, loading: false, incoming: [], sent: [] }));
      return;
    }

    setState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const [incoming, sent, currentRequest] = await Promise.all([
        getConnectionRequests(currentProfileId, 'incoming'),
        getConnectionRequests(currentProfileId, 'sent'),
        currentRequestId ? getTeamRequestById(currentRequestId).catch(() => null) : Promise.resolve(null),
      ]);
      setState((current) => ({ ...current, loading: false, incoming, sent, currentRequest }));
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

  const activeRows = tab === 'incoming' ? state.incoming : state.sent;

  return (
    <main className="screen">
      <div className="results-header">
        <div>
          <p className="eyebrow">Connections</p>
          <h2>Connection requests</h2>
        </div>
        <div className="segmented">
          <button className={tab === 'incoming' ? 'selected' : ''} onClick={() => setTab('incoming')}>
            Incoming
          </button>
          <button className={tab === 'sent' ? 'selected' : ''} onClick={() => setTab('sent')}>
            Sent
          </button>
        </div>
      </div>

      {!currentProfileId && (
        <section className="empty-state">
          <p>Create a profile before using connections.</p>
        </section>
      )}

      {currentProfileId && state.loading && <p className="loading">Loading connections...</p>}
      {state.error && <p className="error">{state.error}</p>}

      {currentProfileId && !state.loading && activeRows.length === 0 && (
        <section className="empty-state">
          <p>{tab === 'incoming' ? 'No connection requests yet.' : 'No sent requests yet.'}</p>
        </section>
      )}

      {currentProfileId && !state.loading && activeRows.length > 0 && (
        <div className="connection-list">
          {activeRows.map((request) => (
            <article className="connection-row" key={request.id}>
              <div>
                <h3>{request.teammate_full_name} {request.teammate_full_name?.includes('(Demo)') && <DemoBadge />}</h3>
                <p>{schoolLabel(request.teammate_school)} | {request.teammate_major}</p>
                {getCourseFilterValue(request) ? (
                  <p>{getCourseDisplay(request)}{request.class_session ? ` | ${request.class_session}` : ''}</p>
                ) : (
                  <p>Discover connection</p>
                )}
                {request.intro_message && <blockquote className="intro-message">{request.intro_message}</blockquote>}
                {tab === 'incoming' && request.sender_team_request_id && state.currentRequest && (
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
                <PillList items={request.teammate_skills} />
              </div>
              <div className="connection-actions">
                <span className={`status-badge ${request.status}`}>{titleCase(request.status)}</span>
                {tab === 'incoming' && (
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
              </div>
            </article>
          ))}
        </div>
      )}

      {currentProfileId && !currentRequestId && (
        <p className="note">Create a current teammate search before sending new Connect requests.</p>
      )}
    </main>
  );
}

function MessagesList({ currentProfileId, onOpenChat }) {
  const [state, setState] = useState({ loading: true, error: '', threads: [] });

  useEffect(() => {
    let alive = true;

    if (!currentProfileId) {
      setState({ loading: false, error: '', threads: [] });
      return;
    }

    getMessageThreads(currentProfileId)
      .then((threads) => {
        if (alive) setState({ loading: false, error: '', threads });
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
            <button
              className="thread-row"
              key={thread.connection_id}
              onClick={() => onOpenChat(thread.connection_id)}
            >
              <div>
                <strong>{thread.teammate_full_name}</strong>
                <span>{thread.last_message || 'No messages yet. Say hello!'}</span>
              </div>
              <time>{formatThreadTime(thread.last_message_at || thread.updated_at)}</time>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function ChatPage({ connectionId, currentProfileId, currentRequestId, onBack }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    detail: null,
    messages: [],
    sending: false,
    addState: '',
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

      if (!detail || detail.status !== 'accepted') {
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
    if (!body || state.sending) return;

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

  const addTeammate = async () => {
    if (!currentRequestId) {
      setState((current) => ({ ...current, addState: 'Create a current search before adding teammates.' }));
      return;
    }

    setState((current) => ({ ...current, addState: 'Adding...' }));

    try {
      await addTeamMember({ currentProfileId, currentRequestId, connectionId });
      setState((current) => ({ ...current, addState: 'Added to My Team' }));
    } catch {
      setState((current) => ({ ...current, addState: "We couldn't add this teammate. Please try again." }));
    }
  };

  return (
    <main className="screen compact">
      <button className="ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} />
        Back
      </button>

      <section className="chat-shell">
        <div className="chat-header">
          <div>
            <h2>{state.detail?.teammate_full_name || 'Conversation'}</h2>
            <p>
              {state.detail?.teammate_is_demo
                ? 'Demo Conversation'
                : state.detail?.status === 'accepted'
                  ? 'Connected'
                  : 'Connection required'}
            </p>
          </div>
          {state.detail?.status === 'accepted' && (
            <button className="secondary" onClick={addTeammate}>
              <UsersRound size={18} />
              Add to My Team
            </button>
          )}
        </div>

        {state.addState && <p className="note">{state.addState}</p>}
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
                    <span>{mine ? 'You' : state.detail.teammate_full_name}</span>
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
                placeholder="Type a message..."
              />
              <button className="primary" onClick={send} disabled={!messageText.trim() || state.sending}>
                <SendHorizontal size={18} />
                {state.sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function MyProfile({ profile, onCreateProfile, onCreateSearch, onProfileUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const startEdit = () => {
    const school = schoolOptions.some((option) => option.value === profile.school) ? profile.school : '';
    setForm({
      full_name: profile.full_name || '',
      school,
      major: school && majorsBySchool[school]?.includes(profile.major) ? profile.major : '',
      skills: profile.skills || [],
      other_skill: '',
      contact_type: profile.contact_type || 'email',
      contact_value: profile.contact_value || '',
      short_bio: profile.short_bio || '',
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
        school: form.school.trim(),
        major: form.major.trim(),
        skills,
        contact_type: form.contact_type,
        contact_value: form.contact_value.trim(),
        short_bio: form.short_bio.trim(),
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
                School
                <select value={form.school} onChange={(event) => updateSchool(event.target.value)} required>
                  <option value="">Select school</option>
                  {schoolOptions.map((school) => (
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
                <CheckboxGrid
                  options={skillOptions}
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
            <div className="avatar">{profile.full_name.slice(0, 1)}</div>
            <h2>{profile.full_name}</h2>
            <dl>
              <div><dt>School</dt><dd>{schoolLabel(profile.school)}</dd></div>
              <div><dt>Major</dt><dd>{profile.major}</dd></div>
              <div><dt>Contact</dt><dd>{contactLabel(profile.contact_type)}: {profile.contact_value}</dd></div>
              <div><dt>Bio</dt><dd>{profile.short_bio || 'Not specified'}</dd></div>
            </dl>
            <PillList items={profile.skills} />
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
  const [profileId, setProfileId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [profile, setProfile] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedMatchScore, setSelectedMatchScore] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedDiscoverProfileId, setSelectedDiscoverProfileId] = useState('');
  const [bootError, setBootError] = useState('');

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

  const configWarning = useMemo(() => {
    if (hasSupabaseConfig) return '';
    return 'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to run the MVP.';
  }, []);

  const startRequest = async () => {
    setBootError('');

    if (!profileId) {
      setView('profile');
      return;
    }

    if (profile) {
      setView('request');
      return;
    }

    try {
      const loadedProfile = await getProfileById(profileId, { claimLegacy: true });
      setProfile(loadedProfile);
      setView('request');
    } catch {
      setBootError("We couldn't load your saved profile. Please create a profile again on this device.");
      setView('profile');
    }
  };

  const findMatches = () => {
    if (!requestId) {
      startRequest();
      return;
    }
    setView('matches');
  };

  const openChat = (connectionId) => {
    setSelectedConnectionId(connectionId);
    setView('chat');
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo-button" onClick={() => setView('home')}>
          <UsersRound size={22} />
          TEAMERGENCY
        </button>
        <div className="top-actions">
          {requestId && <button className="ghost" onClick={findMatches}>Find Teammates</button>}
          <button className="ghost" onClick={() => setView('discover')}>Discover</button>
          {requestId && <button className="ghost" onClick={() => setView('current-request')}>My Request</button>}
          <button className="ghost" onClick={() => setView('connections')}>Connections</button>
          <button className="ghost" onClick={() => setView('messages')}>Messages</button>
          <button className="ghost" onClick={() => setView('my-profile')}>My Profile</button>
        </div>
      </header>

      {configWarning && <div className="banner">{configWarning}</div>}
      {bootError && <div className="banner error-banner">{bootError}</div>}

      {view === 'home' && (
        <Home
          profileId={profileId}
          requestId={requestId}
          onStartProfile={() => setView('profile')}
          onStartRequest={startRequest}
          onFindMatches={findMatches}
        />
      )}

      {view === 'profile' && (
        <ProfileForm
          onSaved={(savedProfile) => {
            setProfile(savedProfile);
            setProfileId(savedProfile.id);
            setView('profile-saved');
          }}
        />
      )}

      {view === 'profile-saved' && (
        <ProfileSaved profile={profile} onContinue={() => setView('request')} />
      )}

      {view === 'request' && profile && (
        <RequestForm
          profile={profile}
          onBack={() => setView('home')}
          onCreated={(request) => {
            setRequestId(request.id);
            setView('matches');
          }}
        />
      )}

      {view === 'matches' && requestId && (
        <MatchResults
          requestId={requestId}
          onCreateNew={startRequest}
          onViewCurrent={() => setView('current-request')}
          onViewProfile={(id, score) => {
            setSelectedRequestId(id);
            setSelectedMatchScore(score);
            setView('profile-detail');
          }}
        />
      )}

      {view === 'profile-detail' && selectedRequestId && (
        <ProfileDetail
          currentProfileId={profileId}
          currentRequestId={requestId}
          matchScore={selectedMatchScore}
          requestId={selectedRequestId}
          onBack={() => setView('matches')}
          onOpenChat={openChat}
        />
      )}

      {view === 'current-request' && requestId && (
        <CurrentRequest
          requestId={requestId}
          onBack={() => setView('matches')}
          onFound={() => {
            setRequestId('');
            setView('found');
          }}
        />
      )}

      {view === 'found' && (
        <FoundConfirmation
          onCreateAnother={startRequest}
          onHome={() => setView('home')}
        />
      )}

      {view === 'connections' && (
        <ConnectionsPage
          currentProfileId={profileId}
          currentRequestId={requestId}
          onOpenChat={openChat}
        />
      )}

      {view === 'discover' && (
        <DiscoverPage
          currentProfileId={profileId}
          onOpenProfile={(id) => {
            setSelectedDiscoverProfileId(id);
            setView('discover-profile');
          }}
        />
      )}

      {view === 'discover-profile' && selectedDiscoverProfileId && (
        <DiscoverProfileDetail
          profileId={selectedDiscoverProfileId}
          currentProfileId={profileId}
          onBack={() => setView('discover')}
          onOpenChat={openChat}
        />
      )}

      {view === 'messages' && (
        <MessagesList
          currentProfileId={profileId}
          onOpenChat={openChat}
        />
      )}

      {view === 'chat' && (
        <ChatPage
          connectionId={selectedConnectionId}
          currentProfileId={profileId}
          currentRequestId={requestId}
          onBack={() => setView('messages')}
        />
      )}

      {view === 'my-profile' && (
        <MyProfile
          profile={profile}
          onCreateProfile={() => setView('profile')}
          onCreateSearch={startRequest}
          onProfileUpdated={(updatedProfile) => setProfile(updatedProfile)}
        />
      )}
    </div>
  );
}
