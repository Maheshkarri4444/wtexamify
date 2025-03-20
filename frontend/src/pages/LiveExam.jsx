import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, RefreshCw, Download } from 'lucide-react';
import Allapi from '../utils/common';

const LiveExam = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [answerSheets, setAnswerSheets] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    const websocket = new WebSocket(Allapi.watchAnswerSheets.url.replace('http', 'ws'));
    
    websocket.onopen = () => {
      console.log('Connected to WebSocket');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setAnswerSheets(prev => {
        const index = prev.findIndex(sheet => sheet.id === data.answerSheet);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    };

    websocket.onerror = (error) => {
      toast.error('WebSocket connection error');
    };

    setWs(websocket);

    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [id]);

  const handleRefreshAnswerSheet = async (answerSheetId) => {
    try {
      const response = await fetch(`${Allapi.refreshAnswerSheet.url}/${answerSheetId}`, {
        method: 'PUT',
        headers: {
          'Authorization': localStorage.getItem('token'),
        },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to refresh answer sheet');
      }
      
      toast.success('Answer sheet refreshed');
    } catch (error) {
      toast.error('Failed to refresh answer sheet');
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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/teacher')}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-white">Live Exam Monitoring</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {answerSheets.map((sheet) => (
            <div
              key={sheet.id}
              className={`bg-gray-800 rounded-xl p-6 border-2 ${
                sheet.copied ? 'border-red-500' : 'border-blue-500/20'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {sheet.studentName}
                  </h3>
                  <p className="text-sm text-gray-400">{sheet.studentEmail}</p>
                </div>
                {sheet.copied && (
                  <span className="px-2 py-1 text-xs font-medium text-red-400 bg-red-500/20 rounded-full">
                    Copied
                  </span>
                )}
              </div>

              <div className="space-y-2 text-gray-300">
                <p className="flex items-center">
                  Questions Answered: {sheet.data.filter(q => q.answer).length} /{' '}
                  {sheet.data.length}
                </p>
                {sheet.aiScore && (
                  <p className="flex items-center">
                    AI Score: {sheet.aiScore.toFixed(2)}%
                  </p>
                )}
              </div>

              <div className="space-y-2 mt-4">
                <button
                  onClick={() => handleRefreshAnswerSheet(sheet.id)}
                  className="w-full px-3 py-2 text-sm font-medium text-blue-400 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Questions
                </button>

                {sheet.submit_status && (
                  <button
                    onClick={() => downloadPDF(sheet.id)}
                    className="w-full px-3 py-2 text-sm font-medium text-green-400 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                )}
              </div>
            </div>
          ))}

          {answerSheets.length === 0 && (
            <div className="col-span-full bg-gray-800 rounded-xl border-2 border-blue-500/20 p-12 text-center">
              <p className="text-gray-400">No students have joined the exam yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveExam;