export const contactTypes = ['email', 'instagram', 'messenger', 'url'];

export const opportunityTypes = [
  'Competition',
  'Hackathon',
  'Club Project',
  'University Event',
  'External Event',
  'Personal Project',
  'Other',
];

export const opportunityFields = [
  'Design',
  'Digital Media',
  'Computer Science',
  'Information Technology',
  'Business',
  'Marketing',
  'Engineering',
  'Data Science',
  'Communication',
  'Entrepreneurship',
  'Other',
];

export const universityOptions = [
  { value: 'RMIT University', label: 'RMIT University' },
  {
    value: 'University of Economics Ho Chi Minh City',
    label: 'University of Economics Ho Chi Minh City',
  },
  {
    value: 'University of Technology Ho Chi Minh City',
    label: 'University of Technology Ho Chi Minh City',
  },
  {
    value: 'University of Information Technology',
    label: 'University of Information Technology',
  },
  {
    value: 'Foreign Trade University',
    label: 'Foreign Trade University',
  },
];

export const OTHER_UNIVERSITY_VALUE = '__other_university__';

export const schoolOptions = [
  { value: 'SCD', label: 'School of Communication & Design (SCD)' },
  { value: 'TBS', label: 'The Business School (TBS)' },
  { value: 'SSET', label: 'School of Science, Engineering & Technology (SSET)' },
];

export const majorsBySchool = {
  SCD: ['Digital Media', 'Design Studies', 'Professional Communication', 'Digital Film and Video'],
  TBS: ['Business', 'Marketing', 'Business Analytics'],
  SSET: ['Information Technology', 'Software Engineering', 'Computer Science', 'Data Science', 'Engineering'],
};

export const coursesBySchool = {
  SCD: [
    { name: 'Digital Media Studio 4', code: 'COMM2784' },
    { name: 'Digital Storytelling', code: 'COMM2750' },
    { name: 'Creative Coding', code: 'COMM2778' },
    { name: 'Brand Identity Studio', code: 'COMM2762' },
    { name: 'Public Relations Planning', code: 'COMM2825' },
  ],
  TBS: [
    { name: 'Integrated Marketing Campaign', code: 'MKTG2301' },
    { name: 'Consumer Behaviour', code: 'MKTG2308' },
    { name: 'Market Research', code: 'MKTG2305' },
    { name: 'Data Storytelling', code: 'BUSM2655' },
  ],
  SSET: [
    { name: 'Web Programming', code: 'COSC2430' },
    { name: 'Software Engineering', code: 'COSC2440' },
    { name: 'Service Design', code: 'ISYS2101' },
    { name: 'Creative Coding', code: 'COSC2818' },
  ],
};

