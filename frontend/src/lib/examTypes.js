import { Mic, ScrollText, TerminalSquare } from "lucide-react";

export const EXAM_TYPES = {
  viva: { label: "Viva", icon: Mic, description: "MCQs and fill in the blanks, marked the moment students submit.", available: true },
  internal: { label: "Internal", icon: ScrollText, description: "Question papers with difficulty-balanced sets.", available: false },
  external: { label: "External", icon: TerminalSquare, description: "Lab exams with a code runner, SQL and AI grading.", available: false },
};
