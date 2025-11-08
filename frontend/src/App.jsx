import React, { useState } from 'react';
import Header from './components/Header.jsx';
import Home from './views/Home.jsx';
import Chat from './views/Chat.jsx';
import DevConsole from './components/DevConsole.jsx'; 
import Toast from './components/Toast.jsx';

export default function App() {
  // State to control which page is visible
  const [page, setPage] = useState('/'); // '/' (Home), '/chat', or '/admin'
  
  // State to control the pop-up notifications
  const [toast, setToast] = useState(null); // e.g., { message: 'Hi', type: 'info' }

  // Function to show a toast, passed down to children
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Function to close the toast
  const closeToast = () => {
    setToast(null);
  };

  // Function passed to Header to change the page
  const handleNavigate = (targetPage) => {
    setPage(targetPage);
  };

  // Helper function to render the correct page
  const renderPage = () => {
    switch (page) {
      case '/':
        return <Home showToast={showToast} />;
      case '/chat':
        return <Chat showToast={showToast} />;
      case '/admin':
        return <DevConsole showToast={showToast} />;
      default:
        return <Home showToast={showToast} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header onNavigate={handleNavigate} />
      
      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>

      {/* The Toast component only renders if there's a message */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </div>
  );
}