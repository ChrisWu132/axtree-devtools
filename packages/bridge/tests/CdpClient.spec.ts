import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';
import { CdpClient } from '../src/CdpClient';

// Mock chrome-remote-interface
vi.mock('chrome-remote-interface', () => ({
  default: vi.fn()
}));

describe('CdpClient', () => {
  let cdpClient: CdpClient;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      Accessibility: {
        enable: vi.fn().mockResolvedValue({}),
        getFullAXTree: vi.fn().mockResolvedValue({
          nodes: [
            {
              backendDOMNodeId: 1,
              role: { value: 'document' },
              name: { value: 'Test Page' },
              childIds: [2]
            },
            {
              backendDOMNodeId: 2,
              role: { value: 'button' },
              name: { value: 'Click me' },
              parentId: 1
            }
          ]
        }),
        nodesUpdated: vi.fn()
      },
      DOM: {
        enable: vi.fn().mockResolvedValue({}),
        getDocument: vi.fn().mockResolvedValue({
          root: { nodeId: 1 }
        }),
        highlightNode: vi.fn().mockResolvedValue({}),
        hideHighlight: vi.fn().mockResolvedValue({}),
        documentUpdated: vi.fn()
      },
      Runtime: {
        enable: vi.fn().mockResolvedValue({})
      },
      Page: {
        enable: vi.fn().mockResolvedValue({}),
        frameNavigated: vi.fn()
      },
      close: vi.fn().mockResolvedValue({})
    };

    // Mock the CDP constructor
    const { default: CDP } = await import('chrome-remote-interface');
    vi.mocked(CDP).mockResolvedValue(mockClient);

    cdpClient = new CdpClient({ port: 9222 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should connect and enable domains', async () => {
    await cdpClient.connect();

    expect(mockClient.Accessibility.enable).toHaveBeenCalled();
    expect(mockClient.DOM.enable).toHaveBeenCalled();
    expect(mockClient.Runtime.enable).toHaveBeenCalled();
    expect(mockClient.Page.enable).toHaveBeenCalled();
  });

  test('should get full accessibility tree', async () => {
    await cdpClient.connect();
    const tree = await cdpClient.getFullAXTree();

    expect(tree).toBeDefined();
    expect(tree!.backendNodeId).toBe(1);
    expect(tree!.role).toBe('document');
    expect(tree!.name).toBe('Test Page');
    expect(tree!.children).toHaveLength(1);
    expect(tree!.children![0].backendNodeId).toBe(2);
  });

  test('should highlight node', async () => {
    await cdpClient.connect();
    await cdpClient.highlightNode(123);

    expect(mockClient.DOM.highlightNode).toHaveBeenCalledWith({
      backendNodeId: 123,
      highlightConfig: {
        borderColor: { r: 255, g: 0, b: 0, a: 1 },
        contentColor: { r: 255, g: 0, b: 0, a: 0.1 }
      }
    });
  });

  test('should clear highlight', async () => {
    await cdpClient.connect();
    await cdpClient.clearHighlight();

    expect(mockClient.DOM.hideHighlight).toHaveBeenCalled();
  });

  test('should handle connection errors', async () => {
    const { default: CDP } = await import('chrome-remote-interface');
    vi.mocked(CDP).mockRejectedValue(new Error('Connection failed'));

    await expect(cdpClient.connect()).rejects.toThrow('Failed to connect to CDP');
  });

  test('should disconnect properly', async () => {
    await cdpClient.connect();
    await cdpClient.disconnect();

    expect(mockClient.close).toHaveBeenCalled();
  });
});