export const skillsByMajor = {
  'Digital Media': [
    'Photography',
    'Videography',
    'Video Editing',
    'Motion Graphics',
    'TouchDesigner',
    'Creative Coding',
    'HTML/CSS',
    'JavaScript',
    'UI/UX',
    'Blender',
    '3D Modelling',
  ],
  'Design Studies': [
    'Graphic Design',
    'UI/UX',
    'Figma',
    'Adobe Photoshop',
    'Adobe Illustrator',
    'Branding',
    'Typography',
    'Illustration',
    'Presentation',
  ],
  'Professional Communication': [
    'Content Creation',
    'Copywriting',
    'Social Media',
    'Research',
    'Writing',
    'Presentation',
    'Campaign Planning',
    'Public Relations',
  ],
  'Digital Film and Video': [
    'Photography',
    'Videography',
    'Video Editing',
    'Motion Graphics',
    'Premiere Pro',
    'After Effects',
    'Storyboarding',
    'Sound Design',
  ],
  Business: [
    'Business Strategy',
    'Finance',
    'Accounting',
    'Data Analysis',
    'Project Management',
    'Presentation',
    'Excel',
    'Market Research',
  ],
  Marketing: [
    'Marketing',
    'Market Research',
    'Campaign Planning',
    'Content Creation',
    'Social Media',
    'Copywriting',
    'Data Analysis',
    'Presentation',
  ],
  'Business Analytics': [
    'Data Analysis',
    'Excel',
    'SQL',
    'Python',
    'Dashboard Design',
    'Market Research',
    'Business Strategy',
    'Presentation',
  ],
  'Information Technology': [
    'JavaScript',
    'Python',
    'Java',
    'C++',
    'HTML/CSS',
    'SQL',
    'Database',
    'Git/GitHub',
    'Web Development',
    'Data Analysis',
  ],
  'Software Engineering': [
    'JavaScript',
    'Python',
    'Java',
    'C++',
    'HTML/CSS',
    'SQL',
    'Database',
    'Git/GitHub',
    'Web Development',
    'Project Management',
  ],
  'Computer Science': [
    'Python',
    'Java',
    'C++',
    'JavaScript',
    'SQL',
    'Database',
    'Git/GitHub',
    'Algorithms',
    'Data Analysis',
    'Web Development',
  ],
  'Data Science': [
    'Python',
    'Data Analysis',
    'Data Visualization',
    'Machine Learning',
    'Dashboard Design',
    'SQL',
    'Research',
  ],
  Engineering: [
    'CAD',
    'MATLAB',
    'Engineering Design',
    'Prototyping',
    'Data Analysis',
    'Project Management',
    'Presentation',
  ],
};

export const skillsBySchool = {
  SCD: [
    'Photography',
    'Videography',
    'Video Editing',
    'Motion Graphics',
    'Graphic Design',
    'UI/UX',
    'Figma',
    'Adobe Photoshop',
    'Adobe Illustrator',
    'Premiere Pro',
    'After Effects',
    'Blender',
    '3D Modelling',
    'TouchDesigner',
    'Creative Coding',
    'HTML/CSS',
    'JavaScript',
    'Content Creation',
    'Copywriting',
    'Social Media',
    'Research',
    'Writing',
    'Presentation',
  ],
  TBS: [
    'Marketing',
    'Market Research',
    'Business Strategy',
    'Finance',
    'Accounting',
    'Economics',
    'Data Analysis',
    'Excel',
    'Project Management',
    'Presentation',
    'Sales',
    'Branding',
    'Consumer Research',
    'Entrepreneurship',
  ],
  SSET: [
    'Python',
    'Java',
    'JavaScript',
    'C++',
    'HTML/CSS',
    'SQL',
    'Database',
    'Git/GitHub',
    'Web Development',
    'Software Development',
    'Data Analysis',
    'Machine Learning',
    'CAD',
    'MATLAB',
    'Engineering Design',
    'Prototyping',
    'Project Management',
  ],
};

export const classSessionsByCourseCode = {
  COMM2784: [
    { id: 'COMM2784-S01', code: '01', lecturer: 'Dr. Linh Nguyen' },
    { id: 'COMM2784-S02', code: '02', lecturer: 'Dr. Minh Tran' },
    { id: 'COMM2784-S03', code: '03' },
  ],
  COMM2750: [
    { id: 'COMM2750-S01', code: '01' },
    { id: 'COMM2750-S02', code: '02', lecturer: 'Dr. An Vo' },
  ],
  COMM2778: [
    { id: 'COMM2778-S01', code: '01' },
    { id: 'COMM2778-S02', code: '02' },
  ],
  COMM2762: [
    { id: 'COMM2762-S01', code: '01' },
    { id: 'COMM2762-S02', code: '02' },
  ],
  COMM2825: [
    { id: 'COMM2825-S01', code: '01' },
    { id: 'COMM2825-S02', code: '02' },
  ],
  MKTG2301: [
    { id: 'MKTG2301-S01', code: '01' },
    { id: 'MKTG2301-S02', code: '02' },
  ],
  MKTG2305: [
    { id: 'MKTG2305-S01', code: '01' },
    { id: 'MKTG2305-S02', code: '02' },
  ],
  BUSM2655: [
    { id: 'BUSM2655-S01', code: '01' },
    { id: 'BUSM2655-S02', code: '02' },
  ],
  COSC2430: [
    { id: 'COSC2430-S01', code: '01' },
    { id: 'COSC2430-S02', code: '02' },
  ],
  ISYS2101: [
    { id: 'ISYS2101-S01', code: '01' },
    { id: 'ISYS2101-S02', code: '02' },
  ],
  COSC2818: [
    { id: 'COSC2818-S01', code: '01' },
    { id: 'COSC2818-S02', code: '02' },
  ],
};

