import { CdpClient } from './CdpClient.js';
import { WebSocketServer } from './WebSocketServer.js';
import { Recorder } from './Recorder.js';
import { BridgeOptions, BridgeMessage } from './types.js';
import { AXNodeTree, Recording, UserInteractionEvent } from '@ax/core';
import { EventEmitter } from 'events';

export class Bridge extends EventEmitter {
  private cdpClient: CdpClient;
  private wsServer: WebSocketServer;
  private recorder: Recorder | null = null;
  private options: BridgeOptions;
  private isRunning = false;

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
        this.broadcast({
          type: 'snapshot',
          payload: initialTree
        });

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
    
    await Promise.all([
      this.cdpClient.disconnect(),
      this.wsServer.stop()
    ]);

    this.emit('stopped');
  }

  private setupEventHandlers(): void {
    // Handle CDP events
    this.cdpClient.onTreeRefresh((tree: AXNodeTree) => {
      this.broadcast({
        type: 'snapshot',
        payload: tree
      });
    });

    this.cdpClient.onNodesUpdated((nodes: any[]) => {
      // Get the updated tree
      this.cdpClient.getFullAXTree().then(tree => {
        if (tree) {
          // If recording, record the tree change
          if (this.recorder?.getStatus().isRecording) {
            this.recorder.recordTreeChange(tree);
          }
          
          // Broadcast to UI clients
          this.broadcast({
            type: 'snapshot',
            payload: tree
          });
        }
      });
    });

    // Handle delta updates
    this.cdpClient.onDeltaUpdate((deltaData: any) => {
      console.log('Broadcasting delta update to clients');
      this.broadcast({
        type: 'delta',
        payload: deltaData
      });
    });

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
          this.broadcast({
            type: 'snapshot',
            payload: tree
          });
        }
      });
    });

    this.wsServer.onError((error: Error) => {
      console.error('WebSocket server error:', error);
      this.emit('error', error);
    });
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
   * 开始录制会话
   * @param url 可选的页面 URL
   * @param title 可选的页面标题
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
   * 停止录制会话并返回录制数据
   */
  stopRecording(): Recording {
    if (!this.recorder) {
      throw new Error('Recording mode is not enabled');
    }

    return this.recorder.stopRecording();
  }

  /**
   * 记录用户交互事件
   */
  recordUserEvent(event: UserInteractionEvent): void {
    if (this.recorder) {
      this.recorder.recordUserEvent(event);
    }
  }

  /**
   * 获取录制状态
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
   * 处理开始录制请求
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
   * 处理停止录制请求
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
   * 广播录制状态
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
   * 设置录制器事件处理器
   */
  private setupRecorderEventHandlers(): void {
    if (!this.recorder) return;

    this.recorder.on('recording-started', (snapshot) => {
      console.log('Recording started with initial snapshot');
      this.emit('recording-started', snapshot);
      this.broadcastRecordingStatus();
    });

    this.recorder.on('recording-stopped', (recording: Recording) => {
      console.log(`Recording stopped. Total timeline entries: ${recording.timeline.length}`);
      this.emit('recording-stopped', recording);
      this.broadcast({
        type: 'recordingStopped',
        payload: recording
      });
      this.broadcastRecordingStatus();
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
}

export * from './types.js';
export { CdpClient } from './CdpClient.js';
export { WebSocketServer } from './WebSocketServer.js';
export { Recorder } from './Recorder.js';