import { AXNodeTree, AXNodeFlat } from './types.js';
import * as jsondiffpatch from 'jsondiffpatch';

// Create diff instance with appropriate configuration
const differ = jsondiffpatch.create({
  objectHash: (obj: any) => {
    // Use backendNodeId as object hash for better diffing
    return obj.backendNodeId || obj.id;
  },
  arrays: {
    // Detect moved items in arrays
    detectMove: true,
    // Use custom comparison for array items
    includeValueOnMove: false
  }
});

/**
 * Calculate the difference between two accessibility trees
 */
export function calculateTreeDiff(oldTree: AXNodeTree | null, newTree: AXNodeTree | null): any {
  if (!oldTree && !newTree) {
    return null;
  }
  
  if (!oldTree) {
    return {
      type: 'tree_created',
      tree: newTree
    };
  }
  
  if (!newTree) {
    return {
      type: 'tree_deleted',
      tree: oldTree
    };
  }

  const delta = differ.diff(oldTree, newTree);
  
  return {
    type: 'tree_updated',
    delta,
    hasChanges: !!delta
  };
}

/**
 * Apply a diff patch to an existing tree
 */
export function applyTreeDiff(tree: AXNodeTree, diff: any): AXNodeTree {
  if (!diff || !diff.delta) {
    return tree;
  }

  // Clone the tree to avoid mutations
  const clonedTree = JSON.parse(JSON.stringify(tree));
  
  // Apply the patch
  jsondiffpatch.patch(clonedTree, diff.delta);
  
  return clonedTree;
}

/**
 * Generate a summary of changes from a diff
 */
export function summarizeChanges(diff: any): {
  added: number;
  removed: number;
  modified: number;
  moved: number;
} {
  let added = 0;
  let removed = 0;
  let modified = 0;
  let moved = 0;

  if (!diff || !diff.delta) {
    return { added, removed, modified, moved };
  }

  const countChanges = (obj: any, path = '') => {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        // Array change
        if (value.length === 1) {
          added++;
        } else if (value.length === 2) {
          modified++;
        } else if (value.length === 3 && value[2] === 0) {
          removed++;
        } else if (value.length === 3 && value[2] === 3) {
          moved++;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Nested object changes
        countChanges(value, `${path}.${key}`);
      }
    }
  };

  countChanges(diff.delta);

  return { added, removed, modified, moved };
}

/**
 * Check if a tree update is significant enough to broadcast
 */
export function isSignificantChange(diff: any): boolean {
  if (!diff || !diff.delta) {
    return false;
  }

  const summary = summarizeChanges(diff);
  const totalChanges = summary.added + summary.removed + summary.modified + summary.moved;
  
  // Consider it significant if there are any structural changes
  // or more than 5 property modifications
  return totalChanges > 0 && (summary.added > 0 || summary.removed > 0 || summary.moved > 0 || totalChanges > 5);
}

/**
 * Extract node IDs that were affected by the diff
 */
export function getAffectedNodeIds(diff: any): number[] {
  const nodeIds: Set<number> = new Set();

  if (!diff || !diff.delta) {
    return [];
  }

  const extractIds = (obj: any, path = '') => {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      // Try to extract backendNodeId from the path or value
      if (key === 'backendNodeId' && typeof value === 'number') {
        nodeIds.add(value);
      } else if (Array.isArray(value) && value.length > 0) {
        // Check if the value contains a node with backendNodeId
        value.forEach(item => {
          if (item && typeof item === 'object' && item.backendNodeId) {
            nodeIds.add(item.backendNodeId);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        extractIds(value, `${path}.${key}`);
      }
    }
  };

  extractIds(diff.delta);

  return Array.from(nodeIds);
}