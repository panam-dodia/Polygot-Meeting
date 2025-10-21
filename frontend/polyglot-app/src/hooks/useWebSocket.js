import { useEffect, useRef, useState, useCallback } from 'react';
import { API_CONFIG } from '../config';

export const useWebSocket = (roomId, onMessage) => {
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeout = useRef(null);
  const onMessageRef = useRef(onMessage);
  const isConnecting = useRef(false);  // ✅ ADD THIS

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!roomId) return;

    let isCleaningUp = false;

    const connect = () => {
      if (isCleaningUp || isConnecting.current) return;  // ✅ PREVENT DOUBLE CONNECT
      
      isConnecting.current = true;  // ✅ MARK AS CONNECTING
      console.log('🔌 Connecting to WebSocket...');
      
      // Close existing connection if any
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }
      
      ws.current = new WebSocket(API_CONFIG.WEBSOCKET_URL);

      ws.current.onopen = () => {
        if (isCleaningUp) return;
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        isConnecting.current = false;  // ✅ DONE CONNECTING
      };

      ws.current.onmessage = (event) => {
        console.log('📨 WebSocket message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        isConnecting.current = false;  // ✅ RESET ON ERROR
      };

      ws.current.onclose = (event) => {
        if (isCleaningUp) return;
        console.log('🔌 WebSocket disconnected. Code:', event.code);
        setIsConnected(false);
        isConnecting.current = false;  // ✅ RESET ON CLOSE
        
        // Only auto-reconnect if not a normal closure
        if (event.code !== 1000 && event.code !== 1005) {
          reconnectTimeout.current = setTimeout(() => {
            if (!isCleaningUp) {
              console.log('🔄 Reconnecting...');
              connect();
            }
          }, 5000);
        }
      };
    };

    connect();

    return () => {
      isCleaningUp = true;
      isConnecting.current = false;  // ✅ RESET FLAG
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');  // ✅ CLEAN CLOSE
      }
    };
  }, [roomId]);

  const sendMessage = useCallback((message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // If message already has an action, send it directly
      if (message.action) {
        ws.current.send(JSON.stringify(message));
      } else {
        // Default to sendMessage wrapper
        ws.current.send(JSON.stringify({
          action: 'sendMessage',
          roomId: roomId,
          message: message
        }));
      }
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, [roomId]);

  return { isConnected, sendMessage };
};