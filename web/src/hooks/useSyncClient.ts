import { useState, useEffect, useRef, useCallback } from 'react';
import type { SyncMessage, PlanSnapshotType, StreakSnapshotType, HintResponseSchema } from '@wolfie/shared';

interface SyncClient {
  sendHintRequest: (question: string, context: any) => Promise<void>;
  plan: PlanSnapshotType | null;
  streak: StreakSnapshotType | null;
  lastHintResponse: HintResponseSchema | null;
}

export function useSyncClient(deviceId: string | null, secret: string | null) {
  const [connected, setConnected] = useState(false);
  const [plan, setPlan] = useState<PlanSnapshotType | null>(null);
  const [streak, setStreak] = useState<StreakSnapshotType | null>(null);
  const [lastHintResponse, setLastHintResponse] = useState<HintResponseSchema | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!deviceId || !secret) return;

    // Try to discover desktop on LAN (default port 45679)
    const desktopUrl = `ws://${window.location.hostname}:45679`;

    const ws = new WebSocket(desktopUrl);

    ws.onopen = () => {
      console.log('[Sync] Connected to desktop');
    };

    ws.onmessage = async (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'auth.challenge':
            // Compute HMAC and respond
            const hmac = await computeHMAC(secret, message.nonce);
            ws.send(JSON.stringify({
              type: 'auth.hello',
              deviceId,
              hmac
            }));
            break;

          case 'auth.result':
            if (message.ok) {
              console.log('[Sync] Authenticated successfully');
              setConnected(true);
            } else {
              console.error('[Sync] Auth failed:', message.reason);
              ws.close();
            }
            break;

          case 'plan.snapshot':
            setPlan(message);
            break;

          case 'streak.snapshot':
            setStreak(message);
            break;

          case 'hint.response':
            setLastHintResponse(message.response);
            break;

          case 'hint.error':
            console.error('[Sync] Hint error:', message.message);
            break;

          default:
            console.log('[Sync] Received:', message.type);
        }
      } catch (error) {
        console.error('[Sync] Failed to handle message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Sync] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Sync] Disconnected');
      setConnected(false);

      // Reconnect after 5 seconds
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 5000);
    };

    wsRef.current = ws;
  }, [deviceId, secret]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendHintRequest = useCallback(async (question: string, context: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to desktop');
    }

    const message: SyncMessage = {
      type: 'hint.request',
      requestId: generateId(),
      question,
      context,
      inputMode: 'handwriting' as const,
      source: 'web' as const,
      assessment: false
    };

    wsRef.current.send(JSON.stringify(message));
  }, []);

  const sync: SyncClient = {
    sendHintRequest,
    plan,
    streak,
    lastHintResponse
  };

  return { connected, sync };
}

// Helper to compute HMAC-SHA256
async function computeHMAC(secret: string, nonce: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(nonce)
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
