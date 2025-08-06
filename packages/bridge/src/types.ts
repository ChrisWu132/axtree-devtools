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

export type BridgeMessage = SnapshotMsg | UserEvtMsg | DeltaMsg | HighlightMsg;

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
}