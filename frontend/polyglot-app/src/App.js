import { API_CONFIG } from './config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { useWebSocket } from './hooks/useWebSocket';
import { useStreamingAudio } from './hooks/useStreamingAudio';
import { uploadAudioToS3, sendHeartbeat, getSummary } from './api';
import { CompanionMode } from './CompanionMode';  // ✅ ADD THIS IMPORT

function App() {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [userLanguage, setUserLanguage] = useState('en');
  const [isInRoom, setIsInRoom] = useState(false);

  const joinRoom = () => {
    if (roomId && userName && userLanguage) {
      setIsInRoom(true);
    }
  };

  if (isInRoom) {
    return <ConversationRoom 
      roomId={roomId} 
      userName={userName} 
      userLanguage={userLanguage} 
    />;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🌍 Polyglot</h1>
        <p>Real-Time Multi-Language Conversation</p>
        
        <div className="join-form">
          <input
            type="text"
            placeholder="Your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          
          <select 
            value={userLanguage} 
            onChange={(e) => setUserLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="hi">Hindi</option>
          </select>
          
          <input
            type="text"
            placeholder="Room ID (e.g., demo-123)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          
          <button onClick={joinRoom}>Join Conversation</button>
        </div>
      </header>
    </div>
  );
}

// Helper function to generate avatar
const getAvatar = (name) => {
  if (!name) return { initials: '?', color: '#6b7280' };
  
  const initials = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  // Generate consistent color based on name
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', 
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
  ];
  
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  
  return { initials, color };
};

