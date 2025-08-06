import React, { useState, useCallback } from 'react';
import type { Recording } from '@ax/core';

interface RecordingLoaderProps {
  onRecordingLoaded: (recording: Recording) => void;
  onError: (error: string) => void;
}

export function RecordingLoader({ onRecordingLoaded, onError }: RecordingLoaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateRecording = (data: any): data is Recording => {
    return (
      data &&
      typeof data === 'object' &&
      data.metadata &&
      data.initialSnapshot &&
      data.timeline &&
      Array.isArray(data.timeline) &&
      typeof data.metadata.startTime === 'number' &&
      typeof data.metadata.endTime === 'number'
    );
  };

  const loadRecordingFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!validateRecording(data)) {
        throw new Error('Invalid recording file format');
      }
      
      console.log('Loaded recording:', {
        duration: data.metadata.endTime - data.metadata.startTime,
        timelineEntries: data.timeline.length,
        url: data.metadata.url,
        title: data.metadata.title
      });
      
      onRecordingLoaded(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load recording file';
      console.error('Error loading recording:', error);
      onError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [onRecordingLoaded, onError]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadRecordingFromFile(file);
    }
  }, [loadRecordingFromFile]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    const jsonFile = files.find(file => 
      file.name.endsWith('.json') || 
      file.name.includes('axtree') ||
      file.type === 'application/json'
    );
    
    if (jsonFile) {
      loadRecordingFromFile(jsonFile);
    } else {
      onError('Please drop a valid JSON recording file');
    }
  }, [loadRecordingFromFile, onError]);

  return (
    <div className="recording-loader">
      <div className="loader-header">
        <h3>Load AXTree Recording</h3>
        <p>Load a previously recorded timeline session to analyze accessibility tree changes</p>
      </div>
      
      <div 
        className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Loading recording...</p>
          </div>
        ) : (
          <div className="drop-content">
            <div className="drop-icon">📁</div>
            <p>Drop your AXTree recording file here</p>
            <p className="drop-hint">or</p>
            <label htmlFor="file-input" className="file-input-label">
              Choose File
            </label>
            <input
              id="file-input"
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <p className="supported-formats">
              Supported: .json files created by `axtree record`
            </p>
          </div>
        )}
      </div>
      
      <div className="loader-instructions">
        <h4>How to create recordings:</h4>
        <div className="instruction-steps">
          <div className="step">
            <span className="step-number">1</span>
            <span>Open Chrome with debugging port: <code>chrome --remote-debugging-port=9222</code></span>
          </div>
          <div className="step">
            <span className="step-number">2</span>
            <span>Navigate to your application in the browser</span>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <span>Run: <code>axtree record --port 9222 --output my-recording.json</code></span>
          </div>
          <div className="step">
            <span className="step-number">4</span>
            <span>Interact with your application, then press Ctrl+C to stop</span>
          </div>
        </div>
      </div>
    </div>
  );
}