import { EventEmitter } from 'events';
import { 
  Recording, 
  TimelineEntry, 
  AXTreeSnapshot, 
  AXNodeTree, 
  UserInteractionEvent,
  AXNodeTreeDelta 
} from '@ax/core';
import { computeDelta } from '@ax/core';

export interface RecorderOptions {
  /** Maximum number of timeline entries to keep in memory */
  maxTimelineEntries?: number;
}

/**
 * Incremental recording engine.
 * Records AX tree changes and user interaction events.
 * Uses an incremental storage strategy (initial snapshot + subsequent deltas)
 * to optimize payload size and playback speed.
 */
export class Recorder extends EventEmitter {
  private isRecording = false;
  private initialSnapshot: AXTreeSnapshot | null = null;
  private currentTree: AXNodeTree | null = null;
  private timeline: TimelineEntry[] = [];
  private startTime: number = 0;
  private options: RecorderOptions;
  private lastSerializedTree: string | null = null;
  
  constructor(options: RecorderOptions = {}) {
    super();
    this.options = {
      maxTimelineEntries: 10000, // default max 10k timeline entries
      ...options
    };
  }

  /**
   * Start recording
   * @param initialTree AX tree at the start of recording
   * @param url Optional current page URL
   * @param title Optional page title
   */
  startRecording(initialTree: AXNodeTree, url?: string, title?: string): void {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    this.startTime = Date.now();
    this.initialSnapshot = {
      timestamp: this.startTime,
      tree: initialTree,
      flatNodes: this.flattenTree(initialTree),
      url,
      title
    };
    this.currentTree = JSON.parse(JSON.stringify(initialTree)); // deep clone
    this.lastSerializedTree = this.stableStringify(this.currentTree);
    this.timeline = [];
    this.isRecording = true;

    this.emit('recording-started', this.initialSnapshot);
    console.log('Recording started at', new Date(this.startTime).toISOString());
  }

  /**
   * Stop recording and return the full recording payload
   */
  stopRecording(): Recording {
    if (!this.isRecording || !this.initialSnapshot) {
      throw new Error('No recording in progress');
    }

    const endTime = Date.now();
    const recording: Recording = {
      metadata: {
        startTime: this.startTime,
        endTime,
        url: this.initialSnapshot.url,
        title: this.initialSnapshot.title,
        version: '1.0.0'
      },
      initialSnapshot: this.initialSnapshot,
      timeline: [...this.timeline] // clone timeline
    };

    // Reset internal state
    this.isRecording = false;
    this.initialSnapshot = null;
    this.currentTree = null;
    this.timeline = [];

    this.emit('recording-stopped', recording);
    console.log(`Recording stopped. Captured ${recording.timeline.length} timeline entries.`);
    
    return recording;
  }

  /**
   * Record an AX tree change
   * @param newTree Next AX tree state
   * @param event Optional user interaction event
   */
  recordTreeChange(newTree: AXNodeTree, event?: UserInteractionEvent): void {
    if (!this.isRecording || !this.currentTree) {
      console.log('Not recording or no current tree available');
      return;
    }

    try {
      // Avoid false positives by comparing stable-serialized snapshots first
      const serializedNew = this.stableStringify(newTree);
      if (this.lastSerializedTree === serializedNew) {
        return; // No structural change
      }

      // Compute delta between current and new tree
      const delta = computeDelta(this.currentTree, newTree);
      
      // Skip if no changes
      if (!delta || Object.keys(delta).length === 0) {
        console.log('No changes detected in tree, skipping timeline entry');
        return;
      }

      console.log('Recording tree change with delta:', Object.keys(delta).length, 'changes');

      const timelineEntry: TimelineEntry = {
        timestamp: Date.now(),
        event,
        delta,
        changedNodeIds: this.extractChangedNodeIds(this.currentTree, newTree)
      };

      this.timeline.push(timelineEntry);
      
      // Enforce max timeline length
      if (this.options.maxTimelineEntries && this.timeline.length > this.options.maxTimelineEntries) {
        this.timeline.shift(); // drop oldest entry
        console.warn(`Timeline entries exceeded maximum (${this.options.maxTimelineEntries}), removing oldest entry`);
      }

      // Update current snapshot
      this.currentTree = JSON.parse(JSON.stringify(newTree));
      this.lastSerializedTree = serializedNew;

      this.emit('timeline-entry-added', timelineEntry);
      
    } catch (error) {
      console.error('Error recording tree change:', error);
      this.emit('error', error);
    }
  }

  private extractChangedNodeIds(prev: AXNodeTree, next: AXNodeTree): number[] {
    const prevMap = new Map<number, any>();
    const nextMap = new Map<number, any>();
    const collect = (node: any, map: Map<number, any>) => {
      if (!node) return;
      const id = node.backendNodeId;
      if (typeof id === 'number') {
        map.set(id, { role: node.role, name: node.name, value: node.value });
      }
      if (node.children) node.children.forEach((c: any) => collect(c, map));
    };
    collect(prev, prevMap);
    collect(next, nextMap);
    const ids = new Set<number>([...prevMap.keys(), ...nextMap.keys()]);
    const changed: number[] = [];
    for (const id of ids) {
      const a = prevMap.get(id);
      const b = nextMap.get(id);
      if (!a || !b) { changed.push(id); continue; }
      if (a.role !== b.role || a.name !== b.name || a.value !== b.value) {
        changed.push(id);
      }
    }
    return changed;
  }

  /**
   * Record a user event even without an immediate AX change
   */
  recordUserEvent(event: UserInteractionEvent): void {
    if (!this.isRecording) {
      return;
    }

    const timelineEntry: TimelineEntry = {
      timestamp: Date.now(),
      event,
      delta: {} // empty delta means no tree change
    };

    this.timeline.push(timelineEntry);
    this.emit('user-event-recorded', timelineEntry);
  }

  /**
   * Get current recording status
   */
  getStatus(): {
    isRecording: boolean;
    timelineLength: number;
    startTime?: number;
    duration?: number;
  } {
    return {
      isRecording: this.isRecording,
      timelineLength: this.timeline.length,
      startTime: this.startTime || undefined,
      duration: this.isRecording ? Date.now() - this.startTime : undefined
    };
  }

  /**
   * Flatten tree to a node array representation
   */
  private flattenTree(tree: AXNodeTree): any[] {
    const result: any[] = [];
    
    const flatten = (node: AXNodeTree) => {
      const { children, ...flatNode } = node;
      result.push({
        ...flatNode,
        childIds: children?.map(child => child.backendNodeId) || []
      });
      
      if (children) {
        children.forEach(flatten);
      }
    };
    
    flatten(tree);
    return result;
  }

  /**
   * Deterministically stringify an object by sorting keys
   */
  private stableStringify(value: any): string {
    const replacer = (_key: string, val: any) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const sorted: Record<string, any> = {};
        for (const k of Object.keys(val).sort()) {
          sorted[k] = val[k];
        }
        return sorted;
      }
      return val;
    };
    return JSON.stringify(value, replacer);
  }
}