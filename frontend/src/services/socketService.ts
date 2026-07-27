import { io, Socket } from 'socket.io-client';
import { EventType, BroadcastEnvelope, SyncCompletePayload, SocketErrorPayload } from '@/types/event';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

type EventHandler = (envelope: BroadcastEnvelope) => void;

class SocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<EventType, EventHandler[]> = new Map();
  private syncCompleteHandler: ((payload: SyncCompletePayload) => void) | null = null;
  private errorHandler: ((error: SocketErrorPayload) => void) | null = null;
  private connectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Reuse the socket if it already exists but is reconnecting
    if (this.socket) {
      this.socket.connect();
      return;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected:', this.socket?.id);
      if (this.connectHandler) this.connectHandler();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('[Socket.IO] Disconnected:', reason);
      if (this.disconnectHandler) this.disconnectHandler();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[Socket.IO] Connection error:', error.message);
    });

    // Listen for all comment event types
    Object.values(EventType).forEach((eventType) => {
      this.socket?.on(eventType, (envelope: BroadcastEnvelope) => {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
          handlers.forEach((handler) => handler(envelope));
        }
      });
    });

    // Sync completion
    this.socket.on('sync_complete', (payload: SyncCompletePayload) => {
      console.log('[Socket.IO] Sync complete, latestEventId:', payload.latestEventId);
      if (this.syncCompleteHandler) {
        this.syncCompleteHandler(payload);
      }
    });

    // Socket-level errors from the server
    this.socket.on('socket_error', (error: SocketErrorPayload) => {
      console.error('[Socket.IO] Server error:', error.message);
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventHandlers.clear();
    this.syncCompleteHandler = null;
    this.errorHandler = null;
    this.connectHandler = null;
    this.disconnectHandler = null;
  }

  sync(lastEventId: number): void {
    if (!this.socket?.connected) {
      console.warn('[Socket.IO] Cannot sync: socket not connected');
      return;
    }
    console.log('[Socket.IO] Requesting sync from eventId:', lastEventId);
    this.socket.emit('sync', { lastEventId });
  }

  on(eventType: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType) ?? [];
    if (!handlers.includes(handler)) {
      handlers.push(handler);
      this.eventHandlers.set(eventType, handlers);
    }
  }

  off(eventType: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const filtered = handlers.filter((h) => h !== handler);
      if (filtered.length > 0) {
        this.eventHandlers.set(eventType, filtered);
      } else {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  onSyncComplete(handler: (payload: SyncCompletePayload) => void): void {
    this.syncCompleteHandler = handler;
  }

  onError(handler: (error: SocketErrorPayload) => void): void {
    this.errorHandler = handler;
  }

  onConnect(handler: () => void): void {
    this.connectHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
