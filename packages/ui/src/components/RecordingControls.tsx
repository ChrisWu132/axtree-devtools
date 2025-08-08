import { useMemo } from 'react';

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
  timelineLength,
  duration,
  onStartRecording,
  onStopRecording
}: RecordingControlsProps) {
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const displayDuration = useMemo(() => {
    if (typeof duration === 'number') return formatDuration(duration);
    // Fallback when duration not provided
    return '00:00';
  }, [duration]);

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
              Recording {displayDuration}
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
