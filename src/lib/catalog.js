export const contactTypes = ['email', 'instagram', 'messenger', 'url'];

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
  'Other',
];

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
  'Has completed specific courses',
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
