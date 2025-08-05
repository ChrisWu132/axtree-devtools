import CDP from 'chrome-remote-interface';
import { AXNodeFlat, AXNodeTree, buildTree } from '@ax/core';
import { EventEmitter } from 'events';

export interface CdpClientOptions {
  host?: string;
  port: number;
}

export class CdpClient extends EventEmitter {
  private client: any = null;
  private isConnected = false;
  private options: CdpClientOptions;

  constructor(options: CdpClientOptions) {
    super();
    this.options = {
      host: 'localhost',
      ...options
    };
  }

  async connect(): Promise<void> {
    try {
      this.client = await CDP({
        host: this.options.host,
        port: this.options.port
      });

      await this.enableDomains();
      this.setupEventListeners();
      this.isConnected = true;
      this.emit('connected');
    } catch (error) {
      this.emit('error', new Error(`Failed to connect to CDP: ${error}`));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.isConnected = false;
      this.emit('disconnected');
    }
  }

  private async enableDomains(): Promise<void> {
    if (!this.client) throw new Error('Client not connected');

    await Promise.all([
      this.client.Accessibility.enable(),
      this.client.DOM.enable(),
      this.client.Runtime.enable(),
      this.client.Page.enable()
    ]);
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    // Listen for accessibility tree updates
    this.client.Accessibility.nodesUpdated((params: any) => {
      this.emit('nodesUpdated', params.nodes);
    });

    // Listen for DOM document updates
    this.client.DOM.documentUpdated(() => {
      this.refreshFullTree();
    });

    // Handle page navigation
    this.client.Page.frameNavigated(() => {
      setTimeout(() => this.refreshFullTree(), 1000); // Wait for page to load
    });
  }

  async getFullAXTree(): Promise<AXNodeTree | null> {
    if (!this.client) throw new Error('Client not connected');

    try {
      // Get the root document node
      const { root } = await this.client.DOM.getDocument({ depth: -1 });
      
      // Get the full accessibility tree
      const { nodes } = await this.client.Accessibility.getFullAXTree({
        max_depth: -1
      });

      if (!nodes || nodes.length === 0) {
        return null;
      }

      // Convert CDP nodes to our format
      const flatNodes: AXNodeFlat[] = nodes.map((node: any) => ({
        backendNodeId: node.backendDOMNodeId || node.nodeId,
        role: node.role?.value || 'unknown',
        name: node.name?.value || node.name,
        value: node.value?.value || node.value,
        parentId: node.parentId,
        childIds: node.childIds || [],
        properties: node.properties?.reduce((acc: any, prop: any) => {
          acc[prop.name] = prop.value?.value || prop.value;
          return acc;
        }, {}),
        boundingBox: node.boundingBox ? {
          x: node.boundingBox.x,
          y: node.boundingBox.y,
          width: node.boundingBox.width,
          height: node.boundingBox.height
        } : undefined,
        attributes: node.attributes || {},
        states: node.states || []
      }));

      return buildTree(flatNodes);
    } catch (error) {
      this.emit('error', new Error(`Failed to get accessibility tree: ${error}`));
      return null;
    }
  }

  async highlightNode(backendNodeId: number): Promise<void> {
    if (!this.client) throw new Error('Client not connected');

    try {
      // Highlight the node using DOM.highlightNode
      await this.client.DOM.highlightNode({
        backendNodeId,
        highlightConfig: {
          borderColor: { r: 255, g: 0, b: 0, a: 1 },
          contentColor: { r: 255, g: 0, b: 0, a: 0.1 }
        }
      });
    } catch (error) {
      this.emit('error', new Error(`Failed to highlight node: ${error}`));
    }
  }

  async clearHighlight(): Promise<void> {
    if (!this.client) throw new Error('Client not connected');

    try {
      await this.client.DOM.hideHighlight();
    } catch (error) {
      this.emit('error', new Error(`Failed to clear highlight: ${error}`));
    }
  }

  private async refreshFullTree(): Promise<void> {
    if (!this.isConnected) return;

    const tree = await this.getFullAXTree();
    if (tree) {
      this.emit('treeRefresh', tree);
    }
  }

  onNodesUpdated(callback: (nodes: any[]) => void): void {
    this.on('nodesUpdated', callback);
  }

  onTreeRefresh(callback: (tree: AXNodeTree) => void): void {
    this.on('treeRefresh', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }
}