import { AXNodeTree } from '@ax/core';

export interface SnapshotMsg {
  type: 'snapshot';
  payload: AXNodeTree;
}

export interface UserEvtMsg {
  type: 'userEvent';
  payload: CDPInputEvent | DomEvent;
}

export interface DeltaMsg {
  type: 'delta';
  payload: JsonDiffPatchDelta;
}

export interface HighlightMsg {
  type: 'highlight';
  payload: {
    backendNodeId: number;
  };
}

export interface RecordingStatusMsg {
  type: 'recordingStatus';
  payload: {
    isRecording: boolean;
    startTime?: number;
    timelineLength: number;
    duration?: number;
  };
}

export interface RecordingStoppedMsg {
  type: 'recordingStopped';
  payload: any; // Recording object
}

export type BridgeMessage = SnapshotMsg | UserEvtMsg | DeltaMsg | HighlightMsg | RecordingStatusMsg | RecordingStoppedMsg;

export interface CDPInputEvent {
  type: string;
  timestamp: number;
  x?: number;
  y?: number;
  button?: string;
  clickCount?: number;
}

export interface DomEvent {
  type: string;
  target: {
    backendNodeId: number;
    tagName: string;
  };
  timestamp: number;
}

export interface JsonDiffPatchDelta {
  [key: string]: any;
}

export interface BridgeOptions {
  port: number;
  host?: string;
  cdpPort?: number;
  cdpHost?: string;
  wsUrl?: string; // Direct WebSocket URL
  recordingMode?: boolean; // Enable recording functionality
}