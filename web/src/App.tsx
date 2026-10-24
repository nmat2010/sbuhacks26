import { useState, useEffect } from 'react';
import { PairingScreen } from './components/PairingScreen';
import { NotebookScreen } from './components/NotebookScreen';
import { useSyncClient } from './hooks/useSyncClient';
import './App.css';

function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const { connected, sync } = useSyncClient(deviceId, secret);

  useEffect(() => {
    // Load paired device from localStorage
    const savedDeviceId = localStorage.getItem('wolfie_device_id');
    const savedSecret = localStorage.getItem('wolfie_secret');

    if (savedDeviceId && savedSecret) {
      setDeviceId(savedDeviceId);
      setSecret(savedSecret);
    }
  }, []);

  const handlePaired = (newDeviceId: string, newSecret: string) => {
    setDeviceId(newDeviceId);
    setSecret(newSecret);
    localStorage.setItem('wolfie_device_id', newDeviceId);
    localStorage.setItem('wolfie_secret', newSecret);
  };

  const handleUnpair = () => {
    setDeviceId(null);
    setSecret(null);
    localStorage.removeItem('wolfie_device_id');
    localStorage.removeItem('wolfie_secret');
  };

  if (!deviceId || !secret) {
    return <PairingScreen onPaired={handlePaired} />;
  }

  return (
    <NotebookScreen
      connected={connected}
      sync={sync}
      onUnpair={handleUnpair}
    />
  );
}

export default App;