export const classDayOptions = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const skillOptions = [
  'UI/UX',
  'Graphic Design',
  'Photography',
  'Videography',
  'Video Editing',
  'Motion Graphics',
  '3D Modelling',
  'Blender',
  'HTML/CSS',
  'JavaScript',
  'Creative Coding',
  'TouchDesigner',
  'Content Creation',
  'Social Media',
  'Research',
  'Writing',
  'Presentation',
  'Project Management',
  'Figma',
  'Adobe Photoshop',
  'Adobe Illustrator',
  'After Effects',
  'Premiere Pro',
  'Branding',
  'Typography',
  'Illustration',
  'Copywriting',
  'Campaign Planning',
  'Public Relations',
  'Storyboarding',
  'Sound Design',
  'Marketing',
  'Market Research',
  'Business Strategy',
  'Finance',
  'Accounting',
  'Economics',
  'Data Analysis',
  'Excel',
  'Sales',
  'Consumer Research',
  'Entrepreneurship',
  'Python',
  'Java',
  'C++',
  'SQL',
  'Database',
  'Git/GitHub',
  'Web Development',
  'Software Development',
  'Machine Learning',
  'Dashboard Design',
  'Algorithms',
  'CAD',
  'MATLAB',
  'Engineering Design',
  'Prototyping',
  'Other',
];

export const academicCatalog = schoolOptions.map((school) => ({
  ...school,
  majors: (majorsBySchool[school.value] || []).map((major) => ({
    name: major,
    skills: skillsByMajor[major] || [],
  })),
  courses: coursesBySchool[school.value] || [],
  skills: skillsBySchool[school.value] || [],
}));

export const academicData = {
  'RMIT University': {
    schools: academicCatalog,
  },
  'University of Economics Ho Chi Minh City': {
    schools: academicCatalog,
  },
  'University of Technology Ho Chi Minh City': {
    schools: academicCatalog,
  },
  'University of Information Technology': {
    schools: academicCatalog,
  },
  'Foreign Trade University': {
    schools: academicCatalog,
  },
};

export const getSchoolsForUniversity = (university) =>
  academicData[university]?.schools || academicCatalog;

export const uniqueList = (items) => [...new Set(items.filter(Boolean))];

export const fallbackMajorSkills = [
  'Research',
  'Presentation',
  'Communication',
  'Teamwork',
  'Project Management',
  'Critical Thinking',
  'Writing',
  'Data Analysis',
];

