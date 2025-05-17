'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/20/solid'; // Example, adjust if not using heroicons
import axios from 'axios';
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown
export default function Home() {
  const [question, setQuestion] = useState('');
  const [learningStyle, setLearningStyle] = useState('visual');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isClient, setIsClient] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedChatIndex, setSelectedChatIndex] = useState(null);
  const [followUpContext, setFollowUpContext] = useState(null);
  const dotRef = useRef(null);
  const textareaRef = useRef(null);
  
  useEffect(() => {
    setIsClient(true);
    
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
      setChatHistory(JSON.parse(saved));
    }
  }, []);
  
  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (isClient && chatHistory.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    }
  }, [chatHistory, isClient]);

  // Function to render DOT diagrams using d3-graphviz
  const renderDotDiagram = useCallback(async (dotCode) => {
    if (!dotCode || !dotRef.current) return null;
    
    try {
      // Clear previous content
      dotRef.current.innerHTML = '';
      
      // Create a unique ID for the container
      const containerId = `graph-container-${Date.now()}`;
      const container = document.createElement('div');
      container.id = containerId;
      container.className = 'w-full h-full';
      dotRef.current.appendChild(container);
      
      const { graphviz } = await import('d3-graphviz');
      
      const graph = graphviz(`#${containerId}`)
        .zoom(true)
        .fit(true)
        .scale(1)
        .width(dotRef.current.clientWidth)
        .height(400);
      
      graph.renderDot(dotCode);
      return true;
    } catch (error) {
      console.error('Failed to render DOT diagram:', error);
      
      if (dotRef.current) {
        dotRef.current.innerHTML = `
          <div class="bg-red-900/50 border border-red-700 rounded-md p-4 mt-2 text-sm">
            <p class="font-semibold">DOT Diagram Rendering Error:</p>
            <pre class="mt-2 overflow-auto whitespace-pre-wrap">${error.message}</pre>
            <p class="mt-2">Raw DOT code:</p>
            <pre class="mt-2 overflow-auto whitespace-pre-wrap">${dotCode}</pre>
          </div>
        `;
      }
      return false;
    }
  })
  
  // Function to handle form submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault(); // Prevent default if event is passed
    if (!question.trim()) return;

    setIsLoading(true);
    setError(null);

    const requestData = {
      question,
      learning_style: learningStyle,
    };

    if (followUpContext) {
      requestData.previous_question = followUpContext?.question;
      requestData.previous_answer = followUpContext?.answer;
      requestData.chatHistory = chatHistory;
    } else {
      requestData.chatHistory = chatHistory;
    }

    try {
      const response = await axios.post('http://localhost:8000/query', requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const newEntry = {
        id: Date.now(),
        question: requestData.question,
        answer: response.data.answer,
        diagram: response.data.diagram,
        learningStyle,
        isFollowUp: !!followUpContext
      };

      setChatHistory(prev => {
        if (followUpContext) {
          // Append the new question and answer to the previous chat entry
          const updatedChatHistory = [...prev];
          const previousChatIndex = updatedChatHistory.findIndex(chat => chat.question === followUpContext.question && chat.answer === followUpContext.answer);
          if (previousChatIndex !== -1) {
            updatedChatHistory[previousChatIndex] = {
              ...updatedChatHistory[previousChatIndex],
              answer: `${updatedChatHistory[previousChatIndex].answer}\n\n**Follow-up Question:** ${requestData.question}\n\n**Answer:** ${response.data.answer}`
            };
          }
          return updatedChatHistory;
        } else {
          return [newEntry, ...prev];
        }
      });
      setQuestion('');
      setFollowUpContext(null);

      // Render diagram if available
      if (response.data.diagram) {
        renderDotDiagram(response.data.diagram);
      }
    } catch (err) {
      console.error('API Error Details:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
        url: err.config?.url
      });
      setError(`Error: ${err.response?.status || ''} ${err.response?.statusText || ''} - ${err.response?.data?.detail || err.message || 'An error occurred while processing your request'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = () => {
    if (!currentChat) return;
    setFollowUpContext({ question: currentChat.question, answer: currentChat.answer });
    setQuestion('');
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Preload d3-graphviz on client-side
  useEffect(() => {
    const preloadLibraries = async () => {
      try {
        // Preload d3 and d3-graphviz
        await Promise.all([
          import('d3'),
          import('d3-graphviz')
        ]);
      } catch (error) {
        console.error('Error preloading d3-graphviz:', error);
      }
    };
    
    // Only run in browser
    if (typeof window !== 'undefined') {
      preloadLibraries();
    }
  }, []);
 
  // Render diagram when chat history changes or a past chat is selected
  useEffect(() => {
    let diagramToRender = null;
    if (selectedChatIndex !== null && chatHistory[selectedChatIndex]?.diagram) {
      diagramToRender = chatHistory[selectedChatIndex].diagram;
    } else if (selectedChatIndex === null && chatHistory.length > 0 && chatHistory[0]?.diagram) {
      // If no specific chat is selected, show the latest diagram if available
      diagramToRender = chatHistory[0].diagram;
    }

    if (diagramToRender) {
      renderDotDiagram(diagramToRender);
    } else if (dotRef.current) {
      // Clear diagram if no diagram to render for the current view
      dotRef.current.innerHTML = ''; 
    }
  }, [chatHistory, selectedChatIndex, renderDotDiagram]); // Added renderDotDiagram to dependency array

  // Determine current chat to display
  // Only determine currentChat on the client side to prevent hydration errors
  const currentChat = isClient && chatHistory.length > 0 
    ? (selectedChatIndex !== null && selectedChatIndex < chatHistory.length 
        ? chatHistory[selectedChatIndex] 
        : chatHistory[0])
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 md:p-8">
      <title>StrucAI</title>
      <header className="w-full max-w-3xl mb-8 text-center">
        {/* <Image src={logo} alt="StructAI Logo" height={150} className="mx-auto mt-16 mb-4 object-cover" /> */}
        <h1 className="text-5xl mt-16 font-bold text-blue-400">StructAI</h1>
        <p className="text-lg text-gray-400 mt-2">Your personal AI tutor for Data Structures and Algorithms</p>
      </header>

      {/* Main Content Area: Form + Current Chat Display */}
      <div className="w-full max-w-3xl">
        <form onSubmit={handleSubmit} className="mb-8 p-6 bg-gray-800 rounded-lg shadow-xl">
          <textarea
            ref={textareaRef}
            className="w-full p-3 text-lg bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out resize-none"
            rows="4" // Increased rows for follow-up prompt
            placeholder="Ask about a data structure (e.g., 'Explain how a hash map works')"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent newline on Enter
                handleSubmit();
              }
            }}
          />
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center">
            <div className="mb-4 sm:mb-0">
              <label htmlFor="learningStyle" className="block text-sm font-medium text-gray-300 mb-1">Learning Style:</label>
              <div className="relative w-full sm:w-auto">
                <button
                  type="button"
                  id="learningStyle"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full sm:w-52 py-2 pl-3 pr-3 text-left text-gray-100 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-600 transition-colors duration-150 flex items-center"
                >
                  <span className="flex-grow">
                    {learningStyle === 'step-by-step' ? 'Step-by-step' : learningStyle === 'visual' ? 'Visual (with Diagram)' : 'Concise'}
                  </span>
                  <ChevronDownIcon className={`h-5 w-5 text-gray-400 transform transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-gray-700 border border-gray-600 rounded-md shadow-lg">
                    <ul>
                      {[
                        { value: 'visual', label: 'Visual (with Diagram)' },
                        { value: 'step-by-step', label: 'Step-by-step' },
                        { value: 'concise', label: 'Concise' },
                      ].map((option) => (
                        <li
                          key={option.value}
                          onClick={() => {
                            setLearningStyle(option.value);
                            setIsDropdownOpen(false);
                          }}
                          className="px-4 py-2 text-sm text-gray-100 hover:bg-gray-600 cursor-pointer flex items-center justify-between"
                        >
                          {option.label}
                          {learningStyle === option.value && <CheckIcon className="h-5 w-5 text-blue-400" />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Ask StructAI'}
            </button>
          </div>
        </form>

        {isLoading && !currentChat && (
          <div className="mt-8 w-full p-6 bg-gray-800 rounded-lg shadow-xl flex items-center justify-center">
            <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="ml-4 text-lg">Hashing out an explanation...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 w-full p-6 bg-red-800 rounded-lg shadow-xl">
            <h3 className="text-xl font-semibold mb-2 text-red-200">Error</h3>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {currentChat && (
          <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-xl">
            <h3 className="text-xl font-semibold mb-2 text-blue-300">Your Question:</h3>
            <p className="mb-4 text-gray-300">{currentChat.question}</p>
            
            <h3 className="text-xl font-semibold mb-2 text-blue-300">StructAI's Explanation:</h3>
            <div className="prose prose-invert max-w-none text-gray-300">
              <ReactMarkdown>{currentChat.answer}</ReactMarkdown>
            </div>

            {currentChat.diagram && (
              <div className="mt-6">
                <h3 className="text-xl font-semibold mb-2 text-blue-300">Diagram:</h3>
                <div ref={dotRef} className="w-full h-auto p-4 bg-white rounded-md shadow-inner overflow-hidden min-h-[200px]"></div>
              </div>
            )}

            <div className="mt-6">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  // Re-query the API with the same question
                  setQuestion(currentChat.question);
                  setTimeout(() => handleSubmit(), 0);
                }}
                className="w-full p-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <span>Ask Again</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Previous Questions List - Displayed below the main content */}
      {chatHistory.length > 0 && (
        <div className="mt-12 w-full max-w-3xl">
          <h2 className="text-2xl font-semibold mb-6 text-center text-blue-300">Previous Questions</h2>
          <div className="space-y-4">
            {chatHistory.map((chat, index) => (
              <div 
                key={index} 
                className={`p-4 rounded-lg shadow-md cursor-pointer transition-all duration-200 ease-in-out 
                           ${selectedChatIndex === index 
                             ? 'bg-blue-700 ring-2 ring-blue-400 scale-105'
                             : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => {
                  setSelectedChatIndex(index);
                   
                }}
              >
                <p className={`font-medium ${selectedChatIndex === index ? 'text-white' : 'text-gray-200'}`}>
                  {chat.question.length > 70 ? `${chat.question.substring(0, 70)}...` : chat.question}
                </p>
                <p className={`text-sm mt-1 ${selectedChatIndex === index ? 'text-blue-200' : 'text-gray-400'}`}>
                  Style: {chat.learningStyle}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
