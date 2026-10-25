import { useState } from 'react';

interface PowersScreenProps {
  onNext: (data: {
    overlayEnabled: boolean;
    screenRecordingEnabled: boolean;
    voiceEnabled: boolean;
  }) => void;
  onBack: () => void;
}

export function PowersScreen({ onNext, onBack }: PowersScreenProps) {
  // All powers start disabled - user must explicitly enable them
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [screenRecordingEnabled, setScreenRecordingEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const handleOverlayToggle = async () => {
    if (!overlayEnabled) {
      try {
        // Request accessibility permission - this will show the system dialog or open System Settings
        const status = await window.electronAPI.invoke('permissions-request', 'accessibility');
        // Only enable if permission was granted
        if (status.accessibility === 'granted') {
          setOverlayEnabled(true);
        }
      } catch (error) {
        console.error('[PowersScreen] Failed to request accessibility permission:', error);
      }
    } else {
      // Disable at app level
      setOverlayEnabled(false);
    }
  };

  const handleScreenRecordingToggle = async () => {
    if (!screenRecordingEnabled) {
      try {
        // Request screen recording permission - this opens System Settings on macOS
        await window.electronAPI.invoke('permissions-request', 'screen');
        // Check if permission was granted (user may need to enable in settings and come back)
        const status = await window.electronAPI.invoke('permissions-get');
        if (status.screen === 'granted') {
          setScreenRecordingEnabled(true);
        }
      } catch (error) {
        console.error('[PowersScreen] Failed to request screen recording permission:', error);
      }
    } else {
      // Disable at app level
      setScreenRecordingEnabled(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (!voiceEnabled) {
      try {
        // Request microphone permission - this will show the system dialog
        const status = await window.electronAPI.invoke('permissions-request', 'microphone');
        // Only enable if permission was granted
        if (status.microphone === 'granted') {
          setVoiceEnabled(true);
        }
      } catch (error) {
        console.error('[PowersScreen] Failed to request microphone permission:', error);
      }
    } else {
      // Disable at app level
      setVoiceEnabled(false);
    }
  };

  const powersLocked = [!overlayEnabled, !screenRecordingEnabled, !voiceEnabled].filter(Boolean).length;

  return (
    <div className="pg-permissions" style={{width: '100%', minHeight: '800px', display: 'flex', flexDirection: 'column', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>SETUP · 4 OF 7</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: '1', display: 'flex', flexDirection: 'column', gap: '36px', padding: '44px 32px', maxWidth: '1160px', width: '100%', boxSizing: 'border-box', margin: '0 auto'}}>

        <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
          <h1 className="h" style={{margin: '0', fontSize: '20px', color: '#f2b632'}}>UNLOCK YOUR POWERS</h1>
          <p style={{margin: '0', color: '#e0d2c2', lineHeight: '1.35', maxWidth: '720px'}}>Each power does one job. You choose which to turn on, and you can change it any time. Skipped powers stay greyed out in the app.</p>
        </div>

        <div style={{display: 'flex', flexWrap: 'wrap', gap: '36px', alignItems: 'stretch'}}>

          <div className="card" style={{flex: '1 1 300px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="1" y="3" width="14" height="10" fill="#f5ecd9"/><rect x="2" y="4" width="12" height="8" fill="#1a1214"/><rect x="3" y="5" width="5" height="2" fill="#f2b632"/><rect x="9" y="8" width="4" height="3" fill="#c41e1e"/></svg>
              <span className="h" style={{fontSize: '9px', background: overlayEnabled ? '#6fd27a' : '#4a3a3d', color: overlayEnabled ? '#0d0709' : '#e0d2c2', padding: '8px 10px'}}>
                {overlayEnabled ? 'ENABLED' : 'OFF'}
              </span>
            </div>
            <h2 className="h" style={{margin: '0', fontSize: '14px'}}>OVERLAY</h2>
            <p style={{margin: '0', lineHeight: '1.35', color: '#e0d2c2'}}>Lets Wolfie appear on top of other windows to warn you, gate a site, or cheer you on.</p>
            <div className="card2" style={{padding: '12px 14px', fontSize: '16px', lineHeight: '1.3', color: '#e0d2c2'}}><span style={{color: '#f2b632', fontWeight: '600'}}>Data: </span>[PLACEHOLDER: state exactly what the overlay reads, e.g. active window title and URL only.]</div>
            <div style={{marginTop: 'auto'}}><button type="button" className="btn" style={{width: '100%'}} onClick={handleOverlayToggle}>{overlayEnabled ? 'DISABLE OVERLAY' : 'ENABLE OVERLAY'}</button></div>
          </div>

          <div className="card" style={{flex: '1 1 300px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="1" y="2" width="14" height="9" fill="#f5ecd9"/><rect x="2" y="3" width="12" height="7" fill="#1a1214"/><rect x="7" y="5" width="2" height="3" fill="#c41e1e"/><rect x="6" y="11" width="4" height="2" fill="#f5ecd9"/><rect x="4" y="13" width="8" height="1" fill="#f5ecd9"/></svg>
              <span className="h" style={{fontSize: '9px', background: screenRecordingEnabled ? '#6fd27a' : '#4a3a3d', color: screenRecordingEnabled ? '#0d0709' : '#e0d2c2', padding: '8px 10px'}}>
                {screenRecordingEnabled ? 'ENABLED' : 'OFF'}
              </span>
            </div>
            <h2 className="h" style={{margin: '0', fontSize: '14px'}}>SCREEN RECORDING</h2>
            <p style={{margin: '0', lineHeight: '1.35', color: '#e0d2c2'}}>Lets Wolfie see what you're working on so it can tell studying from drifting.</p>
            <div className="card2" style={{padding: '12px 14px', fontSize: '16px', lineHeight: '1.3', color: '#e0d2c2'}}><span style={{color: '#f2b632', fontWeight: '600'}}>Data: </span>[PLACEHOLDER: processed on this computer or sent out? Saved or discarded?]</div>
            <div style={{marginTop: 'auto'}}><button type="button" className="btn" style={{width: '100%'}} onClick={handleScreenRecordingToggle}>{screenRecordingEnabled ? 'DISABLE SCREEN RECORDING' : 'ENABLE SCREEN RECORDING'}</button></div>
          </div>

          <div className="card" style={{flex: '1 1 300px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="64" height="64" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="6" y="1" width="4" height="8" fill="#f5ecd9"/><rect x="4" y="6" width="1" height="4" fill="#f5ecd9"/><rect x="11" y="6" width="1" height="4" fill="#f5ecd9"/><rect x="5" y="10" width="6" height="1" fill="#f5ecd9"/><rect x="7" y="11" width="2" height="3" fill="#f5ecd9"/><rect x="5" y="14" width="6" height="1" fill="#f5ecd9"/></svg>
              <span className="h" style={{fontSize: '9px', background: voiceEnabled ? '#6fd27a' : '#4a3a3d', color: voiceEnabled ? '#0d0709' : '#e0d2c2', padding: '8px 10px'}}>
                {voiceEnabled ? 'ENABLED' : 'OFF'}
              </span>
            </div>
            <h2 className="h" style={{margin: '0', fontSize: '14px'}}>VOICE</h2>
            <p style={{margin: '0', lineHeight: '1.35', color: '#e0d2c2'}}>Lets you talk to Wolfie: say what you tried, ask for the next step, log a win.</p>
            <div className="card2" style={{padding: '12px 14px', fontSize: '16px', lineHeight: '1.3', color: '#e0d2c2'}}><span style={{color: '#f2b632', fontWeight: '600'}}>Data: </span>[PLACEHOLDER: when is the mic live? push-to-talk or always on?]</div>
            <div style={{marginTop: 'auto'}}><button type="button" className="btn" style={{width: '100%'}} onClick={handleVoiceToggle}>{voiceEnabled ? 'DISABLE VOICE' : 'ENABLE VOICE'}</button></div>
          </div>

        </div>

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
          <div style={{display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap'}}>
            <span style={{color: '#c9b8a6', fontSize: '16px'}}>
              {powersLocked > 0 ? `${powersLocked} power${powersLocked > 1 ? 's' : ''} still locked` : 'All powers enabled'}
            </span>
            <button type="button" className="btn" onClick={() => onNext({ overlayEnabled, screenRecordingEnabled, voiceEnabled })}>CONTINUE</button>
          </div>
        </div>

      </div>

      <div style={{background: '#0d0709', padding: '20px 32px 28px', overflowX: 'auto', flex: 'none'}}>
        <div style={{display: 'flex', alignItems: 'flex-start', minWidth: '860px', maxWidth: '1100px', margin: '0 auto'}}>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Hello</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Extension</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Brightspace</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#c41e1e', boxShadow: '0 0 0 4px #f5ecd9'}}></div><span style={{fontSize: '14px', color: '#f5ecd9', fontWeight: '600'}}>Powers</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Goals</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Shields</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Train!</span></div>
        </div>
      </div>

    </div>
  );
}
