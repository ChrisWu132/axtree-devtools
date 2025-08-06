import { CdpClient } from './CdpClient.js';
import { WebSocketServer } from './WebSocketServer.js';
import { BridgeOptions, BridgeMessage } from './types.js';
import { AXNodeTree } from '@ax/core';
import { EventEmitter } from 'events';

export class Bridge extends EventEmitter {
  private cdpClient: CdpClient;
  private wsServer: WebSocketServer;
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
      // For now, just trigger a full refresh for major updates
      this.cdpClient.getFullAXTree().then(tree => {
        if (tree) {
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
}

export * from './types.js';
export { CdpClient } from './CdpClient.js';
export { WebSocketServer } from './WebSocketServer.js';