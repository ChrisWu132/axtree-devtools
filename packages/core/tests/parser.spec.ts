import { expect, test, describe } from 'vitest';
import { buildTree, flattenTree, validateTree, findNodeById } from '../src/parser';
import { AXNodeFlat, AXNodeTree } from '../src/types';

describe('Parser', () => {
  const mockFlatNodes: AXNodeFlat[] = [
    {
      backendNodeId: 1,
      role: 'document',
      name: 'Test Page',
      childIds: [2, 3]
    },
    {
      backendNodeId: 2,
      role: 'button',
      name: 'Click me',
      parentId: 1,
      value: 'button-value'
    },
    {
      backendNodeId: 3,
      role: 'text',
      name: 'Hello World',
      parentId: 1,
      value: 'Hello World'
    }
  ];

  test('buildTree should convert flat nodes to tree structure', () => {
    const tree = buildTree(mockFlatNodes);
    
    expect(tree).toBeDefined();
    expect(tree!.backendNodeId).toBe(1);
    expect(tree!.role).toBe('document');
    expect(tree!.name).toBe('Test Page');
    expect(tree!.children).toHaveLength(2);
    
    const firstChild = tree!.children![0];
    expect(firstChild.backendNodeId).toBe(2);
    expect(firstChild.role).toBe('button');
    expect(firstChild.name).toBe('Click me');
    
    const secondChild = tree!.children![1];
    expect(secondChild.backendNodeId).toBe(3);
    expect(secondChild.role).toBe('text');
    expect(secondChild.name).toBe('Hello World');
  });

  test('buildTree should handle empty input', () => {
    expect(buildTree([])).toBeNull();
    expect(buildTree(null as any)).toBeNull();
  });

  test('flattenTree should convert tree back to flat structure', () => {
    const tree = buildTree(mockFlatNodes);
    const flattened = flattenTree(tree!);
    
    expect(flattened).toHaveLength(3);
    expect(flattened[0].backendNodeId).toBe(1);
    expect(flattened[0].childIds).toEqual([2, 3]);
    expect(flattened[1].parentId).toBe(1);
    expect(flattened[2].parentId).toBe(1);
  });

  test('validateTree should validate tree structure', () => {
    const validTree: AXNodeTree = {
      backendNodeId: 1,
      role: 'button',
      name: 'Valid Button'
    };
    
    const invalidTree: AXNodeTree = {
      backendNodeId: 0,
      role: '',
      name: 'Invalid'
    } as any;
    
    expect(validateTree(validTree)).toBe(true);
    expect(validateTree(invalidTree)).toBe(false);
    expect(validateTree(null as any)).toBe(false);
  });

  test('findNodeById should find nodes in tree', () => {
    const tree = buildTree(mockFlatNodes);
    
    const found = findNodeById(tree!, 2);
    expect(found).toBeDefined();
    expect(found!.backendNodeId).toBe(2);
    expect(found!.role).toBe('button');
    
    const notFound = findNodeById(tree!, 999);
    expect(notFound).toBeNull();
  });

  test('should handle large tree structures efficiently', () => {
    // Generate a larger tree for performance testing
    const largeNodes: AXNodeFlat[] = [];
    for (let i = 1; i <= 1000; i++) {
      largeNodes.push({
        backendNodeId: i,
        role: i === 1 ? 'document' : 'button',
        name: `Node ${i}`,
        parentId: i === 1 ? undefined : 1,
        childIds: i === 1 ? Array.from({length: 999}, (_, idx) => idx + 2) : undefined
      });
    }
    
    const start = performance.now();
    const tree = buildTree(largeNodes);
    const end = performance.now();
    
    expect(tree).toBeDefined();
    expect(tree!.children).toHaveLength(999);
    expect(end - start).toBeLessThan(100); // Should complete within 100ms
  });
});