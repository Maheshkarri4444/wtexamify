import { Mic, ScrollText, TerminalSquare } from "lucide-react";

export const EXAM_TYPES = {
  viva: {
    label: "Viva",
    icon: Mic,
    description: "MCQs and fill in the blanks, marked the moment students submit.",
    duration: 15,
  },
  internal: {
    label: "Internal",
    icon: ScrollText,
    description: "A question paper in unique sets. Students write their programs on their own systems.",
    duration: 60,
  },
  external: {
    label: "External",
    icon: TerminalSquare,
    description: "Code questions with test cases, checked by AI against your answer. No compiler needed.",
    duration: 90,
  },
};
