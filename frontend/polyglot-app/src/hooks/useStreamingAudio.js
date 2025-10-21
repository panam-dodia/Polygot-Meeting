import { useState, useRef, useCallback } from 'react';

export const useStreamingAudio = (onChunkReady) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const processFinalChunk = useRef(true); // ✅ ADD THIS

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const audioStream = new MediaStream();
      const audioTrack = stream.getAudioTracks()[0];
      
      if (!audioTrack) {
        throw new Error('No audio track available. Make sure to check "Share audio"');
      }
      
      audioStream.addTrack(audioTrack);
      stream.getVideoTracks().forEach(track => track.stop());
      
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;

      // ✅ Request data every 15 seconds
      mediaRecorder.start(15000);
      
      console.log('🎙️ MediaRecorder started with state:', mediaRecorder.state);
      console.log('🎙️ MIME type:', mimeType);

      // ✅ FIX: Process chunks even when stopping
      mediaRecorder.ondataavailable = (event) => {
        console.log('🔔 ondataavailable fired! Size:', event.data.size);
        
        if (event.data.size > 0) {
          console.log('📦 Audio chunk captured:', event.data.size, 'bytes');
          
          // ✅ Process if recording OR if this is the final chunk
          if (isRecordingRef.current || processFinalChunk.current) {
            onChunkReady(event.data, mimeType);
            processFinalChunk.current = false; // Only process one final chunk
          } else {
            console.warn('⚠️ Chunk received after stop, discarding');
          }
        } else {
          console.warn('⚠️ ondataavailable fired but chunk size is 0');
        }
      };

      mediaRecorder.onstop = () => {
        console.log('🛑 MediaRecorder stopped. State:', mediaRecorder.state);
        // ondataavailable will fire after this
      };

      mediaRecorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
      };

      setIsRecording(true);
      isRecordingRef.current = true;
      processFinalChunk.current = true; // ✅ Reset flag
      
      console.log('🎙️ Started system audio capture (15-second chunks via timeslice)');
      console.log('📢 IMPORTANT: Make sure you checked "Share audio"!');

    } catch (error) {
      console.error('Error starting audio capture:', error);
      
      if (error.name === 'NotAllowedError') {
        alert('Screen sharing denied. Please allow and try again.');
        return;
      } else if (error.name === 'NotSupportedError') {
        alert('Browser does not support system audio capture. Use Chrome/Edge.');
        return;
      }
      
      alert('Could not access audio: ' + error.message);
    }
  }, [onChunkReady]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('⏹️ Stopping recording. Current state:', mediaRecorderRef.current.state);
      
      // ✅ Set flags AFTER stop (so final chunk gets processed)
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop(); // This will trigger ondataavailable
      }
      
      // ✅ Update state but allow final chunk to process
      setIsRecording(false);
      isRecordingRef.current = false;
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped track:', track.kind);
        });
      }
      
      console.log('⏹️ Stopped audio capture');
    }
  }, [isRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
};