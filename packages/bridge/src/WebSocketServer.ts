import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { BridgeMessage } from './types.js';

export interface WebSocketServerOptions {
  port: number;
  host?: string;
}

export class WebSocketServer extends EventEmitter {
  private wss: WSServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private options: WebSocketServerOptions;

  constructor(options: WebSocketServerOptions) {
    super();
    this.options = {
      host: 'localhost',
      ...options
    };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WSServer({
          port: this.options.port,
          host: this.options.host,
          path: '/ax-tree'
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws);
        });

        this.wss.on('listening', () => {
          console.log(`WebSocket server listening on ${this.options.host}:${this.options.port}`);
          this.emit('listening');
          resolve();
        });

        this.wss.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
        this.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.close();
          }
        });
        this.clients.clear();

        this.wss.close(() => {
          this.wss = null;
          this.emit('closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`Client connected. Total clients: ${this.clients.size}`);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.emit('message', message, ws);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`Client disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      this.clients.delete(ws);
    });

    // Send initial connection confirmation
    this.sendToClient(ws, {
      type: 'connected',
      payload: { status: 'ready' }
    } as any);

    this.emit('clientConnected', ws);
  }

  broadcast(message: BridgeMessage): void {
    const data = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  sendToClient(client: WebSocket, message: BridgeMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  onMessage(callback: (message: any, client: WebSocket) => void): void {
    this.on('message', callback);
  }

  onClientConnected(callback: (client: WebSocket) => void): void {
    this.on('clientConnected', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }
}