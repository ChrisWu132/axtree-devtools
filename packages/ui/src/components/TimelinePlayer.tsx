import { useState, useCallback, useEffect } from 'react';
import type { Recording, TimelineEntry, AXNodeTree } from '@ax/core';
import * as jsondiffpatch from 'jsondiffpatch';

interface TimelinePlayerProps {
  recording: Recording;
  onTreeChange: (tree: AXNodeTree) => void;
  onTimelineEntryChange: (entry: TimelineEntry | null, index: number) => void;
}

export function TimelinePlayer({ recording, onTreeChange, onTimelineEntryChange }: TimelinePlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  // We track the current tree state internally but don't store it as state since we recalculate it

  const totalEntries = recording.timeline.length;
  const duration = recording.metadata.endTime - recording.metadata.startTime;

  // Calculate tree state at a specific timeline index
  const calculateTreeAtIndex = useCallback((targetIndex: number): AXNodeTree => {
    let tree = JSON.parse(JSON.stringify(recording.initialSnapshot.tree));
    
    // Apply all deltas up to the target index
    for (let i = 0; i <= targetIndex && i < recording.timeline.length; i++) {
      const entry = recording.timeline[i];
      if (entry.delta && Object.keys(entry.delta).length > 0) {
        try {
          jsondiffpatch.patch(tree, entry.delta);
        } catch (error) {
          console.error(`Error applying delta at index ${i}:`, error);
        }
      }
    }
    
    return tree;
  }, [recording]);

  // Navigate to a specific timeline index
  const goToIndex = useCallback((index: number) => {
    const clampedIndex = Math.max(-1, Math.min(totalEntries - 1, index));
    setCurrentIndex(clampedIndex);
    
    const tree = clampedIndex >= 0 ? calculateTreeAtIndex(clampedIndex) : recording.initialSnapshot.tree;
    onTreeChange(tree);
    
    const entry = clampedIndex >= 0 ? recording.timeline[clampedIndex] : null;
    onTimelineEntryChange(entry, clampedIndex);
  }, [totalEntries, calculateTreeAtIndex, recording, onTreeChange, onTimelineEntryChange]);

  // Playback controls
  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    goToIndex(-1); // Go to initial state
  }, [goToIndex]);

  const stepForward = useCallback(() => {
    goToIndex(currentIndex + 1);
  }, [currentIndex, goToIndex]);

  const stepBackward = useCallback(() => {
    goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex]);

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying || currentIndex >= totalEntries - 1) {
      setIsPlaying(false);
      return;
    }

    const currentEntry = recording.timeline[currentIndex];
    const nextEntry = recording.timeline[currentIndex + 1];
    
    if (!nextEntry) {
      setIsPlaying(false);
      return;
    }

    // Calculate delay based on real timing and playback speed
    const realDelay = nextEntry.timestamp - (currentEntry?.timestamp || recording.metadata.startTime);
    const adjustedDelay = Math.max(50, realDelay / playbackSpeed); // Minimum 50ms delay

    const timer = setTimeout(() => {
      stepForward();
    }, adjustedDelay);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, totalEntries, recording, playbackSpeed, stepForward]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: number) => {
    const relativeTime = timestamp - recording.metadata.startTime;
    return `${(relativeTime / 1000).toFixed(2)}s`;
  };

  // Format duration
  const formatDuration = (ms: number) => {
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const currentEntry = currentIndex >= 0 ? recording.timeline[currentIndex] : null;
  const progress = totalEntries > 0 ? ((currentIndex + 1) / totalEntries) * 100 : 0;

  return (
    <div className="timeline-player">
      <div className="timeline-header">
        <h3>Timeline Playback</h3>
        <div className="timeline-info">
          <span>Duration: {formatDuration(duration)}</span>
          <span>Entries: {totalEntries}</span>
          <span>Current: {currentIndex + 1}/{totalEntries}</span>
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="timeline-scrubber">
        <input
          type="range"
          min="-1"
          max={totalEntries - 1}
          value={currentIndex}
          onChange={(e) => goToIndex(parseInt(e.target.value))}
          className="timeline-slider"
        />
        <div 
          className="timeline-progress" 
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Playback controls */}
      <div className="timeline-controls">
        <button onClick={reset} title="Reset to start">
          ⏮️
        </button>
        <button onClick={stepBackward} disabled={currentIndex <= -1} title="Step backward">
          ⏪
        </button>
        <button onClick={isPlaying ? pause : play} disabled={currentIndex >= totalEntries - 1} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <button onClick={stepForward} disabled={currentIndex >= totalEntries - 1} title="Step forward">
          ⏩
        </button>
        
        <div className="playback-speed">
          <label>Speed:</label>
          <select 
            value={playbackSpeed} 
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>

      {/* Current entry details */}
      {currentEntry && (
        <div className="timeline-entry-details">
          <div className="entry-timestamp">
            Time: {formatTimestamp(currentEntry.timestamp)}
          </div>
          {currentEntry.event && (
            <div className="entry-event">
              <strong>Event:</strong> {currentEntry.event.type}
              {currentEntry.event.details && (
                <pre>{JSON.stringify(currentEntry.event.details, null, 2)}</pre>
              )}
            </div>
          )}
          <div className="entry-delta">
            <strong>Changes:</strong> {Object.keys(currentEntry.delta || {}).length} delta keys
            {Array.isArray(currentEntry.changedNodeIds) && currentEntry.changedNodeIds.length > 0 && (
              <div><strong>Nodes:</strong> {currentEntry.changedNodeIds.slice(0, 10).join(', ')}{currentEntry.changedNodeIds.length > 10 ? '…' : ''}</div>
            )}
          </div>
        </div>
      )}

      {currentIndex === -1 && (
        <div className="timeline-entry-details">
          <div className="entry-timestamp">Initial State</div>
          <div>Showing the accessibility tree at recording start</div>
        </div>
      )}
    </div>
  );
}