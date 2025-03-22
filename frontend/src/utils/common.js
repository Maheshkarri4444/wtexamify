const backapi = "http://localhost:8080";

const Allapi = {
  googleLogin: {
    url: `${backapi}/auth/google`,
    method: "GET",
  },
  googleCallback: {
    url: `${backapi}/auth/googlecallback`,
    method: "GET",
  },
  createExam: {
    url: `${backapi}/exam/exam`,
    method: "POST",
  },
  updateExam: {
    url: `${backapi}/exam/exam/:id`,
    method: "PUT",
  },
  getStartedExams: {
    url: `${backapi}/exam/exams/started`,
    method: "GET",
  },
  getTeacherExams: {
    url: (id) => `${backapi}/exam/teacher/${id}/exams`,
    method: "GET",
  },
  watchAnswerSheets: {
    url: `${backapi}/watch/answersheets`,
    method: "GET",
  },
  getExam: {
    url: (id) => `${backapi}/exam/getexam/${id}`,
    method: "GET",
  },
  getSubmittedAnswerSheets: {
    url: (id) => `${backapi}/answersheets/submitted/${id}`,
    method: "GET",
  },
  getAnswerSheetById: {
    url: (id) => `${backapi}/answersheets/${id}`,
    method: "GET",
  },
  // New routes for student functionality
  createAnswerSheet: {
    url: `${backapi}/answersheets/create`,
    method: "POST",
  },
  submitAnswerSheet: {
    url: `${backapi}/answersheets/submit`,
    method: "PUT",
  },
  assignCopied: {
    url: (id) => `${backapi}/answersheets/answersheet/${id}/assigncopied`,
    method: "PUT",
  },
  removeCopied: {
    url: (id) => `${backapi}/answersheets/answersheet/${id}/removecopied`,
    method: "PUT",
  },
  refreshAnswerSheet: {
    url: (id) => `${backapi}/refresh/answersheet/${id}`,
    method: "PUT",
  },
  aiScore: {
    url: `${backapi}/ai/generate`,
    method: "POST",
  }
};

export default Allapi;