import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, BookOpen } from 'lucide-react';
import Allapi from '../utils/common';

const StudentPanel = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchStartedExams();
  }, []);

  const fetchStartedExams = async () => {
    try {
      const response = await fetch(Allapi.getStartedExams.url, {
        headers: {
          Authorization: localStorage.getItem('token'),
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch exams');
      setExams(data.exams || []);
    } catch (error) {
      toast.error('Failed to fetch exams');
    } finally {
      setLoading(false);
    }
  };

  const startExam = async (examId) => {
    try {
      const response = await fetch(Allapi.createAnswerSheet.url, {
        method: 'POST',
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exam_id: examId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create answer sheet');

      // Navigate to exam session with answer sheet ID
      navigate(`/exam-session/${data.answerSheet.id}`);
    } catch (error) {
      toast.error(error.message || 'Failed to start exam');
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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Available Exams</h1>
          <button
            onClick={() => {
              localStorage.clear();
              navigate('/login');
            }}
            className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-300"
          >
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-gray-800 rounded-xl border-2 border-blue-500/20 p-6 hover:border-blue-500/40 transition-all duration-300"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold text-white">{exam.name}</h2>
                  <span className="px-2 py-1 text-sm rounded-full bg-blue-500/20 text-blue-400">
                    {exam.exam_type}
                  </span>
                </div>
                <div className="space-y-2 text-gray-300">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    <span>Duration: {exam.duration} minutes</span>
                  </div>
                  <div className="flex items-center">
                    <BookOpen className="w-4 h-4 mr-2" />
                    <span>Questions: {exam.questions.length}</span>
                  </div>
                </div>
                <button
                  onClick={() => startExam(exam.id)}
                  className="w-full px-4 py-2 text-green-400 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-all duration-300"
                >
                  Start Exam
                </button>
              </div>
            </div>
          ))}

          {exams.length === 0 && (
            <div className="col-span-full bg-gray-800 rounded-xl border-2 border-blue-500/20 p-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-gray-400" />
              <h3 className="mt-4 text-xl font-semibold text-white">No Active Exams</h3>
              <p className="mt-2 text-gray-400">There are no exams available right now</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentPanel;