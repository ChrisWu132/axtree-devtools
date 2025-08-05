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
      // First get list of available tabs
      const tabs = await CDP.List({
        host: this.options.host,
        port: this.options.port
      });

      // Filter out the AXTree tool itself (localhost:5173) and DevTools
      const targetTab = tabs.find(tab => 
        tab.type === 'page' && 
        tab.url && 
        !tab.url.includes('localhost:5173') &&
        !tab.url.includes('127.0.0.1:5173') &&
        !tab.url.startsWith('chrome-extension://') &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('about:') &&
        !tab.url.startsWith('devtools://') &&
        tab.title !== 'DevTools'
      );

      if (!targetTab) {
        throw new Error('No suitable tab found. Please open a webpage in the Chrome debug instance.');
      }

      console.log(`Connecting to tab: ${targetTab.title} (${targetTab.url})`);

      this.client = await CDP({
        host: this.options.host,
        port: this.options.port,
        target: targetTab.id
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
      this.client.Page.enable(),
      this.client.Overlay.enable()
    ]);
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    // Listen for accessibility tree updates
    this.client.Accessibility.nodesUpdated((params: any) => {
      console.log('Nodes updated, processing delta...');
      this.handleNodesUpdated(params.nodes);
    });

    // Listen for DOM document updates
    this.client.DOM.documentUpdated(() => {
      console.log('DOM document updated, refreshing full tree...');
      this.refreshFullTree();
    });

    // Handle page navigation
    this.client.Page.frameNavigated(() => {
      console.log('Frame navigated, refreshing tree...');
      setTimeout(() => this.refreshFullTree(), 1000); // Wait for page to load
    });
  }

  private async handleNodesUpdated(updatedNodes: any[]): Promise<void> {
    if (!updatedNodes || updatedNodes.length === 0) return;

    try {
      // Get the current full tree for comparison
      const currentTree = await this.getFullAXTree();
      
      if (currentTree) {
        // Emit delta update
        this.emit('deltaUpdate', {
          type: 'delta',
          payload: {
            updatedNodes,
            fullTree: currentTree, // For now, send full tree with delta info
            timestamp: Date.now()
          }
        });
      }
    } catch (error) {
      console.error('Failed to handle nodes update:', error);
      // Fallback to full refresh
      this.refreshFullTree();
    }
  }

  async getFullAXTree(): Promise<AXNodeTree | null> {
    if (!this.client) throw new Error('Client not connected');

    try {
      // Get the root document node
      const { root } = await this.client.DOM.getDocument({ depth: -1 });
      
      // Get the full accessibility tree - try both approaches
      let nodes: any[] = [];
      
      try {
        // First try getFullAXTree
        const result1 = await this.client.Accessibility.getFullAXTree({
          depth: -1,
          frameId: root.frameId
        });
        nodes = result1.nodes || [];
        console.log(`getFullAXTree returned ${nodes.length} nodes`);
      } catch (error) {
        console.log('getFullAXTree failed:', error);
      }

      // If that didn't work or returned few nodes, try getPartialAXTree from root
      if (nodes.length < 10) {
        try {
          const result2 = await this.client.Accessibility.getPartialAXTree({
            nodeId: root.nodeId,
            backendNodeId: root.backendNodeId,
            fetchRelatives: true
          });
          nodes = result2.nodes || [];
          console.log(`getPartialAXTree returned ${nodes.length} nodes`);
        } catch (error) {
          console.log('getPartialAXTree failed:', error);
        }
      }

      // If still no luck, try a different approach
      if (nodes.length === 0) {
        try {
          const result3 = await this.client.Accessibility.getFullAXTree({});
          nodes = result3.nodes || [];
          console.log(`getFullAXTree (no params) returned ${nodes.length} nodes`);
        } catch (error) {
          console.log('getFullAXTree (no params) failed:', error);
        }
      }

      console.log(`Retrieved ${nodes?.length || 0} accessibility nodes from Chrome`);

      if (!nodes || nodes.length === 0) {
        return null;
      }

      // Convert CDP nodes to our format
      const flatNodes: AXNodeFlat[] = nodes.map((node: any) => ({
        backendNodeId: node.backendDOMNodeId || node.nodeId,
        role: node.role?.value || 'unknown',
        name: node.name?.value || (typeof node.name === 'string' ? node.name : undefined),
        value: node.value?.value || (typeof node.value === 'string' ? node.value : undefined),
        parentId: node.parentId ? parseInt(node.parentId.toString()) : undefined,
        childIds: (node.childIds || []).map((id: any) => parseInt(id.toString())),
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

      console.log(`Processed ${flatNodes.length} flat nodes`);
      console.log('Sample nodes:', flatNodes.slice(0, 5).map(n => ({
        id: n.backendNodeId,
        role: n.role,
        name: n.name,
        parentId: n.parentId,
        childIds: n.childIds,
        childCount: n.childIds?.length || 0
      })));

      const tree = buildTree(flatNodes);
      console.log('Built tree:', tree ? `Root: ${tree.role} "${tree.name}", children: ${tree.children?.length || 0}` : 'null');
      
      // Debug: check tree depth
      if (tree) {
        const getTreeDepth = (node: any, depth = 0): number => {
          if (!node.children || node.children.length === 0) return depth;
          return Math.max(...node.children.map((child: any) => getTreeDepth(child, depth + 1)));
        };
        console.log('Tree depth:', getTreeDepth(tree));
        
        // Show first few levels
        const showLevels = (node: any, level = 0, maxLevel = 2): void => {
          if (level > maxLevel) return;
          console.log(`${'  '.repeat(level)}${node.role} "${node.name}" (${node.children?.length || 0} children)`);
          if (node.children) {
            node.children.slice(0, 3).forEach((child: any) => showLevels(child, level + 1, maxLevel));
          }
        };
        showLevels(tree);
      }
      
      return tree;
    } catch (error) {
      this.emit('error', new Error(`Failed to get accessibility tree: ${error}`));
      return null;
    }
  }

  async highlightNode(backendNodeId: number): Promise<void> {
    if (!this.client) throw new Error('Client not connected');

    try {
      // Clear any existing highlight first
      await this.client.Overlay.hideHighlight();
      
      // Highlight the node using Overlay.highlightNode
      await this.client.Overlay.highlightNode({
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
      await this.client.Overlay.hideHighlight();
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

  onDeltaUpdate(callback: (deltaData: any) => void): void {
    this.on('deltaUpdate', callback);
  }

  onTreeRefresh(callback: (tree: AXNodeTree) => void): void {
    this.on('treeRefresh', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }
}