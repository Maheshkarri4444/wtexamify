import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Clock, BookOpen, Download, FileText, Loader, Mail } from 'lucide-react';
import Allapi from '../utils/common';

const TeacherPanel = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState(null);
  const [answerSheets, setAnswerSheets] = useState([]);
  const [showAnswerSheets, setShowAnswerSheets] = useState(false);
  const [questionSets, setQuestionSets] = useState([]);
  const [showQuestionSets, setShowQuestionSets] = useState(false);
  const [loadingAnswerSheets, setLoadingAnswerSheets] = useState(false);
  const [loadingQuestionSets, setLoadingQuestionSets] = useState(false);
  const [downloadingSheets, setDownloadingSheets] = useState({});
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [sendingEmails, setSendingEmails] = useState({});
  const [loadingExamStatus, setLoadingExamStatus] = useState({});
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchExams();
  }, []);

  const handleSendEmails = async (examId) => {
    try {
      setSendingEmails(prev => ({ ...prev, [examId]: true }));
      const response = await fetch(Allapi.sendEmails.url, {
        method: Allapi.sendEmails.method,
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send emails');
      }

      toast.success('Emails sent successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to send emails');
    } finally {
      setSendingEmails(prev => ({ ...prev, [examId]: false }));
    }
  };

  const fetchExams = async () => {
    try {
      const response = await fetch(
        Allapi.getTeacherExams.url(user.container_id),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
          method: "GET"
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
      setLoadingExamStatus(prev => ({ ...prev, [examId]: true }));
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
      toast.success(`Exam ${newStatus === 'start' ? 'started' : 'stopped'} successfully`);
    } catch (error) {
      toast.error('Failed to update exam status');
    } finally {
      setLoadingExamStatus(prev => ({ ...prev, [examId]: false }));
    }
  };

  const fetchAnswerSheets = async (examId) => {
    try {
      setShowAnswerSheets(true);
      setSelectedExam(examId);
      setLoadingAnswerSheets(true);
      const response = await fetch(
        Allapi.getSubmittedAnswerSheets.url(examId),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
          method: "GET"
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
    } finally {
      setLoadingAnswerSheets(false);
    }
  };

  const fetchQuestionSets = async (examId) => {
    try {
      setShowQuestionSets(true);
      setSelectedExam(examId);
      setLoadingQuestionSets(true);
      const response = await fetch(
        `${Allapi.backapi}/exam/getsets/${examId}`,
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch question sets');
      }

      const data = await response.json();
      setQuestionSets(data.question_sets || []);
    } catch (error) {
      toast.error('Failed to fetch question sets');
      setShowQuestionSets(false);
    } finally {
      setLoadingQuestionSets(false);
    }
  };

  const generatePrintContent = (answerSheet) => {
    return `
      <div class="answer-sheet" style="page-break-after: always;">
        <h2 style="margin-bottom: 20px;">Answer Sheet</h2>
        <p><strong>Student:</strong> ${answerSheet.student_name}</p>
        <p><strong>Set Number:</strong> ${answerSheet.set_number}</p>
        <p><strong>Copy Count:</strong> ${answerSheet.copy_count}</p>
        <p><strong>Ai Score:</strong> ${answerSheet.ai_score}</p>
        <hr style="margin: 20px 0;">
        ${answerSheet.data.map((item, index) => {
          const question = Object.keys(item)[0];
          const answer = item[question];
          return `
            <div class="question" style="margin-bottom: 20px;">
              <h3>Question ${index + 1}:</h3>
              <p>${question}</p>
              <div class="answer" style="margin-left: 20px; color: #444;">
                <strong>Answer:</strong><br>
                ${answer || 'No answer provided'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  const downloadAllPDFs = async () => {
    try {
      setDownloadingAll(true);
      const allSheets = await Promise.all(
        answerSheets.map(async (sheet) => {
          const response = await fetch(
            Allapi.getAnswerSheetById.url(sheet.id),
            {
              headers: {
                Authorization: localStorage.getItem('token'),
              },
              method: "GET"
            }
          );
          
          if (!response.ok) {
            throw new Error(`Failed to fetch answer sheet ${sheet.id}`);
          }

          const data = await response.json();
          return data.answerSheet;
        })
      );

      const printContent = `
        <html>
          <head>
            <title>All Answer Sheets</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              .answer-sheet { margin-bottom: 30px; }
              @media print {
                body { padding: 0; }
                .answer-sheet { page-break-after: always; }
              }
            </style>
          </head>
          <body>
            ${allSheets.map(sheet => generatePrintContent(sheet)).join('')}
          </body>
        </html>
      `;

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(printContent);
      iframe.contentWindow.document.close();

      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 100);
      };

    } catch (error) {
      toast.error('Failed to download all answer sheets');
    } finally {
      setDownloadingAll(false);
    }
  };

  const downloadPDF = async (answerSheetId) => {
    try {
      setDownloadingSheets(prev => ({ ...prev, [answerSheetId]: true }));

      const response = await fetch(
        Allapi.getAnswerSheetById.url(answerSheetId),
        {
          headers: {
            Authorization: localStorage.getItem('token'),
          },
          method: "GET"
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      const data = await response.json();
      
      const printContent = `
        <html>
          <head>
            <title>Answer Sheet</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              .question { margin-bottom: 20px; }
              .answer { margin-left: 20px; color: #444; }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <h1>Answer Sheet</h1>
            <p><strong>Student:</strong> ${data.answerSheet.student_name}</p>
            <p><strong>Set Number:</strong> ${data.answerSheet.set_number}</p>
            <p><strong>Copy Count:</strong> ${data.answerSheet.copy_count}</p>
            <p><strong>Ai Score:</strong> ${data.answerSheet.ai_score}</p>
            <hr style="margin: 20px 0;">
            ${data.answerSheet.data.map((item, index) => {
              const question = Object.keys(item)[0];
              const answer = item[question];
              return `
                <div class="question">
                  <h3>Question ${index + 1}:</h3>
                  <p>${question}</p>
                  <div class="answer">
                    <strong>Answer:</strong><br>
                    ${answer || 'No answer provided'}
                  </div>
                </div>
              `;
            }).join('')}
          </body>
        </html>
      `;

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(printContent);
      iframe.contentWindow.document.close();

      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 100);
      };

    } catch (error) {
      toast.error(error.message || 'Failed to download PDF');
    } finally {
      setDownloadingSheets(prev => ({ ...prev, [answerSheetId]: false }));
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
                      disabled={loadingExamStatus[exam.id]}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all duration-300 ${
                        exam.status === 'start'
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      {loadingExamStatus[exam.id] ? (
                        <div className="flex items-center justify-center">
                          <Loader className="w-4 h-4 animate-spin" />
                        </div>
                      ) : (
                        exam.status === 'start' ? 'Stop' : 'Start'
                      )}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchAnswerSheets(exam.id)}
                      className="flex-1 px-3 py-2 text-sm text-purple-400 bg-purple-500/20 rounded-lg hover:bg-purple-500/30 transition-all duration-300"
                    >
                      View Answer Sheets
                    </button>
                    <button
                      onClick={() => fetchQuestionSets(exam.id)}
                      className="flex-1 px-3 py-2 text-sm text-yellow-400 bg-yellow-500/20 rounded-lg hover:bg-yellow-500/30 transition-all duration-300"
                    >
                      View Sets
                    </button>
                  </div>
                  {exam.status === 'start' && (
                    <button
                      onClick={() => handleSendEmails(exam.id)}
                      disabled={sendingEmails[exam.id]}
                      className="flex items-center justify-center px-3 py-2 text-sm text-green-400 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-all duration-300"
                    >
                      {sendingEmails[exam.id] ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Emails
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

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

              {loadingAnswerSheets ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : answerSheets.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-end mb-4">
                    <button
                      onClick={downloadAllPDFs}
                      disabled={downloadingAll}
                      className="flex items-center px-4 py-2 text-green-400 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-all duration-300"
                    >
                      {downloadingAll ? (
                        <Loader className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Download All
                    </button>
                  </div>
                  {answerSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="bg-gray-700 rounded-lg p-4 flex justify-between items-center"
                    >
                      <div>
                        <h3 className="text-white font-medium">{sheet.student_name}</h3>
                        <p className="text-gray-400 text-sm">{sheet.student_email}</p>
                        <p className="text-gray-400 text-sm">Set: {sheet.set_number}</p>
                      </div>
                      <button
                        onClick={() => downloadPDF(sheet.id)}
                        disabled={downloadingSheets[sheet.id]}
                        className="flex items-center px-3 py-2 text-sm text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-all duration-300"
                      >
                        {downloadingSheets[sheet.id] ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <span className="flex items-center">
                            <Download className="w-4 h-4 mr-2" />
                            Download PDF
                          </span>
                        )}
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

        {showQuestionSets && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Question Sets</h2>
                <button
                  onClick={() => {
                    setShowQuestionSets(false);
                    setSelectedExam(null);
                    setQuestionSets([]);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {loadingQuestionSets ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : questionSets.length > 0 ? (
                <div className="space-y-6">
                  {questionSets.map((set) => (
                    <div
                      key={set.id}
                      className="bg-gray-700 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium text-white">Set {set.set_number}</h3>
                        <span className="px-2 py-1 text-sm rounded-full bg-blue-500/20 text-blue-400">
                          {set.exam_type}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {set.questions.map((question, index) => (
                          <div key={index} className="bg-gray-800 rounded p-3">
                            <p className="text-gray-300">
                              <span className="text-blue-400 mr-2">{index + 1}.</span>
                              {question}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400">No question sets found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherPanel;