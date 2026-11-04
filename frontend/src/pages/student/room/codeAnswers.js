// Helpers for code answers, shared by the exam room and the code screen.

export const languageOf = (question, answer) => (question.language === "any" ? answer?.language || "" : question.language);

// Untouched questions show the teacher's starter code; it becomes the answer once edited or run.
export const codeOf = (question, answer) => answer?.code ?? question.starter_code ?? "";

// A check counts for the code on screen only if neither the code nor the language changed since.
export const checkIsCurrent = (run, question, answer) =>
  Boolean(run && typeof run.code === "string" && run.code.trim() === codeOf(question, answer).trim() && run.language === languageOf(question, answer));
