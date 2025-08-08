import { useState, useEffect, useRef } from 'react';
import type { AXNodeTree, Recording } from '@ax/core';

type SnapshotMessage = {
  type: 'snapshot';
  payload: { tree: AXNodeTree; changedNodeIds?: number[] } | AXNodeTree;
};

type UserEventMessage = {
  type: 'userEvent';
  payload: any; // CDP Input event or DOM event
};

type DeltaMessage = {
  type: 'delta';
  payload: any; // JsonDiffPatch delta
};

type ConnectedMessage = {
  type: 'connected';
  payload: any;
};

type RecordingStatusMessage = {
  type: 'recordingStatus';
  payload: {
    isRecording: boolean;
    startTime?: number;
    timelineLength: number;
    duration?: number;
  };
};

type RecordingStoppedMessage = {
  type: 'recordingStopped';
  payload: Recording;
};

type WebSocketMessage = SnapshotMessage | UserEventMessage | DeltaMessage | ConnectedMessage | RecordingStatusMessage | RecordingStoppedMessage;

interface UseAxTreeSocketOptions {
  url?: string;
  autoConnect?: boolean;
}

export function useAxTreeSocket(options: UseAxTreeSocketOptions = {}) {
  const { url, autoConnect = true } = options;
  
  const [tree, setTree] = useState<AXNodeTree | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Recording state
  const [recordingStatus, setRecordingStatus] = useState<{
    isRecording: boolean;
    startTime?: number;
    timelineLength: number;
    duration?: number;
  }>({
    isRecording: false,
    timelineLength: 0
  });
  const [lastRecording, setLastRecording] = useState<Recording | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  const connect = () => {
    try {
      // Get bridge port from URL query params, default to 5174
      const urlParams = new URLSearchParams(window.location.search);
      const bridgePort = urlParams.get('bridgePort') || '5174';
      const finalUrl = url || `ws://localhost:${bridgePort}/ax-tree`;
      
      const ws = new WebSocket(finalUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        console.log(`WebSocket connected to AXTree bridge at ${finalUrl}`);
      };
      
      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'snapshot':
              if ((message.payload as any)?.tree) {
                const { tree, changedNodeIds } = message.payload as any;
                (window as any).__AX_CHANGED__ = changedNodeIds || [];
                setTree(tree);
              } else {
                setTree(message.payload as any);
              }
              console.log('Full tree snapshot received');
              break;
            case 'delta':
              console.log('Delta update received:', message.payload);
              setTree(currentTree => {
                if (!currentTree) {
                  // If no current tree, treat delta as snapshot
                  return message.payload.fullTree || null;
                }
                
                // For now, use the fullTree from delta payload
                // In a more sophisticated implementation, we would apply the actual delta
                return message.payload.fullTree || currentTree;
              });
              break;
            case 'userEvent':
              console.log('User event received:', message.payload);
              break;
            case 'connected':
              console.log('Bridge connected:', message.payload);
              break;
            case 'recordingStatus':
              setRecordingStatus(message.payload);
              console.log('Recording status updated:', message.payload);
              break;
            case 'recordingStopped':
              setLastRecording(message.payload);
              console.log('Recording stopped, data received:', message.payload);
              break;
            default:
              console.warn('Unknown message type:', message);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        
        // Auto-reconnect after 3 seconds
        if (autoConnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };
      
      ws.onerror = (event) => {
        setError('WebSocket connection failed');
        console.error('WebSocket error:', event);
      };
      
    } catch (err) {
      setError(`Failed to connect: ${err}`);
    }
  };
  
  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  };
  
  const sendHighlight = (backendNodeId: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'highlight',
        payload: { backendNodeId }
      }));
    }
  };

  const startRecording = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'startRecording'
      }));
    }
  };

  const stopRecording = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stopRecording'
      }));
    }
  };
  
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [url, autoConnect]);
  
  return {
    tree,
    isConnected,
    error,
    recordingStatus,
    lastRecording,
    connect,
    disconnect,
    sendHighlight,
    startRecording,
    stopRecording
  };
}