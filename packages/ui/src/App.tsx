import { useState, useEffect } from 'react';
import { TreeView } from './components/TreeView';
import { NodeDetails } from './components/NodeDetails';
import { SearchBox } from './components/SearchBox';
import { SearchResults } from './components/SearchResults';
import { TimelinePlayer } from './components/TimelinePlayer';
import { RecordingLoader } from './components/RecordingLoader';
import { RecordingControls } from './components/RecordingControls';
import { useAxTreeSocket } from './hooks/useAxTreeSocket';
import type { Recording, TimelineEntry, AXNodeTree } from '@ax/core';
import './App.css';

type AppMode = 'live' | 'timeline';

function App() {
  const { 
    tree, 
    isConnected, 
    error, 
    recordingStatus, 
    lastRecording, 
    sendHighlight, 
    startRecording, 
    stopRecording 
  } = useAxTreeSocket();
  
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Timeline mode state
  const [appMode, setAppMode] = useState<AppMode>('live');
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [timelineTree, setTimelineTree] = useState<AXNodeTree | null>(null);
  const [currentTimelineEntry, setCurrentTimelineEntry] = useState<TimelineEntry | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const handleNodeSelect = (node: any) => {
    setSelectedNode(node);
    console.log('Selected node:', node);
  };

  const handleNodeHighlight = (backendNodeId: number) => {
    sendHighlight(backendNodeId);
    console.log('Highlighting node:', backendNodeId);
  };

  const handleSearchResults = (results: any[]) => {
    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const handleClearSearch = () => {
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleSearchResultClick = (node: any) => {
    // Convert search result node to tree view format
    const treeNode = {
      data: node
    };
    setSelectedNode(treeNode);
    handleNodeHighlight(node.backendNodeId);
  };

  // Timeline mode handlers
  const handleModeSwitch = (mode: AppMode) => {
    setAppMode(mode);
    setSelectedNode(null);
    setSearchResults([]);
    setShowSearchResults(false);
    setLoadingError(null);
    
    if (mode === 'live') {
      setCurrentRecording(null);
      setTimelineTree(null);
      setCurrentTimelineEntry(null);
    }
  };

  const handleRecordingLoaded = (recording: Recording) => {
    setCurrentRecording(recording);
    setTimelineTree(recording.initialSnapshot.tree);
    setLoadingError(null);
    console.log('Recording loaded successfully:', recording.metadata);
  };

  const handleTimelineTreeChange = (tree: AXNodeTree) => {
    setTimelineTree(tree);
    setSelectedNode(null); // Clear selection when tree changes
  };

  const handleTimelineEntryChange = (entry: TimelineEntry | null) => {
    setCurrentTimelineEntry(entry);
  };

  const handleLoadingError = (errorMessage: string) => {
    setLoadingError(errorMessage);
  };

  // Auto-switch to timeline mode when recording stops
  useEffect(() => {
    if (lastRecording && lastRecording !== currentRecording) {
      setCurrentRecording(lastRecording);
      setTimelineTree(lastRecording.initialSnapshot.tree);
      setAppMode('timeline');
      console.log('Auto-switched to timeline mode with new recording');
    }
  }, [lastRecording]);

  // Determine which tree to display
  const displayTree = appMode === 'timeline' ? timelineTree : tree;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>AXTree Tool</h1>
          <div className="mode-switcher">
            <button 
              className={`mode-button ${appMode === 'live' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('live')}
            >
              🔴 Live Mode
            </button>
            <button 
              className={`mode-button ${appMode === 'timeline' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('timeline')}
            >
              ⏯️ Timeline Mode
            </button>
          </div>
        </div>
        
        <div className="header-status">
          {appMode === 'live' ? (
            <div className="live-status">
              <div className="connection-status">
                <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                  {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
                {error && (
                  <div className="error-message">
                    ⚠️ {error}
                  </div>
                )}
              </div>
              {isConnected && (
                <RecordingControls
                  isRecording={recordingStatus.isRecording}
                  startTime={recordingStatus.startTime}
                  timelineLength={recordingStatus.timelineLength}
                  duration={recordingStatus.duration}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                />
              )}
            </div>
          ) : (
            <div className="timeline-status">
              {currentRecording ? (
                <div className="recording-info">
                  📼 {currentRecording.metadata.title || 'Loaded Recording'}
                </div>
              ) : (
                <div className="no-recording">
                  📂 No recording loaded
                </div>
              )}
              {loadingError && (
                <div className="error-message">
                  ⚠️ {loadingError}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {appMode === 'live' && (
        <div className="search-section">
          <SearchBox 
            tree={displayTree}
            onSearchResults={handleSearchResults}
            onClearSearch={handleClearSearch}
          />
        </div>
      )}

      <main className="app-main">
        {appMode === 'timeline' && !currentRecording ? (
          <div className="timeline-loader-container">
            <RecordingLoader 
              onRecordingLoaded={handleRecordingLoaded}
              onError={handleLoadingError}
            />
          </div>
        ) : (
          <>
            <div className="tree-panel">
              <TreeView 
                data={displayTree}
                onNodeSelect={handleNodeSelect}
                onNodeHighlight={appMode === 'live' ? handleNodeHighlight : undefined}
              />
              {showSearchResults && (
                <SearchResults
                  results={searchResults}
                  onResultClick={handleSearchResultClick}
                />
              )}
            </div>
            
            <div className="details-panel">
              <NodeDetails selectedNode={selectedNode} />
              {appMode === 'timeline' && currentTimelineEntry && (
                <div className="timeline-entry-info">
                  <h4>Timeline Entry Details</h4>
                  <div className="entry-timestamp">
                    Time: {new Date(currentTimelineEntry.timestamp).toLocaleTimeString()}
                  </div>
                  {currentTimelineEntry.event && (
                    <div className="entry-event">
                      <strong>Event:</strong> {currentTimelineEntry.event.type}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        
        {appMode === 'timeline' && currentRecording && (
          <div className="timeline-panel">
            <TimelinePlayer
              recording={currentRecording}
              onTreeChange={handleTimelineTreeChange}
              onTimelineEntryChange={handleTimelineEntryChange}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;