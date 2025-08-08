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
 * Delta shape is defined by jsondiffpatch
 */
export type AXNodeTreeDelta = any;

/**
 * User interaction event payload
 */
export interface UserInteractionEvent {
  type: string;
  timestamp: number;
  details: any;
}

/**
 * Timeline entry including the causing event and the tree delta
 */
export interface TimelineEntry {
  timestamp: number;
  /** Causing event */
  event?: UserInteractionEvent;
  /** Tree delta from previous state to next */
  delta: AXNodeTreeDelta;
}

/**
 * Full recording session payload
 */
export interface Recording {
  metadata: {
    startTime: number;
    endTime: number;
    url?: string;
    title?: string;
    version: string;
  };
  /** Initial snapshot */
  initialSnapshot: AXTreeSnapshot;
  /** Timeline entries */
  timeline: TimelineEntry[];
}