import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Allapi from '../utils/common';

const CreateExam = () => {
  const navigate = useNavigate();
  const [examData, setExamData] = useState({
    name: '',
    duration: 0, // Ensure duration is a number
    exam_type: 'internal',
    questions: []
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setExamData(prev => ({
      ...prev,
      [name]: name === "duration" ? Number(value) : value  // Keep duration as a number
    }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      const questions = data
        .map(row => row[0])
        .filter(question => question && typeof question === 'string' && question.trim() !== '');

      setExamData(prev => ({
        ...prev,
        questions
      }));
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!examData.name || !examData.duration || examData.questions.length === 0) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
    //   console.log("exam data: ", JSON.stringify(examData));
      const response = await fetch(Allapi.createExam.url, {
        method: 'POST',
        headers: {
          'Authorization': localStorage.getItem('token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(examData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create exam');
      }

      toast.success('Exam created successfully');
      navigate('/teacher');
    } catch (error) {
      toast.error('Failed to create exam');
    }
  };

  const handleQuestionEdit = (index, newValue) => {
    const updatedQuestions = [...examData.questions];
    updatedQuestions[index] = newValue;
    setExamData(prev => ({
      ...prev,
      questions: updatedQuestions
    }));
  };

  const handleDeleteQuestion = (index) => {
    setExamData(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)  // Remove question at index
    }));
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 border-2 border-blue-500/20">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate('/teacher')}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold text-white">Create New Exam</h1>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300">
                Exam Name
              </label>
              <input
                type="text"
                name="name"
                value={examData.name}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Duration (minutes)
              </label>
              <input
                type="number"
                name="duration"
                value={examData.duration}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Exam Type
              </label>
              <select
                name="exam_type"
                value={examData.exam_type}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
                <option value="viva">Viva</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">
                Upload Questions (Excel file)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="mt-1 block w-full text-sm text-gray-300
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-500/20 file:text-blue-400
                  hover:file:bg-blue-500/30"
              />
            </div>

            {examData.questions.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-white mb-3">Questions</h3>
                <div className="space-y-3">
                  {examData.questions.map((question, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => handleQuestionEdit(index, e.target.value)}
                        className="block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(index)}
                        className="p-2 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/teacher')}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Create Exam
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateExam;
