import { useState, useEffect, useRef } from 'react';

const useRealtimeTranscription = (userName, roomId, speakLanguage, hearLanguage, joined, setParticipants) => {
  const [isConnected, setIsConnected] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState('youtube');
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const keepaliveIntervalRef = useRef(null);

  useEffect(() => {
    if (!joined) return;

    const ws = new WebSocket('ws://3.92.200.208:8080');
    
    ws.onopen = () => {
      console.log('✅ Connected to AWS ECS streaming service');
      setIsConnected(true);
      
      const initMessage = {
        sessionId: `session-${Date.now()}`,
        roomId: roomId,
        userName: userName,
        userLanguage: hearLanguage,      // ✅ What THIS user speaks
        targetLanguage: speakLanguage    // ✅ What THIS user wants to hear (from others)
      };
      
      console.log('📤 Sending init message:', initMessage);
      ws.send(JSON.stringify(initMessage));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'transcript') {
        setTranscripts(prev => [{
          speaker: data.speaker,
          speakerLanguage: data.speakerLanguage,
          original: data.original,
          sourceLanguage: data.sourceLanguage,
          translation: data.translation,
          audioUrl: data.audioUrl
        }, ...prev]);
      }
      
      // ✅ NEW: Handle participant updates
      if (data.type === 'participants') {
        console.log('👥 Participants updated:', data.participants);
        setParticipants(data.participants);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('🔌 Disconnected');
      setIsConnected(false);
      setParticipants([]);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [joined, userName, roomId, speakLanguage, hearLanguage, setParticipants]);

  const generateSilence = (audioContext, duration = 0.1) => {
    const sampleRate = audioContext.sampleRate;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(numSamples * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(i * 2, 0, true);
    }
    
    return buffer;
  };

  const startCapture = async (mode = 'youtube') => {
    setCaptureMode(mode);
    
    try {
      let stream;
      
      if (mode === 'youtube') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 16000
          },
          video: true
        });
        console.log('🎬 YouTube Mode: Screen capture started');
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          },
          video: false
        });
        console.log('🎤 Microphone Mode: Mic capture started');
      }

      streamRef.current = stream;
      setIsCapturing(true);

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;

      console.log(`🎤 AudioContext sample rate: ${audioContext.sampleRate}Hz`);

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(8192, 1, 1);
      
      let lastAudioTime = Date.now();
      const SILENCE_THRESHOLD = 0.01;
      let isSpeaking = false;

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log(`🎙️ Audio capture started at 16kHz (${mode} mode)`);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // ✅ DEBUG: Check if audio has signal
        const hasSound = inputData.some(sample => Math.abs(sample) > 0.01);
        if (hasSound) {
          console.log('🎤 Audio detected!');
        }
        
        const pcm16 = convertToPCM16(inputData);
        const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16)));
        
        console.log('📤 Sending', pcm16.byteLength, 'bytes');  // ✅ DEBUG
        wsRef.current.send(base64);
      };

      keepaliveIntervalRef.current = setInterval(() => {
      }, 5000);

      stream.getTracks()[0].onended = () => {
        stopCapture();
      };

    } catch (error) {
      console.error('❌ Error accessing media:', error);
      alert(`Failed to access ${mode === 'youtube' ? 'screen' : 'microphone'}. Please grant permissions.`);
    }
  };

  const stopCapture = () => {
    console.log('⏹️ Stopped');
    
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsCapturing(false);
  };

  const convertToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  };

  return {
    isConnected,
    transcripts,
    startCapture,
    stopCapture,
    isCapturing,
    captureMode
  };
};

export default useRealtimeTranscription;