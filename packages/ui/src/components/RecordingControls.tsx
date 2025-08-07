import { useState, useEffect } from 'react';

interface RecordingControlsProps {
  isRecording: boolean;
  startTime?: number;
  timelineLength: number;
  duration?: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function RecordingControls({
  isRecording,
  startTime,
  timelineLength,
  duration,
  onStartRecording,
  onStopRecording
}: RecordingControlsProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every second when recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getDisplayDuration = (): string => {
    if (duration !== undefined) {
      return formatDuration(duration);
    }
    if (startTime) {
      return formatDuration(currentTime - startTime);
    }
    return '00:00';
  };

  return (
    <div className="recording-controls">
      {isRecording ? (
        <div className="recording-active">
          <button
            className="recording-button recording"
            onClick={onStopRecording}
            title="Stop recording"
          >
            <span className="recording-icon">⏹️</span>
            <span className="recording-text">
              Recording {getDisplayDuration()}
            </span>
          </button>
          {timelineLength > 0 && (
            <span className="timeline-info">
              {timelineLength} changes
            </span>
          )}
        </div>
      ) : (
        <button
          className="recording-button idle"
          onClick={onStartRecording}
          title="Start recording"
        >
          <span className="recording-icon">⏺️</span>
          <span className="recording-text">Start Recording</span>
        </button>
      )}
    </div>
  );
}
