import { AXNodeFlat, AXNodeTree } from './types.js';

/**
 * Builds a hierarchical tree structure from a flat list of accessibility nodes
 */
export function buildTree(flatNodes: AXNodeFlat[]): AXNodeTree | null {
  if (!flatNodes || flatNodes.length === 0) {
    return null;
  }

  // Create a map for quick lookup
  const nodeMap = new Map<number, AXNodeFlat>();
  flatNodes.forEach(node => {
    nodeMap.set(node.backendNodeId, node);
  });

  // Find root node(s) - nodes without parents or with invalid parent references
  const roots: AXNodeFlat[] = [];
  flatNodes.forEach(node => {
    if (!node.parentId || !nodeMap.has(node.parentId)) {
      roots.push(node);
    }
  });

  // If no clear root, use the first node
  if (roots.length === 0) {
    roots.push(flatNodes[0]);
  }

  // Convert flat node to tree node recursively
  function convertToTreeNode(flatNode: AXNodeFlat): AXNodeTree {
    const treeNode: AXNodeTree = {
      backendNodeId: flatNode.backendNodeId,
      role: flatNode.role,
      name: flatNode.name,
      value: flatNode.value,
      properties: flatNode.properties,
      boundingBox: flatNode.boundingBox,
      attributes: flatNode.attributes,
      states: flatNode.states,
    };

    // Add children if they exist
    if (flatNode.childIds && flatNode.childIds.length > 0) {
      treeNode.children = [];
      flatNode.childIds.forEach(childId => {
        const childNode = nodeMap.get(childId);
        if (childNode) {
          treeNode.children!.push(convertToTreeNode(childNode));
        }
      });
    }

    return treeNode;
  }

  // Return the first root (assuming single root tree for now)
  return convertToTreeNode(roots[0]);
}

/**
 * Flattens a tree structure back to a list of flat nodes
 */
export function flattenTree(tree: AXNodeTree, parentId?: number): AXNodeFlat[] {
  const result: AXNodeFlat[] = [];

  const flatNode: AXNodeFlat = {
    backendNodeId: tree.backendNodeId,
    role: tree.role,
    name: tree.name,
    value: tree.value,
    parentId,
    properties: tree.properties,
    boundingBox: tree.boundingBox,
    attributes: tree.attributes,
    states: tree.states,
  };

  if (tree.children && tree.children.length > 0) {
    flatNode.childIds = tree.children.map(child => child.backendNodeId);
    
    // Recursively flatten children
    tree.children.forEach(child => {
      result.push(...flattenTree(child, tree.backendNodeId));
    });
  }

  result.unshift(flatNode);
  return result;
}

/**
 * Validates the structure of an accessibility tree
 */
export function validateTree(tree: AXNodeTree): boolean {
  if (!tree || !tree.backendNodeId || !tree.role) {
    return false;
  }

  // Check children recursively
  if (tree.children) {
    return tree.children.every(child => validateTree(child));
  }

  return true;
}

/**
 * Finds a node in the tree by its backendNodeId
 */
export function findNodeById(tree: AXNodeTree, nodeId: number): AXNodeTree | null {
  if (tree.backendNodeId === nodeId) {
    return tree;
  }

  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeById(child, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}