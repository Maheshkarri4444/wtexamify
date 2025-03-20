import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Clock, BookOpen, Download } from 'lucide-react';
import Allapi from '../utils/common';

const TeacherPanel = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState(null);
  const [answerSheets, setAnswerSheets] = useState([]);
  const [showAnswerSheets, setShowAnswerSheets] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const response = await fetch(
        Allapi.getTeacherExams.url(user.container_id),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch exams');
      setExams(data.exams || []);
    } catch (error) {
      toast.error('Failed to fetch exams');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (examId, newStatus) => {
    try {
      const response = await fetch(
        Allapi.updateExam.url.replace(':id', examId),
        {
          method: 'PUT',
          headers: {
            'Authorization': localStorage.getItem('token'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update exam status');
      }
      
      await fetchExams();
      if (newStatus === 'start') {
        navigate(`/live-exam/${examId}`);
      }
    } catch (error) {
      toast.error('Failed to update exam status');
    }
  };

  const fetchAnswerSheets = async (examId) => {
    try {
      setShowAnswerSheets(true);
      setSelectedExam(examId);
      const response = await fetch(
        Allapi.getSubmittedAnswerSheets.url(examId),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
          method:"GET"
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch answer sheets');
      }

      const data = await response.json();
      setAnswerSheets(data.submitted_answersheets || []);
    } catch (error) {
      toast.error('Failed to fetch answer sheets');
    }
  };

  const downloadPDF = async (answerSheetId) => {
    try {
      const response = await fetch(
        Allapi.getAnswerSheetById.url(answerSheetId),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
          method:"GET"
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `answersheet-${answerSheetId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast.error('Failed to download PDF');
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
          <h1 className="text-3xl font-bold text-white">My Exams</h1>
          <div className="flex gap-4">
            <button
              onClick={() => {
                localStorage.clear();
                navigate('/login');
              }}
              className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-all duration-300"
            >
              Logout
            </button>
            <button
              onClick={() => navigate('/create-exam')}
              className="flex items-center px-4 py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-all duration-300"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Exam
            </button>
          </div>
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
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/edit-exam/${exam.id}`)}
                      className="flex-1 px-3 py-2 text-sm text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleStatusChange(exam.id, exam.status === 'start' ? 'stop' : 'start')}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all duration-300 ${
                        exam.status === 'start'
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      {exam.status === 'start' ? 'Stop' : 'Start'}
                    </button>
                  </div>
                  <button
                    onClick={() => fetchAnswerSheets(exam.id)}
                    className="w-full px-3 py-2 text-sm text-purple-400 bg-purple-500/20 rounded-lg hover:bg-purple-500/30 transition-all duration-300"
                  >
                    View Answer Sheets
                  </button>
                </div>
              </div>
            </div>
          ))}

          {exams.length === 0 && (
            <div className="col-span-full bg-gray-800 rounded-xl border-2 border-blue-500/20 p-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-gray-400" />
              <h3 className="mt-4 text-xl font-semibold text-white">No Exams Created</h3>
              <p className="mt-2 text-gray-400">Create your first exam to get started</p>
            </div>
          )}
        </div>

        {/* Answer Sheets Modal */}
        {showAnswerSheets && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Submitted Answer Sheets</h2>
                <button
                  onClick={() => {
                    setShowAnswerSheets(false);
                    setSelectedExam(null);
                    setAnswerSheets([]);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {answerSheets.length > 0 ? (
                <div className="space-y-4">
                  {answerSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                    >
                      <div>
                        <h3 className="text-white font-medium">{sheet.student_name}</h3>
                        <p className="text-gray-400 text-sm">{sheet.student_email}</p>
                      </div>
                      <button
                        onClick={() => downloadPDF(sheet.id)}
                        className="flex items-center px-3 py-2 text-sm text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400">No submitted answer sheets found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherPanel;