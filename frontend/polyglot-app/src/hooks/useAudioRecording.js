import { useState, useRef } from 'react';

export const useAudioRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [mimeType, setMimeType] = useState('audio/webm'); // Track the actual format used
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const getSupportedMimeType = () => {
    // Try formats in order of Transcribe compatibility
    const types = [
      'audio/mp4',           // Best for Transcribe
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type);
        return type;
      }
    }
    
    // Fallback
    console.warn('No preferred MIME type supported, using default');
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000  // Transcribe works well with 16kHz
        }
      });
      
      const supportedMimeType = getSupportedMimeType();
      setMimeType(supportedMimeType);
      
      const options = supportedMimeType ? { mimeType: supportedMimeType } : {};
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: supportedMimeType });
        setAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Please allow microphone access');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return {
    isRecording,
    audioBlob,
    mimeType,  // Export this so we can use it in upload
    startRecording,
    stopRecording
  };
};