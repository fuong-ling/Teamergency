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

export const getSkillsForMajor = (major) =>
  uniqueList([...(skillsByMajor[major] || []), 'Other']);

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
