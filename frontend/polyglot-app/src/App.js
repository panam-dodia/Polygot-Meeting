import { API_CONFIG } from './config';
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { useAudioRecording } from './hooks/useAudioRecording';
import { translateAudio, uploadAudioToS3, saveMessage, getRoomMessages, sendHeartbeat, getSummary } from './api';

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
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isRecording, audioBlob, mimeType, startRecording, stopRecording } = useAudioRecording();
  const messagesEndRef = useRef(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showSummary, setShowSummary] = useState(false);      // ✅ ADD THIS
  const [summary, setSummary] = useState('');                 // ✅ ADD THIS
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);  // ✅ ADD THIS

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behaviou: 'smooth' });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-clear old messages on first join
  useEffect(() => {
    const clearOldMessages = async () => {
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
    };
    
    clearOldMessages();
  }, [roomId]);

  // Send heartbeat every 5 seconds to show active presence
  useEffect(() => {
    // Send initial heartbeat
    sendHeartbeat(roomId, userName, userLanguage, isRecording);
    
    // Send heartbeat every 5 seconds
    const heartbeatInterval = setInterval(() => {
      sendHeartbeat(roomId, userName, userLanguage, isRecording);
    }, 5000);
    
    // Cleanup on unmount
    return () => clearInterval(heartbeatInterval);
  }, [roomId, userName, userLanguage, isRecording]);  // ✅ ADD isRecording DEPENDENCY

  // Poll for new messages every 3 seconds
  useEffect(() => {
    const fetchMessages = async () => {
      console.log('Fetching messages for room:', roomId);
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
      console.log('Received messages:', data.messages);
      console.log('👥 Received participants:', data.participants);  // ✅ ADD THIS LINE
      setMessages(data.messages || []);
      setParticipants(data.participants || []);
    };
    
    // Initial fetch
    fetchMessages();
    
    // Poll every 3 seconds
    const interval = setInterval(fetchMessages, 3000);
    
    return () => clearInterval(interval);
  }, [roomId]);

  // When audio is recorded, process it
  useEffect(() => {
    if (audioBlob) {
      processAudio(audioBlob);
    }
  }, [audioBlob]);

  const processAudio = async (blob) => {
    setIsProcessing(true);
    
    try {
      console.log('Processing audio, size:', blob.size);
      
      // Step 1: Upload audio to S3
      console.log('Uploading to S3...');
      const fileName = await uploadAudioToS3(blob, mimeType);
      console.log('Uploaded:', fileName);
      
      // Step 2: Translate the uploaded audio
      console.log('Translating...');
      const result = await translateAudio(
        API_CONFIG.BUCKET,
        fileName,
        userLanguage
      );
      
      console.log('Translation result:', result);
      
      // Step 3: Save message to room
      const newMessage = {
        speaker: userName,
        speakerLanguage: userLanguage,
        original: result.original_text,
        translations: result.translations,
        audioUrls: result.audio_urls || {}
      };
      
      console.log('Attempting to save message:', newMessage);
      await saveMessage(roomId, newMessage);
      console.log('Message save completed');

// Messages will update automatically via polling      
      // Messages will update automatically via polling
      
    } catch (error) {
      console.error('Error processing audio:', error);
      alert('Translation failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearChat = async () => {
    if (window.confirm('Clear all messages in this room?')) {
      try {
        // Delete messages from S3 by overwriting with empty array
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

  const handleRecordingToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="conversation-room">
      <header className="room-header">
        <div>
          <h2>Room: {roomId}</h2>
          {/* ✅ ADD PARTICIPANT LIST */}
          <div className="participants-list">
            👥 {participants.length} {participants.length === 1 ? 'person' : 'people'}: 
            {participants
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p, idx) => (
              <span key={idx} className="participant-badge">
                {p.isRecording && '🔴 '}  {/* ✅ ADD THIS LINE */}
                {p.name} ({p.language?.toUpperCase()})
              </span>
            ))}
          </div>

          {/* ✅ ADD THIS BLOCK - Show who's recording below participant list */}
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
          .filter(msg => msg.speaker && msg.original && msg.translations)  // Filter out null messages
          .map((msg, idx) => (
          <div key={idx} className="message">
            <div className="message-header">
              <div className="speaker-info">
                {/* ✅ ADD AVATAR */}
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
                .filter(([lang]) => lang === userLanguage)  // ✅ Only show user's language
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