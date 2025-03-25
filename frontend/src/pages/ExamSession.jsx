import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RefreshCw, Brain } from 'lucide-react';
import Allapi from '../utils/common';

const ExamSession = () => {
  const { id: answerSheetId } = useParams();
  const navigate = useNavigate();
  const [answerSheet, setAnswerSheet] = useState(null);
  const [answers, setAnswers] = useState({});
  const [copied, setCopied] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshCode, setRefreshCode] = useState('');
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const answerSheetResponse = await fetch(Allapi.getAnswerSheetById.url(answerSheetId), {
          headers: {
            'Authorization': localStorage.getItem('token')
          }
        });
        
        if (!answerSheetResponse.ok) throw new Error('Failed to fetch answer sheet');
        const answerSheetData = await answerSheetResponse.json();
        setAnswerSheet(answerSheetData.answerSheet);

        // Initialize answers from existing data if any
        if (answerSheetData.answerSheet.data) {
          const initialAnswers = {};
          answerSheetData.answerSheet.data.forEach(answer => {
            const question = Object.keys(answer)[0];
            initialAnswers[question] = answer[question];
          });
          setAnswers(initialAnswers);
        }

        // Set initial copied status
        setCopied(answerSheetData.answerSheet.copied || false);

        // Initialize timer
        if (answerSheetData.answerSheet.duration) {
          const startTime = new Date(answerSheetData.answerSheet.created_at.$date || answerSheetData.answerSheet.created_at).getTime();
          const currentTime = new Date().getTime();
          const elapsedTime = Math.floor((currentTime - startTime) / 1000);
          const remainingTime = Math.max(0, answerSheetData.answerSheet.duration * 60 - elapsedTime);
          setTimeLeft(remainingTime);
        }

        setLoading(false);
      } catch (error) {
        toast.error('Failed to load exam data');
        console.error('Error loading exam:', error);
        navigate('/student');
      }
    };

    fetchData();
  }, [answerSheetId, navigate]);

  useEffect(() => {
    if (timeLeft === null) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !copied && !answerSheet?.submit_status) {
        markAsCopied();
      }
    };

    const handleResize = () => {
      if (!copied && !answerSheet?.submit_status) {
        markAsCopied();
      }
    };

    const handleBeforeUnload = (e) => {
      if (!copied && !answerSheet?.submit_status) {
        e.preventDefault();
        markAsCopied();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [copied, answerSheet]);

  const handleRefreshQuestions = async () => {
    if (refreshCode !== 'directedbyvasu') {
      toast.error('Invalid refresh code');
      return;
    }

    try {
      setRefreshLoading(true);
      const response = await fetch(Allapi.refreshAnswerSheet.url(answerSheetId), {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token')
        }
      });
      
      if (!response.ok) throw new Error('Failed to refresh answer sheet');
      
      const refreshedData = await response.json();
      setAnswerSheet(refreshedData.answerSheet);
      setAnswers({});
      setShowRefreshModal(false);
      setRefreshCode('');
      toast.success('Questions refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh questions');
    } finally {
      setRefreshLoading(false);
    }
  };

  const markAsCopied = async () => {
    if (copied || answerSheet?.submit_status) return;

    try {
      const response = await fetch(Allapi.assignCopied.url(answerSheetId), {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token'),
        },
      });

      if (!response.ok) throw new Error('Failed to mark as copied');
      
      setCopied(true);
      setShowPasscodeModal(true);
      toast.error('You have been caught cheating!');
    } catch (error) {
      console.error('Error marking as copied:', error);
    }
  };

  const handleRemoveCopied = async () => {
    try {
      const response = await fetch(Allapi.removeCopied.url(answerSheetId), {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passcode }),
      });

      if (!response.ok) throw new Error('Invalid passcode');

      setCopied(false);
      setAnswers({})
      setShowPasscodeModal(false);
      setPasscode('');
      toast.success('Copying status removed');
    } catch (error) {
      toast.error('Invalid passcode');
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setAiEvaluating(true);
      let aiScore = null;
      
      if (answerSheet?.exam_type !== 'internal') {
        try {
          const aiResponse = await fetch(Allapi.aiScore.url, {
            method: 'POST',
            headers: {
              'Authorization': localStorage.getItem('token'),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: `Please evaluate these answers and provide a single numerical score out of 100. Do not include any explanation or additional text. If all answers are wrong, return 0. Only return the number:\n${JSON.stringify(answers)}
`,
            }),
          });

          console.log("ai : ",aiResponse)

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            console.log("aidata: ",aiData)
            aiScore = parseFloat(aiData.response);
            setAiScore(aiScore);
            console.log("ai score: ",aiScore)
            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error) {
          console.error('AI scoring failed:', error);
          // Continue with submission even if AI scoring fails
        }
      }

      // Format answers for submission
      const formattedAnswers = answerSheet.data.map(questionObj => {
        const question = Object.keys(questionObj)[0];
        return { [question]: answers[question] || '' };
      });

      // Submit the exam
      const response = await fetch(Allapi.submitAnswerSheet.url, {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answer_sheet_id: answerSheetId,
          answers: formattedAnswers,
          ai_score: aiScore,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit answer sheet');

      toast.success('Exam submitted successfully');
      navigate('/student');
    } catch (error) {
      toast.error(error.message || 'Failed to submit exam');
      setLoading(false);
    } finally {
      setAiEvaluating(false);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute w-full h-full border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute border-4 border-blue-300 rounded-full top-1 left-1 w-14 h-14 border-t-transparent animate-spin" style={{ animationDuration: '1.5s' }}></div>
        </div>
      </div>
    );
  }

  if (aiEvaluating) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 text-center max-w-lg">
          {aiScore === null ? (
            <>
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-ping opacity-75"></div>
                <div className="relative flex items-center justify-center w-full h-full">
                  <Brain className="w-16 h-16 text-blue-500 animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">AI is evaluating your answers...</h2>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 animate-loading-bar"></div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-6xl font-bold text-blue-500 animate-score-reveal">{aiScore}</div>
              <p className="text-xl text-white mb-2">Your AI-Generated Score</p>
              <div className="flex items-center justify-center">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
                <p className="text-gray-400">Submitting your exam...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!answerSheet) {
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border-2 border-red-500/20 p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
          <p className="text-gray-400 mb-6">Failed to load exam data. Please try again.</p>
          <button
            onClick={() => navigate('/student')}
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
          <h2 className="text-2xl font-bold text-white mb-4">Exam Already Submitted</h2>
          <p className="text-gray-400 mb-6">You have already submitted this exam.</p>
          <button
            onClick={() => navigate('/student')}
            className="px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (copied) {
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border-2 border-red-500/20 p-8 text-center max-w-lg">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Caught Cheating</h2>
          <p className="text-gray-400 mb-6">You have been marked for copying. Please enter the passcode to continue.</p>
          <div className="space-y-4">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleRemoveCopied}
              className="w-full px-6 py-3 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
            >
              Submit Passcode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract questions from answerSheet.data
  const questions = answerSheet.data ? answerSheet.data.map(answer => Object.keys(answer)[0]) : [];
  const currentQuestion = questions[activeQuestionIndex];

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
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
              <div className={`text-lg font-mono ${timeLeft < 300 ? 'text-red-400' : 'text-blue-400'}`}>
                Time Left: {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {answerSheet.exam_type === 'external' ? (
            <div className="space-y-6">
              {/* Question navigation */}
              <div className="flex flex-wrap gap-2">
                {questions.map((q, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveQuestionIndex(index)}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-300 ${
                      activeQuestionIndex === index
                        ? 'bg-blue-500 text-white'
                        : answers[q]
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              {/* Current question */}
              <div className="space-y-4">
                <h3 className="text-lg text-white">Question {activeQuestionIndex + 1}</h3>
                <p className="text-white">{currentQuestion}</p>
                <textarea
                  value={answers[currentQuestion] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [currentQuestion]: e.target.value }))}
                  className="w-full h-64 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Enter your answer..."
                />
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => setActiveQuestionIndex(prev => Math.max(0, prev - 1))}
                  disabled={activeQuestionIndex === 0}
                  className={`px-4 py-2 rounded-lg transition-all duration-300 ${
                    activeQuestionIndex === 0
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  Previous
                </button>
                {activeQuestionIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setActiveQuestionIndex(prev => prev + 1)}
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
                  <h3 className="text-lg text-white">Question {index + 1}: {question}</h3>
                  {answerSheet.exam_type === 'internal' ? (
                    <p className="text-gray-400 italic">This is an internal exam. No answers required.</p>
                  ) : (
                    <textarea
                      value={answers[question] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question]: e.target.value }))}
                      className="w-full h-32 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      placeholder="Enter your answer..."
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
                  {loading ? 'Submitting...' : 'Submit Exam'}
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
            <h2 className="text-xl font-bold text-white mb-4">Refresh Questions</h2>
            <p className="text-gray-400 mb-4">Enter the refresh code to continue</p>
            <input
              type="password"
              value={refreshCode}
              onChange={(e) => setRefreshCode(e.target.value)}
              placeholder="Enter refresh code"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRefreshModal(false);
                  setRefreshCode('');
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
                  'Refresh'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSession;