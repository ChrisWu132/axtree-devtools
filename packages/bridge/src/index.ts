import { CdpClient } from './CdpClient.js';
import { WebSocketServer } from './WebSocketServer.js';
import { Recorder } from './Recorder.js';
import { BridgeOptions, BridgeMessage } from './types.js';
import { AXNodeTree, Recording, UserInteractionEvent } from '@ax/core';
import { computeDelta } from '@ax/core';
import { EventEmitter } from 'events';

export class Bridge extends EventEmitter {
  private cdpClient: CdpClient;
  private wsServer: WebSocketServer;
  private recorder: Recorder | null = null;
  private options: BridgeOptions;
  private isRunning = false;
  private statusUpdateInterval: NodeJS.Timeout | null = null;
  private treePollingInterval: NodeJS.Timeout | null = null;
  private lastTree: AXNodeTree | null = null;

  constructor(options: BridgeOptions) {
    super();
    this.options = options;
    
    this.cdpClient = new CdpClient({
      host: options.cdpHost || 'localhost',
      port: options.cdpPort,
      wsUrl: options.wsUrl
    });

    this.wsServer = new WebSocketServer({
      host: options.host || 'localhost',
      port: options.port
    });

    // Initialize recorder (default enabled unless explicitly disabled)
    if (options.recordingMode !== false) {
      this.recorder = new Recorder();
      this.setupRecorderEventHandlers();
    }

    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    try {
      // Start WebSocket server first
      await this.wsServer.start();
      console.log(`Bridge WebSocket server started on port ${this.options.port}`);

      // Connect to Chrome DevTools Protocol
      await this.cdpClient.connect();
      console.log(`Connected to Chrome DevTools on port ${this.options.cdpPort}`);

      // Get initial tree and broadcast
      const initialTree = await this.cdpClient.getFullAXTree();
      if (initialTree) {
        const changedNodeIds: number[] = [];
        this.broadcast({ type: 'snapshot', payload: { tree: initialTree, changedNodeIds } as any });
        this.lastTree = initialTree;

        // Auto-start recording if recorder is available
        if (this.recorder) {
          try {
            await this.startRecording();
            console.log('Auto-recording started');
          } catch (error) {
            console.warn('Failed to auto-start recording:', error);
          }
        }
      }

      this.isRunning = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Stop periodic updates
    this.stopPeriodicStatusUpdates();
    this.stopTreePolling();
    
    await Promise.all([
      this.cdpClient.disconnect(),
      this.wsServer.stop()
    ]);

    this.emit('stopped');
  }

  private setupEventHandlers(): void {
    // Handle CDP events
      this.cdpClient.onTreeRefresh((tree: AXNodeTree) => {
      const changedNodeIds = this.computeChangedNodeIds(this.lastTree, tree);
      this.broadcast({ type: 'snapshot', payload: { tree, changedNodeIds } as any });
      if (this.recorder?.getStatus().isRecording) {
        this.recorder.recordTreeChange(tree, {
          type: 'treeRefresh',
          timestamp: Date.now(),
          details: { changedNodeIds }
        });
      }
      this.lastTree = tree;
    });

    this.cdpClient.onNodesUpdated((nodes: any[]) => {
      // NOTE: we rely on re-fetching the full tree to avoid partial/unstable deltas
      // Get the updated tree
      this.cdpClient.getFullAXTree().then(tree => {
        if (tree) {
          // If recording, record the tree change
          if (this.recorder?.getStatus().isRecording) {
            const changedNodeIds = this.computeChangedNodeIds(this.lastTree, tree);
            this.recorder.recordTreeChange(tree, {
              type: 'nodesUpdated',
              timestamp: Date.now(),
              details: { changedNodeIds }
            });
          }
          
          // Broadcast to UI clients
          const changedNodeIds = this.computeChangedNodeIds(this.lastTree, tree);
          this.broadcast({ type: 'snapshot', payload: { tree, changedNodeIds } as any });
          this.lastTree = tree;
        }
      });
    });

    // Record navigation/user events to timeline even if no immediate tree change
    (this.cdpClient as any).on('userEvent', (evt: any) => {
      if (this.recorder?.getStatus().isRecording) {
        this.recordUserEvent({ type: evt.type, timestamp: evt.timestamp, details: { url: evt.url } });
      }
    });

    // Disable raw delta broadcast; we always fetch and broadcast full snapshots

    this.cdpClient.onError((error: Error) => {
      console.error('CDP Client error:', error);
      this.emit('error', error);
    });

    // Handle WebSocket messages
    this.wsServer.onMessage((message: any) => {
      this.handleWebSocketMessage(message);
    });

    this.wsServer.onClientConnected(() => {
      // Send current tree to new client
      this.cdpClient.getFullAXTree().then(tree => {
        if (tree) {
          const changedNodeIds: number[] = [];
          this.broadcast({ type: 'snapshot', payload: { tree, changedNodeIds } as any });
        }
      });
      
      // Send current recording status to new client
      if (this.recorder) {
        this.broadcastRecordingStatus();
      }
    });

    this.wsServer.onError((error: Error) => {
      console.error('WebSocket server error:', error);
      this.emit('error', error);
    });
  }

  private computeChangedNodeIds(prev: AXNodeTree | null, next: AXNodeTree | null): number[] {
    if (!prev || !next) return [];
    const prevMap = new Map<number, any>();
    const nextMap = new Map<number, any>();
    const collect = (node: any, map: Map<number, any>) => {
      if (!node) return;
      const id = node.backendNodeId;
      if (typeof id === 'number') {
        map.set(id, { role: node.role, name: node.name, value: node.value });
      }
      if (node.children) node.children.forEach((c: any) => collect(c, map));
    };
    collect(prev, prevMap);
    collect(next, nextMap);
    const ids = new Set<number>([...prevMap.keys(), ...nextMap.keys()]);
    const changed: number[] = [];
    for (const id of ids) {
      const a = prevMap.get(id);
      const b = nextMap.get(id);
      if (!a || !b) { changed.push(id); continue; }
      if (a.role !== b.role || a.name !== b.name || a.value !== b.value) {
        changed.push(id);
      }
    }
    return changed;
  }

  private handleWebSocketMessage(message: any): void {
    try {
      switch (message.type) {
        case 'highlight':
          if (message.payload?.backendNodeId) {
            this.cdpClient.highlightNode(message.payload.backendNodeId);
          }
          break;
        case 'clearHighlight':
          this.cdpClient.clearHighlight();
          break;
        case 'refresh':
          this.cdpClient.getFullAXTree().then(tree => {
            if (tree) {
              this.broadcast({
                type: 'snapshot',
                payload: tree
              });
            }
          });
          break;
        case 'startRecording':
          this.handleStartRecording();
          break;
        case 'stopRecording':
          this.handleStopRecording();
          break;
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private broadcast(message: BridgeMessage): void {
    this.wsServer.broadcast(message);
  }

  getStatus(): { isRunning: boolean; clientCount: number } {
    return {
      isRunning: this.isRunning,
      clientCount: this.wsServer.getClientCount()
    };
  }

  /**
   * Start a recording session
   * @param url Optional page URL
   * @param title Optional page title
   */
  async startRecording(url?: string, title?: string): Promise<void> {
    if (!this.recorder) {
      throw new Error('Recording mode is not enabled. Initialize Bridge with recordingMode: true');
    }

    if (this.recorder.getStatus().isRecording) {
      throw new Error('Recording is already in progress');
    }

    // Get current accessibility tree
    const initialTree = await this.cdpClient.getFullAXTree();
    if (!initialTree) {
      throw new Error('Failed to get initial accessibility tree');
    }

    this.recorder.startRecording(initialTree, url, title);
  }

  /**
   * Stop the recording session and return the recording payload
   */
  stopRecording(): Recording {
    if (!this.recorder) {
      throw new Error('Recording mode is not enabled');
    }

    return this.recorder.stopRecording();
  }

  /**
   * Record a user interaction event
   */
  recordUserEvent(event: UserInteractionEvent): void {
    if (this.recorder) {
      this.recorder.recordUserEvent(event);
    }
  }

  /**
   * Get current recording status
   */
  getRecordingStatus(): { 
    isRecordingModeEnabled: boolean; 
    isRecording: boolean; 
    timelineLength?: number;
    startTime?: number;
    duration?: number;
  } {
    if (!this.recorder) {
      return { isRecordingModeEnabled: false, isRecording: false };
    }

    const recorderStatus = this.recorder.getStatus();
    return {
      isRecordingModeEnabled: true,
      ...recorderStatus
    };
  }

  /**
   * Handle UI request to start recording
   */
  private async handleStartRecording(): Promise<void> {
    if (!this.recorder) {
      console.warn('Recording not available - recorder not initialized');
      return;
    }

    if (this.recorder.getStatus().isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    try {
      await this.startRecording();
      this.broadcastRecordingStatus();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  /**
   * Handle UI request to stop recording
   */
  private handleStopRecording(): void {
    if (!this.recorder || !this.recorder.getStatus().isRecording) {
      console.warn('No recording in progress');
      return;
    }

    try {
      const recording = this.stopRecording();
      this.broadcast({
        type: 'recordingStopped',
        payload: recording
      });
      this.broadcastRecordingStatus();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  /**
   * Broadcast current recording status to UI clients
   */
  private broadcastRecordingStatus(): void {
    if (!this.recorder) return;

    const status = this.recorder.getStatus();
    this.broadcast({
      type: 'recordingStatus',
      payload: {
        isRecording: status.isRecording,
        startTime: status.startTime,
        timelineLength: status.timelineLength,
        duration: status.duration
      }
    });
  }

  /**
   * Wire recorder internal events to bridge and UI clients
   */
  private setupRecorderEventHandlers(): void {
    if (!this.recorder) return;

    this.recorder.on('recording-started', (snapshot) => {
      console.log('Recording started with initial snapshot');
      this.emit('recording-started', snapshot);
      this.broadcastRecordingStatus();
      
      // Start periodic status updates during recording
      this.startPeriodicStatusUpdates();
      this.startTreePolling();
    });

    this.recorder.on('recording-stopped', (recording: Recording) => {
      console.log(`Recording stopped. Total timeline entries: ${recording.timeline.length}`);
      this.emit('recording-stopped', recording);
      this.broadcast({
        type: 'recordingStopped',
        payload: recording
      });
      this.broadcastRecordingStatus();
      
      // Stop periodic status updates
      this.stopPeriodicStatusUpdates();
      this.stopTreePolling();
    });

    this.recorder.on('timeline-entry-added', (entry) => {
      this.emit('timeline-entry-added', entry);
      this.broadcastRecordingStatus(); // Update timeline length
    });

    this.recorder.on('user-event-recorded', (entry) => {
      this.emit('user-event-recorded', entry);
    });

    this.recorder.on('error', (error) => {
      console.error('Recorder error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Start periodic recording status updates for live timer
   */
  private startPeriodicStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
    
    this.statusUpdateInterval = setInterval(() => {
      if (this.recorder?.getStatus().isRecording) {
        this.broadcastRecordingStatus();
      }
    }, 1000); // Update every second
  }

  /**
   * Stop periodic recording status updates
   */
  private stopPeriodicStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }
  }

  /**
   * Start polling for accessibility tree changes during recording
   */
  private startTreePolling(): void {
    if (this.treePollingInterval) {
      clearInterval(this.treePollingInterval);
    }
    
    this.treePollingInterval = setInterval(async () => {
      if (this.recorder?.getStatus().isRecording) {
        try {
          const currentTree = await this.cdpClient.getFullAXTree();
          if (currentTree && this.recorder) {
            this.recorder.recordTreeChange(currentTree);
          }
        } catch (error) {
          console.error('Error during tree polling:', error);
        }
      }
    }, 500); // Poll every 500ms during recording for real-time capture
  }

  /**
   * Stop tree polling
   */
  private stopTreePolling(): void {
    if (this.treePollingInterval) {
      clearInterval(this.treePollingInterval);
      this.treePollingInterval = null;
    }
  }
}

export * from './types.js';
export { CdpClient } from './CdpClient.js';
export { WebSocketServer } from './WebSocketServer.js';
export { Recorder } from './Recorder.js';