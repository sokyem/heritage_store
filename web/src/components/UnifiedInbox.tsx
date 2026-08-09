'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface MessageType {
  id: string;
  content: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  isRead: boolean;
}

interface ConversationType {
  id: string;
  title: string;
  relatedType?: string;
  updatedAt: string;
  messages: MessageType[];
  participants: {
    id: string;
    name: string;
    email: string;
  }[];
}

export default function UnifiedInbox() {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationType | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composerSubject, setComposerSubject] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch messages for selected conversation
  const fetchMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        
        // Mark all as read
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAllAsRead: true }),
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  // Initial load
  useEffect(() => {
    if (session?.user) {
      fetchConversations();
    }
  }, [session]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle conversation selection
  const handleSelectConversation = (conversation: ConversationType) => {
    setComposing(false);
    setSelectedConversation(conversation);
    fetchMessages(conversation.id);
  };

  // Open the new-conversation composer
  const openComposer = () => {
    setComposing(true);
    setSelectedConversation(null);
    setComposerSubject('');
    setComposerBody('');
  };

  // Create a new conversation with the studio + send the first message
  const handleStartConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerBody.trim()) return;

    setSendingMessage(true);
    try {
      // Participants omitted — the API adds the AWULA K studio team.
      const convRes = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: composerSubject.trim() }),
      });
      if (!convRes.ok) throw new Error('Failed to create conversation');
      const conversation: ConversationType = await convRes.json();

      // Post the opening message
      const msgRes = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: composerBody.trim() }),
      });
      if (!msgRes.ok) throw new Error('Failed to send the message');

      await fetchConversations();
      setComposing(false);
      setComposerSubject('');
      setComposerBody('');
      setSelectedConversation({ ...conversation, messages: conversation.messages ?? [] });
      fetchMessages(conversation.id);
    } catch (error) {
      console.error('Failed to start conversation:', error);
      alert('Could not start the conversation. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages([...messages, sentMessage]);
        setNewMessage('');
        
        // Refresh conversations to update "last message" and timestamp
        await fetchConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  // Format timestamp
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return date.toLocaleDateString();
  };

  if (!session?.user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Please sign in to access your inbox</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Conversations List */}
      <div className="w-80 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-light luxury-heading mb-4">Messages</h2>
          <button
            onClick={openComposer}
            className="w-full btn-luxury py-2 text-sm"
          >
            + New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">
              <p className="luxury-body">Loading conversations...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              <p className="luxury-body">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedConversation?.id === conversation.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-sm truncate">{conversation.title}</h3>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatTime(conversation.updatedAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate">
                  {conversation.participants
                    .filter(p => p.email !== session.user?.email)
                    .map(p => p.name || p.email)
                    .join(', ') || 'AWULA K Studio'}
                </p>
                {conversation.messages.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {conversation.messages[0].content}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Messages Pane */}
      <div className="flex-1 flex flex-col">
        {composing ? (
          <div className="flex-1 flex flex-col bg-gray-50">
            <div className="border-b border-gray-200 p-4 bg-white">
              <h2 className="text-lg font-medium luxury-heading">New Message</h2>
              <p className="text-sm text-gray-600">Send a message to the AWULA K studio team.</p>
            </div>
            <form onSubmit={handleStartConversation} className="flex-1 flex flex-col p-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={composerSubject}
                  onChange={(e) => setComposerSubject(e.target.value)}
                  placeholder="What's this about? (optional)"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  disabled={sendingMessage}
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 min-h-[160px] w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                  disabled={sendingMessage}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="btn-luxury px-6 py-2 disabled:opacity-50"
                  disabled={sendingMessage || !composerBody.trim()}
                >
                  {sendingMessage ? 'Sending…' : 'Send Message'}
                </button>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  disabled={sendingMessage}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="border-b border-gray-200 p-4 bg-white">
              <h2 className="text-lg font-medium luxury-heading mb-1">{selectedConversation.title}</h2>
              <p className="text-sm text-gray-600">
                {selectedConversation.participants.length} participant{selectedConversation.participants.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400 luxury-body">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isCurrentUser = message.user?.email === session.user?.email;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          isCurrentUser
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none'
                        }`}
                      >
                        {!isCurrentUser && (
                          <p className="text-xs font-medium mb-1 opacity-75">
                            {message.user.name || message.user.email}
                          </p>
                        )}
                        <p className="text-sm break-words">{message.content}</p>
                        <p className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-100' : 'text-gray-500'}`}>
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="border-t border-gray-200 bg-white p-4">
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  disabled={sendingMessage}
                />
                <button
                  type="submit"
                  className="btn-luxury px-6 py-2 disabled:opacity-50"
                  disabled={sendingMessage || !newMessage.trim()}
                >
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
              <p className="text-gray-400 luxury-body mb-2">Select a conversation to start messaging</p>
              <button onClick={openComposer} className="btn-luxury text-sm">
                Start New Conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
