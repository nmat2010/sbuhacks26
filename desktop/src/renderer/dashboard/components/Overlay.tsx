import Sprite from '../../../../../design/Sprite';

export default function Overlay() {
  return (
    <div className="pg-overlay" style={{width: '100%', minHeight: '800px', position: 'relative', display: 'flex', flexDirection: 'column', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px', overflow: 'hidden'}}>

      <div aria-hidden="true" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', opacity: '.5'}}>
        <div style={{height: '48px', background: '#3a2328', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px'}}><span style={{width: '12px', height: '12px', background: '#5a3a41'}}></span><span style={{width: '12px', height: '12px', background: '#5a3a41'}}></span><span style={{width: '12px', height: '12px', background: '#5a3a41'}}></span><div style={{flex: 1, maxWidth: '520px', height: '24px', background: '#1a1214', marginLeft: '16px'}}></div></div>
        <div style={{flex: 1, padding: '40px 64px', display: 'flex', flexDirection: 'column', gap: '20px'}}><div style={{width: '42%', height: '28px', background: '#3a2328'}}></div><div style={{width: '78%', height: '16px', background: '#2a1a1e'}}></div><div style={{width: '70%', height: '16px', background: '#2a1a1e'}}></div><div style={{width: '74%', height: '16px', background: '#2a1a1e'}}></div><div style={{width: '50%', height: '16px', background: '#2a1a1e'}}></div></div>
      </div>

      <div aria-hidden="true" style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: '#0d0709', opacity: '.62'}}></div>

      <div style={{position: 'relative', flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '56px', padding: '56px 32px'}}>

        <div style={{flex: '1 1 520px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
          <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>GATE · claude.ai</span>
          <div className="card" style={{padding: '32px', display: 'flex', flexDirection: 'column', gap: '22px'}}>
            <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
              <Sprite size={96} variant="idle" />
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}><h1 className="h" style={{margin: 0, fontSize: '16px', color: '#f2b632'}}>HOLD UP, TRAINEE.</h1><span style={{lineHeight: 1.35, color: '#e0d2c2'}}>Your Lab 4 report for ESE 271 is due Tuesday. What have you tried so far?</span></div>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <label htmlFor="tried" style={{color: '#c9b8a6', fontSize: '16px'}}>One or two sentences is enough</label>
              <div id="tried" style={{background: '#0d0709', boxShadow: '0 0 0 4px #f2b632', padding: '14px 16px', minHeight: '96px', lineHeight: 1.35, color: '#e0d2c2'}}>I set up the circuit equations for part 1 and got stuck on the second loop</div>
              <span style={{fontSize: '15px', color: '#c9b8a6'}}>Unlocks once you've written 20+ characters.</span>
            </div>
            <div style={{display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center'}}>
              <button type="button" className="btn gold">UNLOCK 15 MIN</button>
              <button type="button" className="btn ghost">5-MIN TRY TIMER</button>
              <button type="button" style={{background: 'none', border: 0, color: '#f5ecd9', font: 'inherit', fontSize: '17px', textDecoration: 'underline', cursor: 'pointer', padding: '8px'}}>Close tab</button>
            </div>
          </div>
        </div>

        <div style={{flex: '1 1 300px', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '16px', alignSelf: 'flex-start'}}>
          <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>WARN · youtube.com</span>
          <div className="card" style={{padding: '20px', display: 'flex', gap: '16px', alignItems: 'center'}}>
            <Sprite size={56} variant="plain" />
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}><span style={{lineHeight: 1.3}}>Sensei is watching. Is this on purpose?</span><div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}><button type="button" className="btn ghost" style={{fontSize: '9px', padding: '10px 12px'}}>CONTINUE</button><button type="button" className="btn" style={{fontSize: '9px', padding: '10px 12px'}}>BACK TO WORK</button></div></div>
          </div>
          <p style={{margin: 0, fontSize: '15px', lineHeight: 1.35, color: '#c9b8a6'}}>Warn is a small corner pop-up. Gate takes over the screen. Block closes the tab.</p>
        </div>

      </div>
    </div>
  );
}
