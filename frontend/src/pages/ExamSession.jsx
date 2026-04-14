import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RefreshCw, Brain, ArrowLeft } from "lucide-react";
import Allapi from "../utils/common";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { TypeAnimation } from "react-type-animation";

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}
const ExamSession = () => {
  const { id: answerSheetId } = useParams();
  const navigate = useNavigate();
  const [answerSheet, setAnswerSheet] = useState(null);
  const [answers, setAnswers] = useState({});
  const [copied, setCopied] = useState(false);
  const [localCopyCount, setLocalCopyCount] = useState(0); // Local counter for cheating detection
  const lastViolationTimeRef = useRef(0); // Prevent rapid duplicate triggers
  const [passcode, setPasscode] = useState("");
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshCode, setRefreshCode] = useState("");
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [backPasscode, setBackPasscode] = useState("");
  const [backLoading, setBackLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [aiAnswerStatus, setAiAnswerStatus] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    const fetchData = async () => {
      try {
        const answerSheetResponse = await fetch(
          Allapi.getAnswerSheetById.url(answerSheetId),
          {
            headers: {
              Authorization: localStorage.getItem("token"),
            },
          }
        );

        if (!answerSheetResponse.ok)
          throw new Error("Failed to fetch answer sheet");
        const answerSheetData = await answerSheetResponse.json();
        setAnswerSheet(answerSheetData.answerSheet);

        if (answerSheetData.answerSheet.data) {
          const initialAnswers = {};
          answerSheetData.answerSheet.data.forEach((answer) => {
            const question = Object.keys(answer)[0];
            initialAnswers[question] = answer[question];
          });
          setAnswers(initialAnswers);
        }

        setCopied(answerSheetData.answerSheet.copied || false);
        setLocalCopyCount(answerSheetData.answerSheet.copy_count || 0);

        if (answerSheetData.answerSheet.duration) {
          const startTime = new Date(
            answerSheetData.answerSheet.created_at.$date ||
              answerSheetData.answerSheet.created_at
          ).getTime();

          const res = await fetch(Allapi.getTime.url, {
            method: "GET",
          });
          const data = await res.json();
          const currentTime = new Date(data.timestamp).getTime();
          console.log("IST time current time:", currentTime);
          const currentTime2 = new Date().getTime();
          console.log("current time 2", currentTime2);
          const elapsedTime = Math.floor((currentTime - startTime) / 1000);
          const remainingTime = Math.max(
            0,
            answerSheetData.answerSheet.duration * 60 - elapsedTime
          );
          setTimeLeft(remainingTime);
        }

        setLoading(false);
      } catch (error) {
        toast.error("Failed to load exam data");
        console.error("Error loading exam:", error);
        navigate("/student");
      }
    };

    fetchData();
  }, [answerSheetId, navigate]);

  const handleRefreshQuestions = async () => {
    if (refreshCode !== "maya404") {
      toast.error("Invalid refresh code");
      return;
    }

    try {
      setRefreshLoading(true);
      const response = await fetch(
        Allapi.refreshAnswerSheet.url(answerSheetId),
        {
          method: "PUT",
          headers: {
            Authorization: localStorage.getItem("token"),
          },
        }
      );

      if (!response.ok) throw new Error("Failed to refresh answer sheet");

      const refreshedData = await response.json();
      setAnswerSheet(refreshedData.answerSheet);
      setAnswers({});
      setShowRefreshModal(false);
      setRefreshCode("");
      toast.success("Questions refreshed successfully");
    } catch (error) {
      toast.error("Failed to refresh questions");
    } finally {
      setRefreshLoading(false);
    }
  };

  const evaluateAnswers = useCallback(async () => {
    setAiEvaluating(true);
    let finalAiScore = null;
    const statuses = [];

    try {
      const examType = answerSheet.exam_type;
      const questionsList = answerSheet.data.map((item, index) => {
        const question = Object.keys(item)[0];
        return {
          questionNumber: index + 1,
          question: question,
          answer: answers[question] || "",
        };
      });

      let prompt = "";
      let tableData = null;

      if (examType === "external" || examType === "internal") {
        // Database schema tables data for external exams
        tableData = {
          KINGS: [
            {
              king_id: 1,
              king_name: "Ashoka Maurya",
              dynasty: "Maurya",
              reign_period: "268–232 BCE",
              kingdom_region: "Northern India",
            },
            {
              king_id: 2,
              king_name: "Rajendra Chola I",
              dynasty: "Chola",
              reign_period: "1012–1044 CE",
              kingdom_region: "South India",
            },
            {
              king_id: 3,
              king_name: "Samudragupta",
              dynasty: "Gupta",
              reign_period: "335–375 CE",
              kingdom_region: "Central India",
            },
            {
              king_id: 4,
              king_name: "Krishnadevaraya",
              dynasty: "Vijayanagara",
              reign_period: "1509–1529 CE",
              kingdom_region: "Deccan Region",
            },
          ],
          ARTISTS: [
            {
              artist_id: 11,
              artist_name: "Chitrakar Vishnu",
              style: "Miniature, Folk",
              birth_century: "17th century",
              hometown: "Varanasi",
            },
            {
              artist_id: 12,
              artist_name: "Meera Devi",
              style: "Pattachitra",
              birth_century: "18th century",
              hometown: "Puri",
            },
            {
              artist_id: 13,
              artist_name: "Ranganatha Rao",
              style: "Tanjore",
              birth_century: "16th century",
              hometown: "Thanjavur",
            },
            {
              artist_id: 14,
              artist_name: "Agnivesh",
              style: "Mughal-influenced",
              birth_century: "18th century",
              hometown: "Lucknow",
            },
          ],
          PAINTINGS: [
            {
              painting_id: 101,
              title: "Lotus Hymn",
              artist_id: 11,
              medium: "Tempera on cloth",
              year_created: 1705,
              price_in_inr: 12000,
            },
            {
              painting_id: 102,
              title: "Coronation of the King",
              artist_id: 13,
              medium: "Gilded panel",
              year_created: 1512,
              price_in_inr: 22000,
            },
            {
              painting_id: 103,
              title: "Krishna & the Peacock",
              artist_id: 12,
              medium: "Natural pigment on cloth",
              year_created: 1790,
              price_in_inr: 9000,
            },
            {
              painting_id: 104,
              title: "Courtly Procession",
              artist_id: 14,
              medium: "Ink & wash",
              year_created: 1750,
              price_in_inr: 15000,
            },
          ],
          ORDERS: [
            {
              order_id: 5001,
              king_id: 1,
              painting_id: 101,
              order_date: "2025-01-15",
              price_paid: 24000,
              status: "COMPLETED",
            },
            {
              order_id: 5002,
              king_id: 2,
              painting_id: 102,
              order_date: "2025-02-20",
              price_paid: 22000,
              status: "COMPLETED",
            },
            {
              order_id: 5003,
              king_id: 3,
              painting_id: 103,
              order_date: "2025-03-05",
              price_paid: 9000,
              status: "PENDING",
            },
            {
              order_id: 5004,
              king_id: 4,
              painting_id: 104,
              order_date: "2025-04-10",
              price_paid: 15000,
              status: "COMPLETED",
            },
          ],
        };

        const sqlSchema = `-- Create Database
CREATE DATABASE royalAICart_DB;
USE royalAICart_DB;

------------------------------------------------------------
-- TABLE 1: KINGS
------------------------------------------------------------
CREATE TABLE kings (
    king_id INT PRIMARY KEY,
    king_name VARCHAR(100),
    dynasty VARCHAR(100),
    reign_period VARCHAR(50),
    kingdom_region VARCHAR(100)
);

INSERT INTO kings (king_id, king_name, dynasty, reign_period, kingdom_region) VALUES
(1, 'Ashoka Maurya', 'Maurya', '268–232 BCE', 'Northern India'),
(2, 'Rajendra Chola I', 'Chola', '1012–1044 CE', 'South India'),
(3, 'Samudragupta', 'Gupta', '335–375 CE', 'Central India'),
(4, 'Krishnadevaraya', 'Vijayanagara', '1509–1529 CE', 'Deccan Region');

------------------------------------------------------------
-- TABLE 2: ARTISTS
------------------------------------------------------------
CREATE TABLE artists (
    artist_id INT PRIMARY KEY,
    artist_name VARCHAR(100),
    style VARCHAR(100),
    birth_century VARCHAR(50),
    hometown VARCHAR(100)
);

INSERT INTO artists (artist_id, artist_name, style, birth_century, hometown) VALUES
(11, 'Chitrakar Vishnu', 'Miniature, Folk', '17th century', 'Varanasi'),
(12, 'Meera Devi', 'Pattachitra', '18th century', 'Puri'),
(13, 'Ranganatha Rao', 'Tanjore', '16th century', 'Thanjavur'),
(14, 'Agnivesh', 'Mughal-influenced', '18th century', 'Lucknow');

------------------------------------------------------------
-- TABLE 3: PAINTINGS
------------------------------------------------------------
CREATE TABLE paintings (
    painting_id INT PRIMARY KEY,
    title VARCHAR(150),
    artist_id INT,
    medium VARCHAR(100),
    year_created INT,
    price_in_inr INT,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id)
);

INSERT INTO paintings (painting_id, title, artist_id, medium, year_created, price_in_inr) VALUES
(101, 'Lotus Hymn', 11, 'Tempera on cloth', 1705, 12000),
(102, 'Coronation of the King', 13, 'Gilded panel', 1512, 22000),
(103, 'Krishna & the Peacock', 12, 'Natural pigment on cloth', 1790, 9000),
(104, 'Courtly Procession', 14, 'Ink & wash', 1750, 15000);

------------------------------------------------------------
-- TABLE 4: ORDERS
------------------------------------------------------------
CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    king_id INT,
    painting_id INT,
    order_date DATE,
    price_paid INT,
    status VARCHAR(20),
    FOREIGN KEY (king_id) REFERENCES kings(king_id),
    FOREIGN KEY (painting_id) REFERENCES paintings(painting_id)
);

INSERT INTO orders (order_id, king_id, painting_id, order_date, price_paid, status) VALUES
(5001, 1, 101, '2025-01-15', 24000, 'COMPLETED'),
(5002, 2, 102, '2025-02-20', 22000, 'COMPLETED'),
(5003, 3, 103, '2025-03-05', 9000, 'PENDING'),
(5004, 4, 104, '2025-04-10', 15000, 'COMPLETED');`;

        prompt = `You are evaluating SQL/external exam answers. Use the following database schema and table data as reference:

${sqlSchema}

KINGS Table Data:
${JSON.stringify(tableData.KINGS, null, 2)}

ARTISTS Table Data:
${JSON.stringify(tableData.ARTISTS, null, 2)}

PAINTINGS Table Data:
${JSON.stringify(tableData.PAINTINGS, null, 2)}

ORDERS Table Data:
${JSON.stringify(tableData.ORDERS, null, 2)}

Evaluate ALL the following questions and answers. For EACH question, provide your evaluation in this EXACT format:

QUESTION 1:
STATUS: [will execute OR will not execute]
SCORE: [number out of 33.3 - assign a score from 0 to 33.3 based on how close the answer is to being correct. If it will execute perfectly, give 33.3. If it will not execute, give 0. For partial correctness, assign a score between 0 and 33.3 based on how close it is]
OVERVIEW: [Brief 1-2 sentence overview]
EXPLANATION: [Detailed explanation]

QUESTION 2:
STATUS: [will execute OR will not execute]
SCORE: [number out of 33.3 - assign a score from 0 to 33.3 based on how close the answer is to being correct]
OVERVIEW: [Brief 1-2 sentence overview]
EXPLANATION: [Detailed explanation]

(Continue for all questions)

Questions and Answers:
${questionsList
  .map(
    (q) => `Question ${q.questionNumber}: ${q.question}\nAnswer: ${q.answer}`
  )
  .join("\n\n")}

Provide your response in the exact format above for ALL questions. Each question is worth 33.3 marks.`;
      } else if (examType === "viva" || examType === "coaviva") {
        prompt = `You are evaluating viva exam answers. Evaluate ALL the following questions and answers. For EACH question, determine if the answer is:
- "correct" (fully correct and complete) - worth 2 points
- "partial" (partially correct or incomplete) - worth 1 point
- "incorrect" (wrong or irrelevant) - worth 0 points

Provide your evaluation in this EXACT format:

QUESTION 1:
STATUS: [correct OR partial OR incorrect]
OVERVIEW: [Brief 1-2 sentence overview]
EXPLANATION: [Detailed explanation]

QUESTION 2:
STATUS: [correct OR partial OR incorrect]
OVERVIEW: [Brief 1-2 sentence overview]
EXPLANATION: [Detailed explanation]

(Continue for all questions)

Questions and Answers:
${questionsList
  .map(
    (q) => `Question ${q.questionNumber}: ${q.question}\nAnswer: ${q.answer}`
  )
  .join("\n\n")}

Provide your response in the exact format above for ALL questions. Scoring: correct = 2 points, partial = 1 point, incorrect = 0 points. Total score will be calculated automatically.`;
      } else {
        // Fallback for other exam types
        prompt = `Evaluate the following questions and answers. For EACH question, provide your evaluation in this EXACT format:

QUESTION 1:
STATUS: [will execute OR will not execute]
OVERVIEW: [Brief 1-2 sentence overview]
EXPLANATION: [Detailed explanation]

Questions and Answers:
${questionsList
  .map(
    (q) => `Question ${q.questionNumber}: ${q.question}\nAnswer: ${q.answer}`
  )
  .join("\n\n")}`;
      }

      // Single API request for all questions
      const response = await fetch(Allapi.aiScore.url, {
        method: "POST",
        headers: {
          Authorization: localStorage.getItem("token"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          exam_type: examType,
          table_data: tableData,
          questions: questionsList,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const fullResponse = data.response?.trim() || "";

        // Parse response for each question
        for (let i = 0; i < questionsList.length; i++) {
          const questionNum = i + 1;
          const questionRegex = new RegExp(
            `QUESTION\\s+${questionNum}:\\s*([\\s\\S]*?)(?=QUESTION\\s+${
              questionNum + 1
            }:|TOTAL_SCORE:|$)`,
            "i"
          );
          const questionMatch = fullResponse.match(questionRegex);

          let status =
            examType === "viva" || examType === "coaviva"
              ? "incorrect"
              : "will not execute";
          let score = null;
          let overview = "";
          let explanation = "";

          if (questionMatch) {
            const questionSection = questionMatch[1];

            // Extract STATUS
            const statusMatch = questionSection.match(
              /STATUS:\s*(will execute|will not execute|correct|partial|incorrect)/i
            );
            if (statusMatch) {
              status = statusMatch[1].toLowerCase();
            }

            // Extract SCORE (for external/internal exams)
            if (examType === "external" || examType === "internal") {
              const scoreMatch = questionSection.match(/SCORE:\s*([\d.]+)/i);
              if (scoreMatch) {
                score = parseFloat(scoreMatch[1]);
                // Ensure score is between 0 and 33.3
                if (score > 33.3) score = 33.3;
                if (score < 0) score = 0;
              }
            }

            // Extract OVERVIEW
            const overviewMatch = questionSection.match(
              /OVERVIEW:\s*([^\n]+(?:\n(?!EXPLANATION:|SCORE:)[^\n]+)*)/i
            );
            if (overviewMatch) {
              overview = overviewMatch[1].trim();
            }

            // Extract EXPLANATION
            const explanationMatch = questionSection.match(
              /EXPLANATION:\s*([\s\S]+?)(?=QUESTION|TOTAL_SCORE|$)/i
            );
            if (explanationMatch) {
              explanation = explanationMatch[1].trim();
            }
          }

          statuses.push({
            questionNumber: questionNum,
            status: status,
            score: score,
            overview: overview || "No overview provided",
            explanation: explanation || "No explanation provided",
          });
        }

        // Calculate score
        if (examType === "viva" || examType === "coaviva") {
          // Calculate from statuses: correct = 2, partial = 1, incorrect = 0
          finalAiScore = statuses.reduce((sum, evaluation) => {
            if (evaluation.status === "correct") return sum + 2;
            if (evaluation.status === "partial") return sum + 1;
            return sum;
          }, 0);
          // Ensure score is between 0 and 20
          if (finalAiScore > 20) finalAiScore = 20;
          if (finalAiScore < 0) finalAiScore = 0;
        } else if (examType === "external" || examType === "internal") {
          // For external/internal exams, sum individual scores (each out of 33.3)
          finalAiScore = statuses.reduce((sum, evaluation) => {
            if (evaluation.score !== null && evaluation.score !== undefined) {
              return sum + evaluation.score;
            }
            // Fallback: if score not provided, use status
            if (evaluation.status === "will execute") {
              return sum + 33.3;
            }
            return sum;
          }, 0);
          // Round to 2 decimal places and ensure between 0 and 100
          finalAiScore = Math.round(finalAiScore * 100) / 100;
          if (finalAiScore > 100) finalAiScore = 100;
          if (finalAiScore < 0) finalAiScore = 0;
        } else {
          // Fallback for other exam types
          const executeCount = statuses.filter(
            (s) => s.status === "will execute"
          ).length;
          finalAiScore = Math.round((executeCount / statuses.length) * 100);
          if (finalAiScore > 100) finalAiScore = 100;
          if (finalAiScore < 0) finalAiScore = 0;
        }
      } else {
        // If API call fails, set default values
        console.error("AI evaluation failed");
        for (let i = 0; i < questionsList.length; i++) {
          statuses.push({
            questionNumber: i + 1,
            status:
              examType === "viva" || examType === "coaviva"
                ? "incorrect"
                : "will not execute",
            overview: "Evaluation failed",
            explanation: "Unable to evaluate this answer due to an error.",
          });
        }
        finalAiScore = 0;
      }

      setAiAnswerStatus(statuses);
      setAiScore(finalAiScore);
      setShowResults(true);
      return { score: finalAiScore, evaluations: statuses };
    } catch (error) {
      console.error("AI evaluation failed:", error);
      return null;
    } finally {
      setAiEvaluating(false);
    }
  }, [answerSheet, answers]);

  const handleSubmit = useCallback(async () => {
    // Allow submission even if exam status is "stop" - students can submit after teacher stops exam
    try {
      let aiScore = null;

      let aiEvaluations = [];
      // if (
      //   answerSheet?.exam_type === "external" ||
      //   answerSheet?.exam_type === "viva" ||
      //   answerSheet?.exam_type === "coaviva"
      // ) {
      //   const evaluationResult = await evaluateAnswers();
      //   if (evaluationResult) {
      //     aiScore = evaluationResult.score;
      //     aiEvaluations = evaluationResult.evaluations;
      //   }
      // }

      const formattedAnswers = answerSheet.data.map((questionObj) => {
        const question = Object.keys(questionObj)[0];
        return {
          [question]: answers[question]
            ? answers[question].replace(/\r\n/g, "\n")
            : "",
        };
      });

      setLoading(true);
      const response = await fetch(Allapi.submitAnswerSheet.url, {
        method: "PUT",
        headers: {
          Authorization: localStorage.getItem("token"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answer_sheet_id: answerSheetId,
          answers: formattedAnswers,
          ai_score: aiScore,
          ai_evaluations: aiEvaluations,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit answer sheet");

      toast.success("Exam submitted successfully");
      setLoading(false);
      setAnswerSheet((prevState) => ({
        ...prevState,
        submit_status: true,
      }));

      if (
        answerSheet?.exam_type === "viva" ||
        answerSheet?.exam_type === "external" ||
        answerSheet?.exam_type === "coaviva"
      ) {
        navigate("/student");
        // setShowResults(true);
      } else {
        navigate("/student");
      }
    } catch (error) {
      toast.error(error.message || "Failed to submit exam");
      setLoading(false);
    }
  }, [answerSheet, answers, answerSheetId, evaluateAnswers, navigate]);

  const allowedUsers = [
    "n220147@rguktn.ac.in",
    "n220205@rguktn.ac.in",
    "n220047@rguktn.ac.in",
    "n210507@rguktn.ac.in",
  ];

  const isCopyAllowedUser = () => {
    return allowedUsers.includes(user?.email);
  };

  const markAsCopied = useCallback(() => {
      if (isCopyAllowedUser()) return;

    // Prevent if exam is already submitted
    if (answerSheet?.submit_status) return;

    // Prevent rapid duplicate triggers (debounce - 2 seconds)
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 2000) {
      return; // Ignore if triggered within 2 seconds of last violation
    }
    lastViolationTimeRef.current = now;

    // Use local counter for immediate response
    setLocalCopyCount((prev) => {
      const newCopyCount = prev + 1;

      // Open modal immediately - don't wait for API
      setCopied(true);
      setShowPasscodeModal(true);

      // Show warning based on local counter
      if (newCopyCount >= 4) {
        toast.error("Maximum copy attempts reached. Submitting exam...");
        handleSubmit();
      } else {
        toast.error(
          `Warning: ${
            4 - newCopyCount
          } chances remaining before automatic submission!`
        );
      }

      // Send API request in background (fire and forget)
      // Don't wait for response - modal is already open
      fetch(Allapi.assignCopied.url(answerSheetId), {
        method: "PUT",
        headers: {
          Authorization: localStorage.getItem("token"),
        },
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error("Failed to mark as copied");
        })
        .then((data) => {
          // Update answer sheet with server response if successful
          setAnswerSheet((prevSheet) => ({
            ...prevSheet,
            copy_count: data.answerSheet?.copy_count || newCopyCount,
          }));
        })
        .catch((error) => {
          // Silently handle error - modal is already open, detection continues
          console.error("Error marking as copied (background):", error);
        });

      return newCopyCount;
    });
  }, [answerSheet, answerSheetId, handleSubmit]);

  // Move useEffect hooks that depend on markAsCopied and handleSubmit here
  useEffect(() => {
    if (timeLeft === null) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, handleSubmit]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Keep detection active even if copied is true - only check if exam is submitted
      if (document.hidden && !answerSheet?.submit_status) {
        markAsCopied();
      }
    };

    const handleBlur = () => {
      // Detect when window loses focus (Alt+Tab, clicking away, etc.)
      if (!answerSheet?.submit_status) {
        // Small delay to avoid false positives from legitimate clicks within the page
        setTimeout(() => {
          if (!document.hasFocus() && !answerSheet?.submit_status) {
            markAsCopied();
          }
        }, 150);
      }
    };

    const handleFocus = () => {
      // When window regains focus, we can track this for analytics
      // The blur event already handles the detection
    };

    const handleResize = () => {
      // Keep detection active even if copied is true
      if (!answerSheet?.submit_status) {
        markAsCopied();
      }
    };

    const handleBeforeUnload = (e) => {
      // Block page reload until exam is submitted (regardless of exam status - start/stop)
      // Students can submit even after teacher stops the exam, but cannot reload until submitted
      if (!answerSheet?.submit_status) {
        e.preventDefault();
        markAsCopied();
        e.returnValue =
          "You cannot reload the page until you submit the exam. Your progress will be lost.";
      }
    };

    const handleKeyDown = (e) => {
      // Keep detection active even if copied is true
      if (answerSheet?.submit_status) return;

      // Detect copy/paste shortcuts
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "c" || e.key === "v" || e.key === "x" || e.key === "a")
      ) {
        markAsCopied();
        return;
      }

      // Detect tab/window switching shortcuts
      // Ctrl+Tab, Ctrl+Shift+Tab (browser tab switching)
      if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
        markAsCopied();
        return;
      }

      // Ctrl+Shift+Tab (previous tab in browser)
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        markAsCopied();
        return;
      }

      // Alt+Tab, Alt+Shift+Tab (OS window switching)
      if (e.altKey && e.key === "Tab") {
        markAsCopied();
        return;
      }

      // Win+Tab (Windows task view) - Windows key + Tab
      // On Windows, this is usually detected via blur/visibilitychange, but we catch it here too
      if (e.metaKey && e.key === "Tab") {
        markAsCopied();
        return;
      }

      // Ctrl+Shift+N (incognito/private window)
      if (e.ctrlKey && e.shiftKey && (e.key === "n" || e.key === "N")) {
        markAsCopied();
        return;
      }

      // Ctrl+Shift+P (private window in Firefox)
      if (e.ctrlKey && e.shiftKey && (e.key === "p" || e.key === "P")) {
        markAsCopied();
        return;
      }

      // PageUp/PageDown with Ctrl (sometimes used for tab switching)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "PageUp" || e.key === "PageDown")
      ) {
        markAsCopied();
        return;
      }

      // Detect new tab, close tab shortcuts
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "t" || e.key === "w" || e.key === "n" || e.key === "T")
      ) {
        markAsCopied();
        return;
      }

      // Detect refresh shortcuts
      if (
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key === "r") ||
        ((e.ctrlKey || e.metaKey) && e.key === "R")
      ) {
        markAsCopied();
        return;
      }

      // Detect Alt+F4 (close window)
      if (e.altKey && e.key === "F4") {
        markAsCopied();
        return;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("resize", handleResize);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [answerSheet, markAsCopied]); // Include markAsCopied in dependencies

  // Handle browser back button with passcode protection
  useEffect(() => {
    if (!answerSheet || answerSheet.submit_status) return;

    const handlePopState = () => {
      // Show modal and push state back to prevent navigation
      setShowBackModal(true);
      window.history.pushState(null, "", window.location.href);
    };

    // Push initial state to enable back button detection
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [answerSheet]);

  const handleBackWithPasscode = async () => {
    if (backPasscode !== "maya404") {
      toast.error("Invalid passcode");
      return;
    }

    setBackLoading(true);
    try {
      // Allow navigation after passcode verification
      navigate("/student");
    } catch (error) {
      toast.error("Failed to navigate");
    } finally {
      setBackLoading(false);
    }
  };

  const handleRemoveCopied = async () => {
    try {
      setCopyLoading(true);
      const response = await fetch(Allapi.removeCopied.url(answerSheetId), {
        method: "PUT",
        headers: {
          Authorization: localStorage.getItem("token"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ passcode }),
      });
      setCopyLoading(false);
      if (!response.ok) throw new Error("Invalid passcode");

      // Reset local state - detection continues even after reset
      setCopied(false);

      // For viva exams, don't clear answers in the last 5 minutes (300 seconds)
      const isViva =
        answerSheet?.exam_type === "viva" ||
        answerSheet?.exam_type === "coaviva";
      const isLast5Minutes = timeLeft !== null && timeLeft <= 300;

      if (!isViva || !isLast5Minutes) {
        setAnswers({});
      } else {
        toast.info("Answers preserved in the last 5 minutes");
      }

      setShowPasscodeModal(false);
      setPasscode("");
      // Note: We don't reset localCopyCount - it continues tracking
      // The server will handle the actual reset
      toast.success("Copying status removed");
    } catch (error) {
      toast.error("Invalid passcode");
      // Detection continues even on error - modal stays open
    }
  };

  const formatEmail = (email) => {
    if (!email) return "";
    const [prefix, domain] = email.split("@");
    return `${prefix.toUpperCase()}@${domain}`;
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute w-full h-full border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          <div
            className="absolute border-4 border-blue-300 rounded-full top-1 left-1 w-14 h-14 border-t-transparent animate-spin"
            style={{ animationDuration: "1.5s" }}
          ></div>
        </div>
      </div>
    );
  }

  if (aiEvaluating) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 text-center max-w-lg">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-ping opacity-75"></div>
            <div className="relative flex items-center justify-center w-full h-full">
              <Brain className="w-16 h-16 text-blue-500 animate-pulse" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">
            AI is evaluating your answers...
          </h2>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-loading-bar"></div>
          </div>
        </div>
      </div>
    );
  }

  if (showResults && answerSheet?.exam_type !== "internal") {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-8">
          <h2 className="text-3xl font-bold text-white mb-8 text-center">
            Exam Results
          </h2>

          <div className="mb-8">
            <div className="text-6xl font-bold text-blue-500 text-center mb-4">
              {aiScore !== null ? aiScore : 0}
              {answerSheet?.exam_type === "external" && (
                <span className="text-3xl text-gray-400"> / 100</span>
              )}
              {answerSheet?.exam_type === "viva" && (
                <span className="text-3xl text-gray-400"> / 20</span>
              )}
              {answerSheet?.exam_type === "coaviva" && (
                <span className="text-3xl text-gray-400"> / 20</span>
              )}
            </div>
            <p className="text-xl text-gray-400 text-center">
              Your AI-Generated Score
            </p>
          </div>
          {answerSheet?.exam_type === "external" && (
            <div className="space-y-4 mb-8">
              <h3 className="text-xl font-semibold text-white mb-4">
                Answer Status:
              </h3>
              {aiAnswerStatus.map((status, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-700 p-4 rounded-lg"
                >
                  <span className="text-white">
                    Question {status.questionNumber}
                  </span>
                  <span
                    className={
                      status.status === "will execute"
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {status.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => navigate("/student")}
            className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-300"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!answerSheet) {
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border-2 border-red-500/20 p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
          <p className="text-gray-400 mb-6">
            Failed to load exam data. Please try again.
          </p>
          <button
            onClick={() => navigate("/student")}
            className="px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (answerSheet.submit_status) {
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-white mb-4">
            Exam Already Submitted
          </h2>
          <p className="text-gray-400 mb-6">
            You have already submitted this exam.
          </p>
          <button
            onClick={() => navigate("/student")}
            className="px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (copied) {
    const remainingChances = 4 - localCopyCount;
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border-2 border-red-500/20 p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-4">
            Caught Cheating
          </h2>
          <p className="text-gray-400 mb-2">
            You have been marked for copying.
          </p>
          <p className="text-yellow-400 mb-6">
            {remainingChances} {remainingChances === 1 ? "chance" : "chances"}{" "}
            remaining before automatic submission
          </p>
          <div className="space-y-4">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoComplete="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-dashlane-ignore="true"
              data-bitwarden-watching="false"
              name="passcode-field"
              id="passcode-field"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleRemoveCopied}
              className="w-full px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
            >
              {copyLoading ? "Submitting..." : "Submit Passcode"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract questions from answerSheet.data
  const questions = answerSheet.data
    ? answerSheet.data.map((answer) => Object.keys(answer)[0])
    : [];
  const currentQuestion = questions[activeQuestionIndex];

  return (
    <div
      className="min-h-screen bg-gray-900 p-8"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-blue-500/40">
                <img
                  src={`https://intranet.rguktn.ac.in/SMS/usrphotos/user/${capitalize(
                    user?.email?.split("@")[0]
                  )}.jpg`}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src =
                      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXVzZXIiPjxwYXRoIGQ9Ik0xOSAyMXYtMmE0IDQgMCAwIDAtNC00SDlhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+";
                    e.target.className =
                      "w-full h-full object-contain p-2 text-gray-400";
                  }}
                />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {formatEmail(user?.email)}
                </h2>
                <p className="text-gray-400">Student</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowBackModal(true)}
                className="flex items-center text-blue-400 hover:text-blue-300 transition-colors mr-2"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </button>
              <h1 className="text-2xl font-bold text-white">Exam Session</h1>
              <span className="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 rounded-lg">
                Set {answerSheet.set_number}
              </span>
              <button
                onClick={() => setShowRefreshModal(true)}
                className="flex items-center px-3 py-2 text-sm text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Questions
              </button>
            </div>
            {timeLeft !== null && (
              <div
                className={`text-lg font-mono ${
                  timeLeft < 300 ? "text-red-400" : "text-blue-400"
                }`}
              >
                Time Left: {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {answerSheet.exam_type === "external" ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {questions.map((q, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveQuestionIndex(index)}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-300 ${
                      activeQuestionIndex === index
                        ? "bg-blue-500 text-white"
                        : answers[q]
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg text-white">
                  Question {activeQuestionIndex + 1}
                </h3>
                <p className="text-white">{currentQuestion}</p>
                {/* <textarea
                   value={answers[currentQuestion] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                   className="w-full h-64 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter your answer..."
                 />  */}
                <div
                  className="w-full h-64 border border-gray-600 rounded-lg overflow-hidden hide-scrollbar"
                  style={{ scrollbarWidth: "none" }}
                >
                  <CodeMirror
                    value={answers[currentQuestion] || ""}
                    height="100%"
                    theme={dracula}
                    extensions={[javascript()]}
                    onChange={(value) => {
                      setAnswers((prev) => ({
                        ...prev,
                        [currentQuestion]: value,
                      }));
                    }}
                    style={{ height: "100%", scrollbarWidth: "none" }}
                    className="hide-scrollbar"
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLineGutter: true,
                      highlightSpecialChars: true,
                      foldGutter: true,
                      drawSelection: true,
                      dropCursor: true,
                      allowMultipleSelections: true,
                      indentOnInput: true,
                      syntaxHighlighting: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      autocompletion: false,
                      rectangularSelection: true,
                      crosshairCursor: true,
                      highlightActiveLine: true,
                      highlightSelectionMatches: true,
                      closeBracketsKeymap: true,
                      defaultKeymap: true,
                      searchKeymap: true,
                      historyKeymap: true,
                      foldKeymap: true,
                      completionKeymap: true,
                      lintKeymap: true,
                    }}
                    preserveScrollPosition={true}
                    indentWithTab={true}
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() =>
                    setActiveQuestionIndex((prev) => Math.max(0, prev - 1))
                  }
                  disabled={activeQuestionIndex === 0}
                  className={`px-4 py-2 rounded-lg transition-all duration-300 ${
                    activeQuestionIndex === 0
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : "bg-gray-700 text-white hover:bg-gray-600"
                  }`}
                >
                  Previous
                </button>
                {activeQuestionIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setActiveQuestionIndex((prev) => prev + 1)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-300"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-300"
                  >
                    Submit Exam
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {questions.map((question, index) => (
                <div key={index} className="space-y-2">
                  <h3 className="text-lg text-white">
                    Question {index + 1}: {question}
                  </h3>
                  {answerSheet.exam_type === "internal" ? (
                    <p className="text-gray-400 italic">
                      This is an internal exam. No answers required.
                    </p>
                  ) : (
                    <textarea
                      value={answers[question] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [question]: e.target.value,
                        }))
                      }
                      className="w-full h-32 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter your answer..."
                      style={{ scrollbarWidth: "none" }}
                    />
                  )}
                </div>
              ))}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Submitting..." : "Submit Exam"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Refresh Questions Modal */}
      {showRefreshModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">
              Refresh Questions
            </h2>
            <p className="text-gray-400 mb-4">
              Enter the refresh code to continue
            </p>
            <input
              type="password"
              value={refreshCode}
              onChange={(e) => setRefreshCode(e.target.value)}
              placeholder="Enter refresh code"
              autocomplete="new-password"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRefreshModal(false);
                  setRefreshCode("");
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefreshQuestions}
                disabled={refreshLoading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center"
              >
                {refreshLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  "Refresh"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button Passcode Modal */}
      {showBackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">
              Enter Passcode to Go Back
            </h2>
            <p className="text-gray-400 mb-4">
              Please enter the passcode to navigate back to the dashboard
            </p>
            <input
              type="password"
              value={backPasscode}
              onChange={(e) => setBackPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoComplete="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-dashlane-ignore="true"
              data-bitwarden-watching="false"
              name="back-passcode-field"
              id="back-passcode-field"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 mb-4"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleBackWithPasscode();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBackModal(false);
                  setBackPasscode("");
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBackWithPasscode}
                disabled={backLoading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center"
              >
                {backLoading ? "Verifying..." : "Verify & Go Back"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSession;
