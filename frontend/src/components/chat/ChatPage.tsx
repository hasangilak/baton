import React, { useState } from 'react';
import { Send, Plus, Hash, Search } from 'lucide-react';

export const ChatPage: React.FC = () => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      // TODO: Handle message submission
      console.log('Message sent:', message);
      setMessage('');
    }
  };

  const quickActions = [
    { id: 'write', label: 'Write', icon: Plus },
    { id: 'learn', label: 'Learn', icon: Hash },
    { id: 'code', label: 'Code', icon: Hash },
    { id: 'life-stuff', label: 'Life stuff', icon: Hash }
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Welcome message */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-3">✨</span>
            <h1 className="text-2xl font-normal text-gray-200">
              What's new, Hassan?
            </h1>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-6">
          <div className="relative bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex items-center p-4">
              {/* Action buttons on the left */}
              <div className="flex items-center space-x-2 mr-4">
                <button
                  type="button"
                  className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-700 rounded-md transition-colors"
                  aria-label="Add attachment"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="button"
                  className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-700 rounded-md transition-colors"
                  aria-label="More options"
                >
                  <Hash size={18} />
                </button>
                <button
                  type="button"
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 hover:bg-gray-700 rounded-md transition-colors"
                  aria-label="Research"
                >
                  <Search size={16} />
                  <span>Research</span>
                </button>
              </div>

              {/* Input field */}
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can I help you today?"
                className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none"
              />

              {/* Model selector and send button */}
              <div className="flex items-center space-x-2 ml-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">Claude Sonnet 4</span>
                  <button
                    type="submit"
                    disabled={!message.trim()}
                    className="p-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Quick action buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          {quickActions.map((action) => {
            const IconComponent = action.icon;
            return (
              <button
                key={action.id}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg border border-gray-700 hover:bg-gray-700 hover:text-gray-200 transition-colors"
              >
                <IconComponent size={16} />
                <span className="text-sm">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer spacer for mobile navigation */}
      <div className="pb-bottom-nav md:pb-0" />
    </div>
  );
};