export const majorSkillRecommendationGroups = [
  {
    keywords: ['business analytics', 'data science', 'data analytics', 'analytics', 'statistics'],
    skills: [
      'Python',
      'SQL',
      'Microsoft Excel',
      'Data Analysis',
      'Statistics',
      'Data Visualization',
      'Power BI',
      'Tableau',
      'Machine Learning',
      'Research',
      'Data Cleaning',
    ],
  },
  {
    keywords: [
      'computer science',
      'information technology',
      'it',
      'software engineering',
      'computer engineering',
      'web development',
      'programming',
    ],
    skills: [
      'HTML/CSS',
      'JavaScript',
      'TypeScript',
      'React',
      'Python',
      'Java',
      'SQL',
      'Git/GitHub',
      'Web Development',
      'Database',
      'API Development',
      'Problem Solving',
      'UI/UX',
    ],
  },
  {
    keywords: [
      'economics',
      'economy',
      'business',
      'finance',
      'accounting',
      'commerce',
      'banking',
      'international business',
    ],
    skills: [
      'Research',
      'Data Analysis',
      'Microsoft Excel',
      'Financial Analysis',
      'Market Research',
      'Business Analysis',
      'Presentation',
      'Report Writing',
      'Critical Thinking',
      'Project Management',
      'Statistics',
      'PowerPoint',
    ],
  },
  {
    keywords: ['marketing', 'digital marketing', 'advertising', 'communications', 'communication', 'public relations', 'pr'],
    skills: [
      'Social Media',
      'Content Creation',
      'Copywriting',
      'Market Research',
      'Branding',
      'Digital Marketing',
      'SEO',
      'Analytics',
      'Presentation',
      'Adobe Photoshop',
      'Canva',
      'Campaign Planning',
      'Content Strategy',
    ],
  },
  {
    keywords: ['digital media', 'media', 'multimedia', 'creative media', 'film', 'video'],
    skills: [
      'Photography',
      'Videography',
      'Video Editing',
      'Adobe Premiere Pro',
      'After Effects',
      'Motion Graphics',
      'Blender',
      '3D Modelling',
      'Content Creation',
      'Creative Coding',
      'Social Media',
      'Storytelling',
    ],
  },
  {
    keywords: ['design', 'graphic design', 'communication design', 'visual communication', 'ux', 'ui', 'interaction design', 'product design'],
    skills: [
      'UI/UX',
      'Figma',
      'Adobe Photoshop',
      'Adobe Illustrator',
      'Adobe InDesign',
      'Prototyping',
      'User Research',
      'Wireframing',
      'Typography',
      'Branding',
      'Graphic Design',
      'Design Thinking',
    ],
  },
  {
    keywords: ['architecture', 'interior design', 'interior architecture', 'built environment'],
    skills: [
      'AutoCAD',
      'SketchUp',
      'Revit',
      'Rhino',
      '3D Modelling',
      'Adobe Photoshop',
      'Adobe Illustrator',
      'Rendering',
      'Technical Drawing',
      'Presentation',
    ],
  },
  {
    keywords: ['engineering', 'mechanical', 'electrical', 'electronic', 'civil', 'mechatronics', 'robotics'],
    skills: [
      'CAD',
      'AutoCAD',
      'SolidWorks',
      'MATLAB',
      'Technical Drawing',
      'Problem Solving',
      'Project Management',
      'Research',
      'Data Analysis',
      'Prototyping',
    ],
  },
  {
    keywords: ['fashion', 'fashion design', 'textile', 'textiles'],
    skills: [
      'Adobe Illustrator',
      'Adobe Photoshop',
      'Fashion Illustration',
      'Pattern Making',
      'Sewing',
      'Styling',
      'Photography',
      'Branding',
      'Trend Research',
    ],
  },
  {
    keywords: ['psychology', 'sociology', 'social science', 'international studies'],
    skills: [
      'Research',
      'Qualitative Research',
      'Quantitative Research',
      'Data Analysis',
      'Academic Writing',
      'Critical Thinking',
      'Interviewing',
      'Presentation',
      'SPSS',
    ],
  },
  {
    keywords: ['hospitality', 'tourism', 'hotel management', 'event management'],
    skills: [
      'Communication',
      'Event Planning',
      'Customer Service',
      'Project Management',
      'Presentation',
      'Marketing',
      'Social Media',
      'Teamwork',
      'Microsoft Excel',
    ],
  },
  {
    keywords: ['law', 'legal'],
    skills: [
      'Legal Research',
      'Research',
      'Academic Writing',
      'Critical Thinking',
      'Presentation',
      'Negotiation',
      'Communication',
      'Report Writing',
    ],
  },
];

