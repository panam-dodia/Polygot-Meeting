import React, { useState, useRef } from 'react';
import './App.css';
import useRealtimeTranscription from './hooks/useRealtimeTranscription';

function App() {
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [speakLanguage, setSpeakLanguage] = useState('en'); // ✅ Changed from sourceLanguage
  const [hearLanguage, setHearLanguage] = useState('en');   // ✅ Changed from selectedLanguage
  const [selectedMode, setSelectedMode] = useState('youtube');
  const [participants, setParticipants] = useState([]); // ✅ NEW
  
  const currentAudioRef = useRef(null);

  const {
    isConnected,
    transcripts,
    startCapture,
    stopCapture,
    isCapturing,
    captureMode,
    onParticipantsUpdate // ✅ NEW
  } = useRealtimeTranscription(userName, roomId, speakLanguage, hearLanguage, joined, setParticipants);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (userName && roomId && speakLanguage && hearLanguage) {
      setJoined(true);
    }
  };

  const handleLeaveRoom = () => {
    stopCapture();
    setJoined(false);
    setParticipants([]);
  };

  const handleAudioPlay = (audioElement) => {
    if (currentAudioRef.current && currentAudioRef.current !== audioElement) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
    currentAudioRef.current = audioElement;
  };

  const languageNames = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'hi': 'Hindi'
  };

  // ✅ NEW: Sort participants - current user first, then alphabetically
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.userName === userName) return -1;
    if (b.userName === userName) return 1;
    return a.userName.localeCompare(b.userName);
  });

  if (!joined) {
    return (
      <div className="App">
        <div className="join-container">
          <h1>🌍 Polyglot</h1>
          <p className="subtitle">Real-Time Translation</p>
          
          <form onSubmit={handleJoinRoom} className="join-form">
            <div className="form-group">
              <label>👤 Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>🗣️ Your language (speak & hear)</label>
                <select 
                  value={hearLanguage} 
                  onChange={(e) => {
                    setHearLanguage(e.target.value);
                    setSpeakLanguage(e.target.value);
                  }}
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="es">🇪🇸 Spanish</option>
                  <option value="fr">🇫🇷 French</option>
                  <option value="hi">🇮🇳 Hindi</option>
                </select>
              </div>

              <div className="form-group">
                <label>🌐 Others speak (translate from)</label>
                <select 
                  value={speakLanguage} 
                  onChange={(e) => setSpeakLanguage(e.target.value)}
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="es">🇪🇸 Spanish</option>
                  <option value="fr">🇫🇷 French</option>
                  <option value="hi">🇮🇳 Hindi</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>🚪 Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                required
              />
            </div>

            <button type="submit" className="primary-button">
              Join Conversation
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="header-bar">
        <div className="header-left">
          <h2>🌍 Polyglot</h2>
          <span className="room-info">Room: {roomId}</span>
        </div>
        <div className="header-right">
          <span className="user-info">👤 {userName}</span>
          <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          <button onClick={handleLeaveRoom} className="leave-button">
            Leave Room
          </button>
        </div>
      </div>

      <div className="main-content">
        {/* ✅ Participants Panel - Make sure this is here */}
        <div className="participants-panel">
          <h3>👥 Participants ({participants.length})</h3>
          <div className="participants-list">
            {sortedParticipants.length === 0 ? (
              <p style={{color: '#999', textAlign: 'center'}}>No participants yet</p>
            ) : (
              sortedParticipants.map((participant, index) => (
                <div 
                  key={index} 
                  className={`participant-card ${participant.userName === userName ? 'current-user' : ''}`}
                >
                  <div className="participant-name">
                    {participant.userName === userName && '👤 '}
                    {participant.userName}
                  </div>
                  <div className="participant-languages">
                    <span className="hear-lang">🗣️ {languageNames[participant.hearLanguage]}</span>
                    <span className="speak-lang">← 🌐 {languageNames[participant.speakLanguage]}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="controls-section">
          <div className="language-display">
            <div className="lang-badge target">
              Your language: {languageNames[hearLanguage]}
            </div>
            <span className="arrow">←</span>
            <div className="lang-badge source">
              Translating from: {languageNames[speakLanguage]}
            </div>
          </div>

          {!isCapturing && (
            <div className="mode-selector">
              <label className="mode-label">📍 Select Mode:</label>
              <div className="mode-buttons">
                <button 
                  className={`mode-button ${selectedMode === 'youtube' ? 'active' : ''}`}
                  onClick={() => setSelectedMode('youtube')}
                >
                  🎬 YouTube Mode
                </button>
                <button 
                  className={`mode-button ${selectedMode === 'microphone' ? 'active' : ''}`}
                  onClick={() => setSelectedMode('microphone')}
                >
                  🎤 Conversation Mode
                </button>
              </div>
            </div>
          )}

          {!isCapturing ? (
            <button onClick={() => startCapture(selectedMode)} className="primary-button">
              {selectedMode === 'youtube' ? '🎬 Start YouTube Translation' : '🎤 Start Conversation'}
            </button>
          ) : (
            <div className="capturing-state">
              <div className="mode-indicator">
                {captureMode === 'youtube' ? '🎬 YouTube Mode Active' : '🎤 Microphone Active'}
              </div>
              <button onClick={stopCapture} className="stop-button">
                ⏹️ Stop Translation
              </button>
            </div>
          )}

          <div className="instructions-box">
            <details>
              <summary>ℹ️ How to use</summary>
              {selectedMode === 'youtube' ? (
                <ol>
                  <li>Open YouTube in another tab</li>
                  <li>Click "Start YouTube Translation"</li>
                  <li>Select the YouTube tab</li>
                  <li>✅ Check "Share audio"</li>
                  <li>Click "Share"</li>
                </ol>
              ) : (
                <ol>
                  <li>Click "Start Conversation"</li>
                  <li>Allow microphone access</li>
                  <li>Start speaking in your language</li>
                  <li>Others will hear the translation</li>
                </ol>
              )}
            </details>
          </div>
        </div>

        <div className="transcripts-section">
          <h3>📜 Live Transcripts ({transcripts.length})</h3>
          
          {transcripts.length === 0 && (
            <div className="empty-state">
              <p>No transcripts yet. Start capturing audio to see translations!</p>
            </div>
          )}

          <div className="transcripts-list">
            {transcripts.map((transcript, index) => (
              <div key={index} className="transcript-card">
                <div className="transcript-header">
                  <span className="transcript-number">#{transcripts.length - index}</span>
                  <span className="transcript-speaker">
                    🗣️ {transcript.speaker || 'Unknown'}
                  </span>
                  <span className="transcript-lang">
                    {languageNames[transcript.speakerLanguage] || 'Unknown'}
                  </span>
                </div>

                <div className="transcript-body">
                  <div className="original-section">
                    <label>Original:</label>
                    <p className="original-text">{transcript.original}</p>
                  </div>

                  <div className="translation-section">
                    <label>Translation ({languageNames[hearLanguage]}):</label>
                    <p className="translation-text">
                      {transcript.translation || 'Translating...'}
                    </p>
                  </div>

                  {transcript.audioUrl && (
                    <div className="audio-section">
                      <audio 
                        src={transcript.audioUrl}
                        autoPlay={index === 0}
                        controls
                        onPlay={(e) => handleAudioPlay(e.target)}
                        onLoadedData={(e) => {
                          if (index === 0) {
                            e.target.play().catch(err => console.log('Auto-play blocked:', err));
                          }
                        }}
                      />
                      <p className="audio-label">🔊 Audio ready</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;