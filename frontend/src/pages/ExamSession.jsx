import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Allapi from '../utils/common';

const ExamSession = () => {
  const { id: answerSheetId } = useParams();
  const navigate = useNavigate();
  const [answerSheet, setAnswerSheet] = useState(null);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [copied, setCopied] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(Allapi.watchAnswerSheets.url.replace('http', 'ws'));
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.answerSheet === answerSheetId) {
        setAnswers({}); // Reset answers on refresh
        toast.error('Your answer sheet has been refreshed by the teacher!');
      }
    };

    return () => ws.close();
  }, [answerSheetId]);

  // Anti-cheating measures
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        markAsCopied();
      }
    };

    const handleResize = () => {
      markAsCopied();
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      markAsCopied();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const markAsCopied = async () => {
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
      setShowPasscodeModal(false);
      setPasscode('');
      toast.success('Copying status removed');
    } catch (error) {
      toast.error('Invalid passcode');
    }
  };

  const handleSubmit = async () => {
    try {
      let aiScore = null;
      
      if (exam.exam_type !== 'internal') {
        // Get AI score
        try {
          const aiResponse = await fetch(Allapi.aiScore.url, {
            method: 'POST',
            headers: {
              'Authorization': localStorage.getItem('token'),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: `Please evaluate these answers and give a score out of 100:\n${JSON.stringify(answers)}`,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            aiScore = parseFloat(aiData.response);
          }
        } catch (error) {
          console.error('AI scoring failed:', error);
          // Continue with submission even if AI scoring fails
        }
      }

      // Submit answer sheet
      const response = await fetch(Allapi.submitAnswerSheet.url, {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answer_sheet_id: answerSheetId,
          answers: Object.entries(answers).map(([question, answer]) => ({ [question]: answer })),
          ai_score: aiScore,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit answer sheet');

      toast.success('Exam submitted successfully');
      navigate('/student');
    } catch (error) {
      toast.error(error.message || 'Failed to submit exam');
    }
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

  if (answerSheet?.submit_status) {
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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-6">
          <h1 className="text-2xl font-bold text-white mb-4">{exam?.name}</h1>
          <div className="space-y-6">
            {exam?.questions.map((question, index) => (
              <div key={index} className="space-y-2">
                <h3 className="text-lg text-white">{question}</h3>
                {exam.exam_type === 'internal' ? (
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
          </div>
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all duration-300"
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamSession;