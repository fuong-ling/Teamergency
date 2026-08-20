export const contactTypes = ['email', 'instagram', 'messenger', 'url'];

export const universityOptions = [
  { value: 'RMIT University', label: 'RMIT University' },
];

export const schoolOptions = [
  { value: 'SCD', label: 'School of Communication & Design (SCD)' },
  { value: 'TBS', label: 'The Business School (TBS)' },
  { value: 'SSET', label: 'School of Science, Engineering & Technology (SSET)' },
];

export const majorsBySchool = {
  SCD: ['Digital Media', 'Design Studies', 'Professional Communication', 'Digital Film and Video'],
  TBS: ['Business', 'Marketing', 'Business Analytics'],
  SSET: ['Information Technology', 'Software Engineering', 'Computer Science'],
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
    { name: 'Market Research', code: 'MKTG2305' },
    { name: 'Data Storytelling', code: 'BUSM2655' },
  ],
  SSET: [
    { name: 'Web Programming', code: 'COSC2430' },
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
  COMM2784: ['Tuesday 09:30', 'Thursday 13:30', 'Friday 09:30'],
  COMM2750: ['Tuesday 13:30', 'Thursday 09:30'],
  COMM2778: ['Monday 13:30', 'Friday 13:30'],
  COMM2762: ['Wednesday 09:30', 'Friday 13:30'],
  COMM2825: ['Monday 09:30', 'Thursday 13:30'],
  MKTG2301: ['Tuesday 09:30', 'Friday 09:30'],
  MKTG2305: ['Wednesday 13:30', 'Saturday 09:30'],
  BUSM2655: ['Monday 13:30', 'Wednesday 09:30'],
  COSC2430: ['Tuesday 13:30', 'Saturday 09:30'],
  ISYS2101: ['Thursday 09:30', 'Saturday 13:30'],
  COSC2818: ['Monday 13:30', 'Friday 13:30'],
};

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
