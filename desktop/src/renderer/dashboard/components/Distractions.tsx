import { useState } from 'react';

interface DistractionsProps {
  onNext: () => void;
  onBack: () => void;
  data: any;
  updateData: (updates: any) => void;
}

type ShieldMode = 'WARN' | 'GATE' | 'BLOCK';

interface Shield {
  id: string;
  name: string;
  mode: ShieldMode;
  isAI: boolean;
  type: 'website' | 'desktop app';
}

export default function Distractions({ onNext, onBack, data, updateData }: DistractionsProps) {
  const [shields, setShields] = useState<Shield[]>(data.shields || [
    { id: 'chatgpt', name: 'chatgpt.com', mode: 'GATE', isAI: true, type: 'website' },
    { id: 'claude', name: 'claude.ai', mode: 'GATE', isAI: true, type: 'website' },
    { id: 'youtube', name: 'youtube.com', mode: 'WARN', isAI: false, type: 'website' },
    { id: 'instagram', name: 'instagram.com', mode: 'WARN', isAI: false, type: 'website' },
    { id: 'tiktok', name: 'tiktok.com', mode: 'BLOCK', isAI: false, type: 'website' },
    { id: 'discord', name: 'Discord', mode: 'WARN', isAI: false, type: 'desktop app' },
  ]);

  const handleModeChange = (shieldId: string, newMode: ShieldMode) => {
    const updatedShields = shields.map(shield =>
      shield.id === shieldId ? { ...shield, mode: newMode } : shield
    );
    setShields(updatedShields);
    updateData({ shields: updatedShields });
  };

  const handleQuickAdd = (name: string) => {
    const newShield: Shield = {
      id: name.toLowerCase(),
      name: `${name.toLowerCase()}.com`,
      mode: 'WARN',
      isAI: false,
      type: 'website'
    };
    const updatedShields = [...shields, newShield];
    setShields(updatedShields);
    updateData({ shields: updatedShields });
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  return (
    <div className="pg-distractions" style={{width: '100%', minHeight: '860px', display: 'flex', flexDirection: 'column', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>SETUP · 6 OF 7</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: '1', display: 'flex', flexWrap: 'wrap', gap: '44px', alignItems: 'flex-start', justifyContent: 'center', padding: '44px 32px', maxWidth: '1220px', width: '100%', boxSizing: 'border-box', margin: '0 auto'}}>

        <div className="card" style={{flex: '2 1 520px', maxWidth: '720px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '22px'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <h1 className="h" style={{margin: '0', fontSize: '16px', color: '#f2b632'}}>SET YOUR SHIELDS</h1>
            <p style={{margin: '0', color: '#e0d2c2', lineHeight: '1.35'}}>List the sites and apps that pull you off track. For each one, pick how Wolfie should react.</p>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>

            {shields.map(shield => (
              <div key={shield.id} className="card2" style={{padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'}}>
                <span className="tile" aria-hidden="true">{getInitial(shield.name)}</span>
                <div style={{flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '2px'}}>
                  <span style={{fontWeight: '600', display: 'flex', gap: '8px', alignItems: 'center'}}>
                    {shield.name}
                    {shield.isAI && <span className="tag">AI</span>}
                  </span>
                  <span style={{fontSize: '15px', color: '#c9b8a6'}}>{shield.type}</span>
                </div>
                <div className="seg" role="group" aria-label={`${shield.name} mode`}>
                  <button
                    type="button"
                    className={shield.mode === 'WARN' ? 'warn' : ''}
                    aria-pressed={shield.mode === 'WARN'}
                    onClick={() => handleModeChange(shield.id, 'WARN')}
                  >WARN</button>
                  <button
                    type="button"
                    className={shield.mode === 'GATE' ? 'gate' : ''}
                    aria-pressed={shield.mode === 'GATE'}
                    onClick={() => handleModeChange(shield.id, 'GATE')}
                  >GATE</button>
                  <button
                    type="button"
                    className={shield.mode === 'BLOCK' ? 'block' : ''}
                    aria-pressed={shield.mode === 'BLOCK'}
                    onClick={() => handleModeChange(shield.id, 'BLOCK')}
                  >BLOCK</button>
                </div>
              </div>
            ))}

          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            <button type="button" className="btn gold" style={{alignSelf: 'flex-start'}}>+ ADD SITE OR APP</button>
            <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center'}}>
              <span style={{color: '#c9b8a6', fontSize: '16px'}}>Quick add:</span>
              <button type="button" className="card2" style={{border: '0', padding: '6px 12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '16px', cursor: 'pointer'}} onClick={() => handleQuickAdd('Reddit')}>Reddit</button>
              <button type="button" className="card2" style={{border: '0', padding: '6px 12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '16px', cursor: 'pointer'}} onClick={() => handleQuickAdd('Netflix')}>Netflix</button>
              <button type="button" className="card2" style={{border: '0', padding: '6px 12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '16px', cursor: 'pointer'}} onClick={() => handleQuickAdd('Twitch')}>Twitch</button>
              <button type="button" className="card2" style={{border: '0', padding: '6px 12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '16px', cursor: 'pointer'}} onClick={() => handleQuickAdd('X')}>X</button>
            </div>
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginTop: '4px'}}>
            <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
            <button type="button" className="btn" onClick={onNext}>FINISH SETUP</button>
          </div>
        </div>

        <div style={{flex: '1 1 320px', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '28px'}}>

          <div className="card" style={{padding: '26px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
            <h2 className="h" style={{margin: '0', fontSize: '13px', color: '#f2b632'}}>WHAT EACH MODE DOES</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}><span className="h" style={{fontSize: '10px', color: '#f2a03a'}}>WARN</span><span style={{lineHeight: '1.35', color: '#e0d2c2'}}>Wolfie pops up in the overlay. You can keep going, and I'll note it.</span></div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}><span className="h" style={{fontSize: '10px', color: '#f2b632'}}>GATE</span><span style={{lineHeight: '1.35', color: '#e0d2c2'}}>Tell me what you've tried first, or run a 5-minute attempt timer. Then the site unlocks.</span></div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}><span className="h" style={{fontSize: '10px', color: '#e5484d'}}>BLOCK</span><span style={{lineHeight: '1.35', color: '#e0d2c2'}}>Closed during focus sessions. No pop-up, no bargaining.</span></div>
          </div>

          <div className="card2" style={{padding: '20px 22px', display: 'flex', gap: '16px', alignItems: 'flex-start'}}>
            <span style={{width: '22px', height: '22px', background: '#f2b632', flex: 'none', marginTop: '2px'}} aria-hidden="true"></span>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}><span style={{fontWeight: '600'}}>AI sites start on GATE</span><span style={{fontSize: '16px', lineHeight: '1.35', color: '#e0d2c2'}}>The goal isn't zero AI. It's trying first, so the skill stays yours. Switch any site to BLOCK if you'd rather.</span></div>
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
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Powers</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Goals</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#c41e1e', boxShadow: '0 0 0 4px #f5ecd9'}}></div><span style={{fontSize: '14px', color: '#f5ecd9', fontWeight: '600'}}>Shields</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Train!</span></div>
        </div>
      </div>

    </div>
  );
}