const normalizeCatalogText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const matchesMajorKeyword = (majorText, keyword) => {
  const normalizedKeyword = normalizeCatalogText(keyword);
  if (!normalizedKeyword) return false;
  if (normalizedKeyword.length <= 2) {
    return majorText.split(' ').includes(normalizedKeyword);
  }
  return majorText.includes(normalizedKeyword);
};

export const getSkillsForMajor = (major) => {
  const normalizedMajor = normalizeCatalogText(major);
  const exactSkills = skillsByMajor[major] || [];
  if (!normalizedMajor && exactSkills.length === 0) {
    return uniqueList([...fallbackMajorSkills, 'Other']);
  }

  const matchedGroup = majorSkillRecommendationGroups.find((group) =>
    group.keywords.some((keyword) => matchesMajorKeyword(normalizedMajor, keyword)),
  );

  const skills = matchedGroup?.skills || (exactSkills.length ? exactSkills : fallbackMajorSkills);
  return uniqueList([...skills, 'Other']);
};

export const getProfileSkillSuggestions = ({ major = '', school = '' } = {}) => {
  const normalizedMajor = normalizeCatalogText(major);
  if (normalizedMajor) {
    return getSkillsForMajor(major);
  }

  const schoolSkills = skillsBySchool[school] || [];
  return uniqueList([...(schoolSkills.length ? schoolSkills.slice(0, 12) : fallbackMajorSkills), 'Other']);
};

export const getSkillsForSchool = (school) =>
  uniqueList([...(skillsBySchool[school] || []), 'Other']);

export const getAllSkills = () => skillOptions;

export const getRequestSkillOptions = (profile = {}) => {
  const suggested = skillsBySchool[profile.school] || skillsByMajor[profile.major] || [];
  return uniqueList([
    ...suggested,
    ...skillOptions.filter((skill) => skill !== 'Other'),
    'Other',
  ]);
};

export const getCoursesForSchool = (school) => coursesBySchool[school] || [];

export const getAllCourses = () => Object.values(coursesBySchool).flat();

export const formatSessionLabel = (session) =>
  session?.code ? `Session ${session.code}` : 'Session';

export const getSessionsForCourse = (courseCode) =>
  (classSessionsByCourseCode[courseCode] || [
    { id: `${courseCode || 'COURSE'}-S01`, code: '01' },
    { id: `${courseCode || 'COURSE'}-S02`, code: '02' },
  ]).map((session) => ({
    semester: 'Semester 2',
    academicYear: '2026',
    ...session,
  }));

export const workStyleOptions = [
  'Likes to finish tasks early',
  'Works steadily throughout the project',
  'Flexible with deadlines',
  'Comfortable working close to deadlines',
  'Communicates frequently',
  'Works independently',
  'Enjoys collaborative work',
  'Takes initiative',
  'Organised and structured',
  'Flexible with changes',
];

export const requirementOptions = [
  'Minimum GPA',
  'Has previous project experience',
  'Has a portfolio',
  'Has experience with specific software/tools',
  'Comfortable presenting',
  'Comfortable with research/writing',
  'No specific requirements',
];

export const toolOptions = [
  'Figma',
  'Adobe Photoshop',
  'Adobe Illustrator',
  'Premiere Pro',
  'After Effects',
  'Blender',
  'TouchDesigner',
  'HTML/CSS',
  'JavaScript',
  'Other',
];

export const connectMessageSuggestions = [
  'Mình thấy skills của bạn khá hợp với project mình đang làm. Kết nối nhé!',
  'Mình thấy tụi mình có khá nhiều điểm chung. Làm quen nhé!',
  'Mình đang tìm người có skill giống bạn cho một project sắp tới. Connect nha!',
];

export const demoReplyPool = [
  "Hey! Thanks for reaching out.",
  "Yes, I'm still looking for teammates.",
  "That sounds interesting. Tell me more about the project.",
  "I'd be happy to discuss the assignment.",
];
