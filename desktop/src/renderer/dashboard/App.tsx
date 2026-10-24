import { useState, useEffect } from 'react';

function App() {
  const [pingResult, setPingResult] = useState<string>('');

  useEffect(() => {
    // Test IPC communication
    window.electronAPI.ping().then(result => {
      setPingResult(result);
    });
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Wolfie Sensei Dashboard</h1>
      <p>Welcome to Wolfie Sensei - your study companion!</p>

      <div style={{
        marginTop: '20px',
        padding: '10px',
        backgroundColor: '#f0f0f0',
        borderRadius: '5px'
      }}>
        <h3>System Status</h3>
        <p>IPC Test: {pingResult || 'Testing...'}</p>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h2>Quick Start</h2>
        <ul>
          <li>Configure your goals and semester info</li>
          <li>Start a study session</li>
          <li>Let Wolfie help when you get stuck</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
