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
 * 增量录制引擎
 * 
 * 负责记录无障碍树的变化和用户交互事件，
 * 使用增量存储策略（初始快照 + 后续 delta）来优化性能和存储空间。
 */
export class Recorder extends EventEmitter {
  private isRecording = false;
  private initialSnapshot: AXTreeSnapshot | null = null;
  private currentTree: AXNodeTree | null = null;
  private timeline: TimelineEntry[] = [];
  private startTime: number = 0;
  private options: RecorderOptions;
  
  constructor(options: RecorderOptions = {}) {
    super();
    this.options = {
      maxTimelineEntries: 10000, // 默认最多记录 10k 条时间线条目
      ...options
    };
  }

  /**
   * 开始录制
   * @param initialTree 录制开始时的无障碍树
   * @param url 当前页面 URL
   * @param title 当前页面标题
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
    this.currentTree = JSON.parse(JSON.stringify(initialTree)); // 深拷贝
    this.timeline = [];
    this.isRecording = true;

    this.emit('recording-started', this.initialSnapshot);
    console.log('Recording started at', new Date(this.startTime).toISOString());
  }

  /**
   * 停止录制并返回完整的录制数据
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
      timeline: [...this.timeline] // 拷贝时间线
    };

    // 清理状态
    this.isRecording = false;
    this.initialSnapshot = null;
    this.currentTree = null;
    this.timeline = [];

    this.emit('recording-stopped', recording);
    console.log(`Recording stopped. Captured ${recording.timeline.length} timeline entries.`);
    
    return recording;
  }

  /**
   * 记录无障碍树的变化
   * @param newTree 新的无障碍树状态
   * @param event 可选的触发此变化的用户交互事件
   */
  recordTreeChange(newTree: AXNodeTree, event?: UserInteractionEvent): void {
    if (!this.isRecording || !this.currentTree) {
      return;
    }

    try {
      // 计算当前树与新树之间的差异
      const delta = computeDelta(this.currentTree, newTree);
      
      // 如果没有差异，跳过
      if (!delta || Object.keys(delta).length === 0) {
        return;
      }

      const timelineEntry: TimelineEntry = {
        timestamp: Date.now(),
        event,
        delta
      };

      this.timeline.push(timelineEntry);
      
      // 检查是否超过最大条目数
      if (this.options.maxTimelineEntries && this.timeline.length > this.options.maxTimelineEntries) {
        this.timeline.shift(); // 移除最老的条目
        console.warn(`Timeline entries exceeded maximum (${this.options.maxTimelineEntries}), removing oldest entry`);
      }

      // 更新当前树状态
      this.currentTree = JSON.parse(JSON.stringify(newTree));

      this.emit('timeline-entry-added', timelineEntry);
      
    } catch (error) {
      console.error('Error recording tree change:', error);
      this.emit('error', error);
    }
  }

  /**
   * 记录用户交互事件（无需树变化）
   * 某些交互可能不会立即引起无障碍树变化，但仍值得记录
   */
  recordUserEvent(event: UserInteractionEvent): void {
    if (!this.isRecording) {
      return;
    }

    const timelineEntry: TimelineEntry = {
      timestamp: Date.now(),
      event,
      delta: {} // 空的 delta，表示没有树变化
    };

    this.timeline.push(timelineEntry);
    this.emit('user-event-recorded', timelineEntry);
  }

  /**
   * 获取当前录制状态
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
   * 将树结构扁平化为节点数组
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
}