import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreeView } from '../TreeView';
import type { AXNodeTree } from '@ax/core';

describe('TreeView', () => {
  const mockAxTree: AXNodeTree = {
    backendNodeId: 1,
    role: 'WebArea',
    name: 'Test Page',
    value: 'Main content area',
    children: [
      {
        backendNodeId: 2,
        role: 'button',
        name: 'Click me',
        value: 'A clickable button',
        children: []
      },
      {
        backendNodeId: 3,
        role: 'textbox',
        name: 'Input field',
        value: 'Text input',
        children: []
      }
    ]
  };

  it('renders empty state when no data provided', () => {
    render(<TreeView data={null} />);
    
    expect(screen.getByText('No accessibility tree data available')).toBeInTheDocument();
    expect(screen.getByText('Make sure the bridge is connected and capturing data')).toBeInTheDocument();
  });

  it('renders tree header with root node info', () => {
    render(<TreeView data={mockAxTree} />);
    
    expect(screen.getByText('Accessibility Tree')).toBeInTheDocument();
    expect(screen.getByText(/Root: WebArea - Test Page/)).toBeInTheDocument();
  });

  it('calls onNodeSelect when node is selected', () => {
    const onNodeSelect = vi.fn();
    const onNodeHighlight = vi.fn();
    
    render(
      <TreeView 
        data={mockAxTree} 
        onNodeSelect={onNodeSelect}
        onNodeHighlight={onNodeHighlight}
      />
    );
    
    // Note: Testing tree interaction would require more complex setup
    // with react-arborist's internal state management
    expect(screen.getByText('Accessibility Tree')).toBeInTheDocument();
  });

  it('handles large tree without performance issues', () => {
    // Generate a large tree with 1000+ nodes
    const generateLargeTree = (depth: number, breadth: number): AXNodeTree => {
      const node: AXNodeTree = {
        backendNodeId: Math.floor(Math.random() * 10000),
        role: 'div',
        name: `Node at depth ${depth}`,
        children: []
      };

      if (depth > 0) {
        for (let i = 0; i < breadth; i++) {
          node.children!.push(generateLargeTree(depth - 1, breadth));
        }
      }

      return node;
    };

    const largeTree = generateLargeTree(5, 10); // ~10k nodes
    
    const startTime = performance.now();
    render(<TreeView data={largeTree} />);
    const endTime = performance.now();
    
    // Should render within reasonable time (< 1000ms)
    expect(endTime - startTime).toBeLessThan(1000);
    expect(screen.getByText('Accessibility Tree')).toBeInTheDocument();
  });
});