import React, { useEffect, useRef } from 'react';

export const CompanionMode = ({ 
  messages, 
  userLanguage, 
  isRecording, 
  onToggleRecording,
  participants 
}) => {
  const audioRef = useRef(null);
  const lastMessageRef = useRef(null);

  // Auto-play translated audio when new message arrives
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      
      // Only play if it's a new message
      if (lastMessageRef.current !== latestMessage.timestamp) {
        lastMessageRef.current = latestMessage.timestamp;
        
        // Get audio URL for user's language
        const audioUrl = latestMessage.audioUrls?.[userLanguage];
        
        if (audioUrl && audioRef.current) {
          console.log('🔊 Playing translated audio:', audioUrl);
          audioRef.current.src = audioUrl;
          audioRef.current.play().catch(err => {
            console.error('Error playing audio:', err);
          });
        }
      }
    }
  }, [messages, userLanguage]);

  const currentSpeaker = participants.find(p => p.isRecording);
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      padding: '2rem',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        right: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>🌍 Polyglot Companion</h1>
          <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9 }}>
            Listening to your meeting · Translating to {userLanguage.toUpperCase()}
          </p>
        </div>
        
        {/* Recording Status */}
        <div style={{
          background: isRecording ? 'rgba(239, 68, 68, 0.9)' : 'rgba(107, 114, 128, 0.9)',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '1.1rem',
          fontWeight: 'bold'
        }}>
          {isRecording ? (
            <>
              <div style={{
                width: '12px',
                height: '12px',
                background: 'white',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite'
              }} />
              LISTENING
            </>
          ) : (
            <>⏸️ PAUSED</>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '800px',
        width: '100%'
      }}>
        {/* Current Speaker Indicator */}
        {currentSpeaker && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            padding: '2rem',
            borderRadius: '20px',
            marginBottom: '2rem',
            textAlign: 'center',
            border: '2px solid rgba(255, 255, 255, 0.3)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎤</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {currentSpeaker.name} is speaking
            </div>
            <div style={{ fontSize: '1rem', opacity: 0.8, marginTop: '0.5rem' }}>
              Original language: {currentSpeaker.language?.toUpperCase()}
            </div>
          </div>
        )}

        {/* Latest Translation Display */}
        {latestMessage && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#1f2937',
            padding: '2.5rem',
            borderRadius: '20px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            animation: 'slideIn 0.5s ease-out'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#667eea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '1.5rem',
                fontWeight: 'bold'
              }}>
                {latestMessage.speaker?.charAt(0) || '?'}
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                  {latestMessage.speaker}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  {latestMessage.speakerLanguage?.toUpperCase()} → {userLanguage.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Original Text */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: '#f3f4f6',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                ORIGINAL:
              </div>
              <div style={{ fontSize: '1.1rem' }}>
                "{latestMessage.original}"
              </div>
            </div>

            {/* Translated Text */}
            <div style={{
              padding: '1.5rem',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              color: 'white'
            }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.9, marginBottom: '0.5rem' }}>
                TRANSLATION:
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: '1.6' }}>
                "{latestMessage.translations[userLanguage]}"
              </div>
            </div>

            {/* Audio is playing indicator */}
            <div style={{
              marginTop: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#6b7280',
              fontSize: '0.9rem'
            }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                background: '#10b981',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }} />
              Audio playing...
            </div>
          </div>
        )}

        {/* No messages state */}
        {!latestMessage && (
          <div style={{
            textAlign: 'center',
            opacity: 0.7
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎧</div>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              Waiting for audio...
            </div>
            <div style={{ fontSize: '1rem' }}>
              Start recording to begin translation
            </div>
          </div>
        )}
      </div>

      {/* Control Button */}
      <button
        onClick={onToggleRecording}
        style={{
          position: 'absolute',
          bottom: '2rem',
          padding: '1.5rem 3rem',
          fontSize: '1.3rem',
          fontWeight: 'bold',
          background: isRecording ? '#ef4444' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '60px',
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          ':hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 15px 40px rgba(0, 0, 0, 0.4)'
          }
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'translateY(-2px)';
          e.target.style.boxShadow = '0 15px 40px rgba(0, 0, 0, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'translateY(0)';
          e.target.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
        }}
      >
        {isRecording ? '⏹️ STOP LISTENING' : '🎙️ START LISTENING'}
      </button>

      {/* Hidden audio player */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};