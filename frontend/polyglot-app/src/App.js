import { API_CONFIG } from './config';
import React, { useState, useEffect } from 'react';
import './App.css';
import { useAudioRecording } from './hooks/useAudioRecording';
import { translateAudio, uploadAudioToS3, saveMessage, getRoomMessages } from './api';

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

function ConversationRoom({ roomId, userName, userLanguage }) {
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isRecording, audioBlob, mimeType, startRecording, stopRecording } = useAudioRecording();

  // Poll for new messages every 3 seconds
  useEffect(() => {
    const fetchMessages = async () => {
      console.log('Fetching messages for room:', roomId);
      const roomMessages = await getRoomMessages(roomId);
      console.log('Received messages:', roomMessages);
      setMessages(roomMessages);
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
        <h2>Room: {roomId}</h2>
        <div className="user-info">
          {userName} ({userLanguage.toUpperCase()})
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
              {Object.entries(msg.translations).map(([lang, text]) => (
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
    </div>
  );
}

export default App;