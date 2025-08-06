/**
 * Core types for accessibility tree representation
 */

export interface AXNodeFlat {
  /** Unique identifier for the node */
  backendNodeId: number;
  /** Node's role (button, link, text, etc.) */
  role: string;
  /** Human-readable name/label */
  name?: string;
  /** Text content */
  value?: string;
  /** Parent node's backendNodeId */
  parentId?: number;
  /** Array of child node backendNodeIds */
  childIds?: number[];
  /** Additional properties */
  properties?: Record<string, any>;
  /** Bounding box coordinates */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** ARIA attributes */
  attributes?: Record<string, string>;
  /** Node state (checked, expanded, etc.) */
  states?: string[];
}

export interface AXNodeTree extends Omit<AXNodeFlat, 'parentId' | 'childIds'> {
  /** Child nodes as nested tree structure */
  children?: AXNodeTree[];
}

export interface Diff {
  /** Type of change */
  type: 'added' | 'removed' | 'modified';
  /** Node that changed */
  node: AXNodeFlat | AXNodeTree;
  /** Previous value for modifications */
  oldValue?: any;
  /** New value for modifications */
  newValue?: any;
  /** Path to the changed property */
  path?: string;
}

export interface AXTreeSnapshot {
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Root node of the accessibility tree */
  tree: AXNodeTree;
  /** Flat list of all nodes */
  flatNodes: AXNodeFlat[];
  /** URL of the page */
  url?: string;
  /** Page title */
  title?: string;
}

/**
 * Delta (差异) 的具体格式由 jsondiffpatch 定义
 */
export type AXNodeTreeDelta = any;

/**
 * 用户交互事件
 */
export interface UserInteractionEvent {
  type: string;
  timestamp: number;
  details: any;
}

/**
 * 时间线条目，包含触发变化的事件和对应的树差异
 */
export interface TimelineEntry {
  timestamp: number;
  /** 触发变化的事件 */
  event?: UserInteractionEvent;
  /** 从前一状态到当前状态的树的差异 */
  delta: AXNodeTreeDelta;
}

/**
 * 完整的录制会话数据
 */
export interface Recording {
  metadata: {
    startTime: number;
    endTime: number;
    url?: string;
    title?: string;
    version: string;
  };
  /** 录制开始时的完整树 */
  initialSnapshot: AXTreeSnapshot;
  /** 后续所有变化的时间线 */
  timeline: TimelineEntry[];
}