import { useState, useEffect } from 'react';
import Sprite from '../../../../../design/Sprite';

interface ConnectProps {
  onNext: () => void;
  onBack: () => void;
  data: any;
  updateData: (updates: any) => void;
}

function generatePairingCode(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I and O to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function Connect({ onNext, onBack, data, updateData }: ConnectProps) {
  const isConnected = data.extensionConnected;
  const [pairingCode, setPairingCode] = useState(generatePairingCode());
  const [timeLeft, setTimeLeft] = useState(5 * 60); // 5 minutes in seconds

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Code expired, generate new one
          setPairingCode(generatePairingCode());
          return 5 * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGetExtension = () => {
    // TODO: Replace with actual Chrome Web Store URL when extension is published
    window.open('https://chromewebstore.google.com/category/extensions', '_blank');
  };

  const handleNewCode = () => {
    setPairingCode(generatePairingCode());
    setTimeLeft(5 * 60);
  };

  // Demo: Auto-connect after 10 seconds (remove this in production)
  useEffect(() => {
    const demoTimer = setTimeout(() => {
      updateData({ extensionConnected: true });
    }, 10000);
    return () => clearTimeout(demoTimer);
  }, []);

  const codeDigits = pairingCode.split('');

  return (
    <div className="pg-connect" style={{width:"100%",minHeight:"820px",display:"flex",flexDirection:"column",background:"#1a1214",color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"18px"}}>

      <div style={{height:"44px",background:"#0d0709",borderBottom:"4px solid #990000",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flex:"none"}}>
        <span className="h" style={{fontSize:"11px"}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>SETUP · 2 OF 7</span>
        <div style={{display:"flex",gap:"8px"}} aria-hidden="true">
          <span style={{width:"14px",height:"14px",background:"#f2b632"}}></span>
          <span style={{width:"14px",height:"14px",background:"#6fd27a"}}></span>
          <span style={{width:"14px",height:"14px",background:"#e5484d"}}></span>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"48px",alignItems:"center",justifyContent:"center",padding:"48px 32px",maxWidth:"1180px",width:"100%",boxSizing:"border-box",margin:"0 auto"}}>

        <div style={{flex:"1 1 280px",maxWidth:"340px",display:"flex",flexDirection:"column",alignItems:"center",gap:"24px"}}>
          <Sprite size={192} variant="idle" />
          <div className="card2" style={{padding:"20px 22px",lineHeight:1.35}}>First, let's link your browser. The extension lets me read your Brightspace courses and notice when you wander onto a distracting site.</div>
          <span className="h" style={{fontSize:"9px",color:"#c9b8a6"}}>SENSEI · IDLE · placeholder sprite</span>
        </div>

        <div className="card" style={{flex:"2 1 520px",maxWidth:"700px",padding:"36px 36px 32px",display:"flex",flexDirection:"column",gap:"26px"}}>

          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            <h1 className="h" style={{margin:0,fontSize:"18px",color:"#f2b632"}}>CONNECT THE EXTENSION</h1>
            <p style={{margin:0,color:"#e0d2c2",lineHeight:1.35}}>Two quick steps. The extension and the app will stay paired on this computer.</p>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:"16px",flexWrap:"wrap"}}>
            <span className="h" style={{width:"40px",height:"40px",background:"#c41e1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",flex:"none"}}>1</span>
            <span style={{flex:"1 1 220px",fontWeight:600}}>Install the Wolfie Sensei extension in your browser</span>
            <button type="button" className="btn gold" style={{fontSize:"11px",padding:"14px 18px"}} onClick={handleGetExtension}>GET EXTENSION</button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <span className="h" style={{width:"40px",height:"40px",background:"#c41e1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",flex:"none"}}>2</span>
              <span style={{fontWeight:600}}>Type this code into the extension popup</span>
            </div>
            <div style={{display:"flex",gap:"14px",flexWrap:"wrap",padding:"8px 8px 8px 56px"}} role="img" aria-label={`Pairing code ${pairingCode.split('').join(' ')}`}>
              {codeDigits.map((digit, i) => (
                <div key={i} className="h" style={{width:"52px",height:"68px",background:"#0d0709",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 0 4px #f2b632",fontSize:"24px",color:"#f2b632"}}>
                  {digit}
                </div>
              ))}
            </div>
            <div style={{paddingLeft:"56px",color:"#c9b8a6",fontSize:"16px"}}>Code expires in {formatTime(timeLeft)} · <button type="button" onClick={handleNewCode} style={{background:"none",border:0,padding:0,color:"#f5ecd9",font:"inherit",textDecoration:"underline",cursor:"pointer"}}>new code</button></div>
          </div>

          <div className="card2" style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:"16px",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:"6px"}} aria-hidden="true">
              {isConnected ? (
                <span style={{width:"12px",height:"12px",background:"#6fd27a"}}></span>
              ) : (
                <>
                  <span className="blink" style={{width:"12px",height:"12px",background:"#f2a03a"}}></span>
                  <span className="blink" style={{width:"12px",height:"12px",background:"#f2a03a",animationDelay:".2s"}}></span>
                  <span className="blink" style={{width:"12px",height:"12px",background:"#f2a03a",animationDelay:".4s"}}></span>
                </>
              )}
            </div>
            <span style={{color: isConnected ? "#6fd27a" : "#f2a03a",fontWeight:600}}>
              {isConnected ? "Extension connected!" : "Waiting for the extension…"}
            </span>
            {!isConnected && (
              <span style={{color:"#c9b8a6",fontSize:"16px",marginLeft:"auto"}}>This turns green when paired.</span>
            )}
          </div>

          <button type="button" className="card2" style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px 20px",border:0,color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"17px",cursor:"pointer",textAlign:"left"}}>
            <span>Extension not showing up?</span>
            <span className="h" style={{fontSize:"14px",color:"#f2b632"}} aria-hidden="true">+</span>
          </button>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"16px",flexWrap:"wrap",marginTop:"6px"}}>
            <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
            <button type="button" className={isConnected ? "btn" : "btn off"} aria-disabled={!isConnected} onClick={isConnected ? onNext : undefined}>CONTINUE</button>
          </div>

        </div>
      </div>

      <div style={{background:"#0d0709",padding:"20px 32px 28px",overflowX:"auto",flex:"none"}}>
        <div style={{display:"flex",alignItems:"flex-start",minWidth:"860px",maxWidth:"1100px",margin:"0 auto"}}>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#f2b632",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#f2b632"}}>Hello</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#c41e1e",boxShadow:"0 0 0 4px #f5ecd9"}}></div>
            <span style={{fontSize:"14px",color:"#f5ecd9",fontWeight:600}}>Extension</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Brightspace</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Powers</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Goals</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Shields</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Train!</span>
          </div>
        </div>
      </div>

    </div>
  );
}