function ConversationRoom({ roomId, userName, userLanguage }) {
  // ✅ ALL STATE DECLARATIONS FIRST
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [companionMode, setCompanionMode] = useState(true); // ✅ DEFAULT TO COMPANION MODE
  
  const messagesEndRef = useRef(null);

  // ✅ ALL CALLBACKS AND EFFECTS SECOND
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behaviour: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('📨 Received WebSocket data:', data);
    
    if (data.type === 'newMessage') {
      setMessages(prev => [...prev, data.message]);
    } else if (data.type === 'participantUpdate') {
      setParticipants(data.participants || []);
    } else if (data.type === 'allMessages') {
      setMessages(data.messages || []);
      setParticipants(data.participants || []);
    } else if (data.type === 'chunkReceived') {
      console.log(`✅ Chunk ${data.chunkId} received by server`);
    }
  }, []);

  // Initialize room - clear and fetch messages
  useEffect(() => {
    const initializeRoom = async () => {
      // First clear old messages
      await fetch(`${API_CONFIG.API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'clear',
          roomId: roomId
        })
      });
      
      // Wait a bit to ensure clear completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Then fetch fresh messages (should be empty)
      const response = await fetch(`${API_CONFIG.API_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'get',
          roomId: roomId
        })
      });
      
      const data = await response.json();
      console.log('Received initial messages:', data.messages);
      console.log('👥 Received initial participants:', data.participants);
      setMessages(data.messages || []);
      setParticipants(data.participants || []);
    };
    
    initializeRoom();
  }, [roomId]);

  // Send heartbeat every 5 seconds
  useEffect(() => {
    sendHeartbeat(roomId, userName, userLanguage, isRecording);
    
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(roomId, userName, userLanguage, isRecording);
    }, 5000);
    
    return () => clearInterval(heartbeatInterval);
  }, [roomId, userName, userLanguage, isRecording]);

  const { isConnected, sendMessage: sendWebSocketMessage } = useWebSocket(roomId, handleWebSocketMessage);

  const handleAudioChunk = useCallback(async (audioBlob, mimeType) => {
    if (!isConnected) {
      console.warn('WebSocket not connected, cannot send chunk');
      return;
    }

    try {
      const chunkId = Date.now();
      setChunkCount(prev => prev + 1);
      
      console.log(`📤 Uploading chunk ${chunkCount + 1} to S3...`);
      
      const fileName = await uploadAudioToS3(audioBlob, mimeType);
      
      console.log(`✅ Uploaded to S3: ${fileName}`);
      
      sendWebSocketMessage({
        action: 'streamAudio',
        s3Key: fileName,
        language: userLanguage,
        chunkId: chunkId,
        roomId: roomId,
        userName: userName
      });
      
      console.log(`📤 Sent chunk ${chunkCount + 1} notification`);
      
    } catch (error) {
      console.error('Error processing chunk:', error);
    }
  }, [isConnected, sendWebSocketMessage, userLanguage, roomId, userName, chunkCount]);

  const streamingAudio = useStreamingAudio(handleAudioChunk);

  const handleRecordingToggle = () => {
    if (isRecording) {
      streamingAudio.stopRecording();
      setIsRecording(false);
      setChunkCount(0);
    } else {
      streamingAudio.startRecording();
      setIsRecording(true);
    }
  };

  const clearChat = async () => {
    if (window.confirm('Clear all messages in this room?')) {
      try {
        await fetch(`${API_CONFIG.API_URL}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'clear',
            roomId: roomId
          })
        });
        setMessages([]);
      } catch (error) {
        console.error('Error clearing messages:', error);
      }
    }
  };

  const generateSummary = async () => {
    if (messages.length === 0) {
      alert('No messages to summarize!');
      return;
    }
    
    setIsLoadingSummary(true);
    setShowSummary(true);
    
    const summaryText = await getSummary(messages, userLanguage);
    setSummary(summaryText);
    setIsLoadingSummary(false);
  };

  // ✅ CONDITIONAL RENDERING AT THE END
  if (companionMode) {
    return (
      <CompanionMode
        messages={messages}
        userLanguage={userLanguage}
        isRecording={isRecording}
        onToggleRecording={handleRecordingToggle}
        participants={participants}
      />
    );
  }

  // Normal mode UI
  return (
    <div className="conversation-room">
      <header className="room-header">
        <div>
          <h2>Room: {roomId}</h2>
          <div className="participants-list">
            👥 {participants.length} {participants.length === 1 ? 'person' : 'people'}: 
            {participants
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p, idx) => (
              <span key={idx} className="participant-badge">
                {p.isRecording && '🔴 '}
                {p.name} ({p.language?.toUpperCase()})
              </span>
            ))}
          </div>

          {participants.filter(p => p.isRecording).length > 0 && (
            <div className="recording-indicator">
              🔴 {participants.filter(p => p.isRecording).map(p => p.name).join(', ')} {participants.filter(p => p.isRecording).length === 1 ? 'is' : 'are'} recording...
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={generateSummary}
            disabled={messages.length === 0}
            style={{
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              opacity: messages.length === 0 ? 0.5 : 1
            }}
          >
            📋 Summarize
          </button>
          <button 
            onClick={clearChat} 
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}
          >
            🗑️ Clear Chat
          </button>
          {!isConnected && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: '#ef4444',
              borderRadius: '20px',
              fontSize: '0.85rem',
              animation: 'pulse 1s infinite'
            }}>
              🔴 Connection Lost - Reconnecting...
            </div>
          )}
          <div className="user-info">
            {userName} ({userLanguage.toUpperCase()})
          </div>
        </div>
      </header>

      <div className="messages-container">
        {isProcessing && (
          <div className="processing">⏳ Translating...</div>
        )}
        
        {messages.filter(msg => msg.speaker && msg.original && msg.translations).length === 0 && !isProcessing && (
          <div className="empty-state">
            <div className="empty-icon">🎤</div>
            <h3>No messages yet</h3>
            <p>Press the button below to start speaking</p>
          </div>
        )}

        {messages
          .filter(msg => msg.speaker && msg.original && msg.translations)
          .map((msg, idx) => (
          <div key={idx} className="message">
            <div className="message-header">
              <div className="speaker-info">
                <div 
                  className="avatar" 
                  style={{ backgroundColor: getAvatar(msg.speaker).color }}
                >
                  {getAvatar(msg.speaker).initials}
                </div>
                <strong>{msg.speaker}</strong>
                <span className="speaker-lang">
                  {msg.speakerLanguage?.toUpperCase()}
                </span>
              </div>
              <span className="timestamp">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <div className="original">
              📝 Original: {msg.original}
            </div>
            
            <div className="translations">
              {Object.entries(msg.translations)
                .filter(([lang]) => lang === userLanguage)
                .map(([lang, text]) => (
                <div key={lang} className="translation-item">
                  <span className="lang-badge">{lang.toUpperCase()}</span>
                  <span className="translation-text">{text}</span>
                  
                  {msg.audioUrls && msg.audioUrls[lang] && (
                    <div className="audio-player">
                      <audio controls src={msg.audioUrls[lang]}>
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="controls">
        <button 
          className={isRecording ? 'recording' : ''}
          onClick={handleRecordingToggle}
          disabled={isProcessing}
        >
          {isProcessing ? '⏳ Processing...' : 
           isRecording ? '🔴 Stop Recording' : 
           '🎤 Press to Speak'}
        </button>
      </div>
      
      {showSummary && (
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Conversation Summary</h3>
              <button className="close-button" onClick={() => setShowSummary(false)}>✕</button>
            </div>
            <div className="modal-body">
              {isLoadingSummary ? (
                <div className="loading-summary">
                  <div className="spinner"></div>
                  <p>Generating summary...</p>
                </div>
              ) : (
                <div className="summary-text">{summary}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;