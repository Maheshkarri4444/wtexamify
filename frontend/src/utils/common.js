const backendOptions = [
  "https://wtexamifybackend1.onrender.com",
  "https://wtexamifybackend2.onrender.com"
];

// Function to select a backend randomly or in a round-robin manner
const getBackend = () => backendOptions[Math.floor(Math.random() * backendOptions.length)];

const Allapi = {
  googleLogin: {
    url: () => `${getBackend()}/auth/google`,
    method: "GET",
  },
  googleCallback: {
    url: () => `${getBackend()}/auth/googlecallback`,
    method: "GET",
  },
  createExam: {
    url: () => `${getBackend()}/exam/exam`,
    method: "POST",
  },
  updateExam: {
    url: (id) => `${getBackend()}/exam/exam/${id}`,
    method: "PUT",
  },
  sendEmails: {
    url: () => `${getBackend()}/exam/send-emails`,
    method: "POST",
  },
  getStartedExams: {
    url: () => `${getBackend()}/exam/exams/started`,
    method: "GET",
  },
  getTeacherExams: {
    url: (id) => `${getBackend()}/exam/teacher/${id}/exams`,
    method: "GET",
  },
  watchAnswerSheets: {
    url: () => `${getBackend()}/watch/answersheets`,
    method: "GET",
  },
  getExam: {
    url: (id) => `${getBackend()}/exam/getexam/${id}`,
    method: "GET",
  },
  getSubmittedAnswerSheets: {
    url: (id) => `${getBackend()}/answersheets/submitted/${id}`,
    method: "GET",
  },
  getAnswerSheetById: {
    url: (id) => `${getBackend()}/answersheets/${id}`,
    method: "GET",
  },
  createAnswerSheet: {
    url: () => `${getBackend()}/answersheets/create`,
    method: "POST",
  },
  submitAnswerSheet: {
    url: () => `${getBackend()}/answersheets/submit`,
    method: "PUT",
  },
  assignCopied: {
    url: (id) => `${getBackend()}/answersheets/answersheet/${id}/assigncopied`,
    method: "PUT",
  },
  removeCopied: {
    url: (id) => `${getBackend()}/answersheets/answersheet/${id}/removecopied`,
    method: "PUT",
  },
  refreshAnswerSheet: {
    url: (id) => `${getBackend()}/refresh/answersheet/${id}`,
    method: "PUT",
  },
  aiScore: {
    url: () => `${getBackend()}/ai/generate`,
    method: "POST",
  },
};

export default Allapi;
