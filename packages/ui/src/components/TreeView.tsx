
import { Tree } from 'react-arborist';
import type { AXNodeTree } from '@ax/core';

interface TreeViewProps {
  data: AXNodeTree | null;
  onNodeSelect?: (node: any) => void;
  onNodeHighlight?: (backendNodeId: number) => void;
}

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  backendNodeId?: number;
  role?: string;
  value?: string;
}

function convertAxTreeToTreeNodes(axTree: AXNodeTree | null): TreeNode[] {
  if (!axTree) return [];
  
  const convertNode = (node: any): TreeNode => {
    return {
      id: node.backendNodeId?.toString() || Math.random().toString(),
      name: node.name || node.role || 'Unknown',
      children: node.children?.map(convertNode) || [],
      backendNodeId: node.backendNodeId,
      role: node.role,
      value: node.value
    };
  };
  
  return [convertNode(axTree)];
}

export function TreeView({ data, onNodeSelect, onNodeHighlight }: TreeViewProps) {
  const treeData = convertAxTreeToTreeNodes(data);
  const changed = (window as any).__AX_CHANGED__ as number[] | undefined;
  
  if (!data) {
    return (
      <div className="tree-view-container">
        <div className="tree-empty-state">
          <p>No accessibility tree data available</p>
          <p>Make sure the bridge is connected and capturing data</p>
        </div>
      </div>
    );
  }
  
  const handleSelect = (nodes: any[]) => {
    if (nodes.length > 0) {
      const selectedNode = nodes[0];
      onNodeSelect?.(selectedNode);
      
      if (selectedNode.data.backendNodeId) {
        onNodeHighlight?.(selectedNode.data.backendNodeId);
      }
    }
  };
  
  return (
    <div className="tree-view-container">
      <div className="tree-header">
        <h3>Accessibility Tree</h3>
        <div className="tree-stats">
          {data && (
            <span>
              Root: {data.role || 'Unknown'} 
              {data.name && ` - ${data.name}`}
            </span>
          )}
        </div>
      </div>
      
      <div className="tree-content">
        <Tree
          data={treeData}
          height={window.innerHeight - 250}
          width="100%"
          rowHeight={24}
          onSelect={handleSelect}
        >
          {({ node, style, dragHandle }) => {
            const isChanged = changed?.includes(node.data.backendNodeId || -1);
            return (
              <div style={style} ref={dragHandle} className={`tree-node ${isChanged ? 'changed' : ''}`}>
                <span className="node-role">{node.data.role}</span>
                {node.data.name && (
                  <span className="node-name">"{node.data.name}"</span>
                )}
                {node.data.value && (
                  <span className="node-description" title={node.data.value}>
                    ({node.data.value.slice(0, 50)}...)
                  </span>
                )}
              </div>
            );
          }}
        </Tree>
      </div>
    </div>
  );
}