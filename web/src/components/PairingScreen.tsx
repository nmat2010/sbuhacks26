import { useState } from 'react';
import type { SyncMessage } from '@wolfie/shared';
import './PairingScreen.css';

interface PairingScreenProps {
  onPaired: (deviceId: string, secret: string) => void;
}

export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('iPad');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async () => {
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Please enter a 6-digit code');
      return;
    }

    setPairing(true);
    setError(null);

    try {
      // Try to discover desktop on LAN (default port 45679)
      const desktopUrl = `ws://${window.location.hostname}:45679`;
      const ws = new WebSocket(desktopUrl);

      ws.onopen = () => {
        console.log('[Pairing] Connected to desktop');

        // Send pairing request
        const message = {
          type: 'pair.request' as const,
          id: generateId(),
          ts: Date.now(),
          payload: {
            code,
            deviceName
          }
        };

        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        try {
          const message: SyncMessage = JSON.parse(event.data);

          if (message.type === 'pair.result') {
            if (message.payload.ok && message.payload.deviceId && message.payload.secret) {
              console.log('[Pairing] Paired successfully!');
              onPaired(message.payload.deviceId, message.payload.secret);
              ws.close();
            } else {
              setError(message.payload.reason || 'Pairing failed');
              setPairing(false);
              ws.close();
            }
          }
        } catch (err) {
          console.error('[Pairing] Failed to parse message:', err);
          setError('Invalid response from desktop');
          setPairing(false);
          ws.close();
        }
      };

      ws.onerror = () => {
        setError('Could not connect to desktop. Make sure Wolfie desktop app is running.');
        setPairing(false);
      };

      ws.onclose = () => {
        if (pairing) {
          setError('Connection closed unexpectedly');
          setPairing(false);
        }
      };
    } catch (err) {
      console.error('[Pairing] Error:', err);
      setError('Failed to connect to desktop');
      setPairing(false);
    }
  };

  return (
    <div className="pairing-screen">
      <div className="pairing-container">
        <div className="pairing-header">
          <div className="wolfie-logo">🐺</div>
          <h1>Wolfie Sensei</h1>
          <p>AI Study Companion</p>
        </div>

        <div className="pairing-card">
          <h2>Pair with Desktop</h2>
          <p className="pairing-instructions">
            Open Wolfie on your desktop and go to Settings → Sync → Generate Pairing Code.
            Then enter the 6-digit code below.
          </p>

          <div className="form-group">
            <label htmlFor="deviceName">Device Name</label>
            <input
              id="deviceName"
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="iPad, Tablet..."
              disabled={pairing}
              className="input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="code">Pairing Code</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              disabled={pairing}
              className="input code-input"
              maxLength={6}
              inputMode="numeric"
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <button
            className="btn btn-primary"
            onClick={handlePair}
            disabled={pairing || code.length !== 6}
          >
            {pairing ? 'Pairing...' : 'Pair Device'}
          </button>
        </div>

        <div className="pairing-footer">
          <p>© 2024 SBU - Stony Brook University</p>
        </div>
      </div>
    </div>
  );
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
