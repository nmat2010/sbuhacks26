import Sprite from '../../../../../design/Sprite';

interface WelcomeProps {
  onNext: () => void;
}

export default function Welcome({ onNext }: WelcomeProps) {
  return (
    <div className="pg-welcome" style={{width:"100%",minHeight:"820px",display:"flex",flexDirection:"column",background:"#1a1214",color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"18px"}}>

      <div style={{height:"44px",background:"#0d0709",borderBottom:"4px solid #990000",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flex:"none"}}>
        <span className="h" style={{fontSize:"11px"}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>SETUP · 1 OF 7</span>
        <div style={{display:"flex",gap:"8px"}} aria-hidden="true">
          <span style={{width:"14px",height:"14px",background:"#f2b632"}}></span>
          <span style={{width:"14px",height:"14px",background:"#6fd27a"}}></span>
          <span style={{width:"14px",height:"14px",background:"#e5484d"}}></span>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"56px",alignItems:"center",justifyContent:"center",padding:"48px 32px",maxWidth:"1160px",width:"100%",boxSizing:"border-box",margin:"0 auto"}}>

        <div style={{flex:"1 1 280px",maxWidth:"360px",display:"flex",flexDirection:"column",alignItems:"center",gap:"20px"}}>
          <Sprite size={256} variant="idle" />
          <span className="h" style={{fontSize:"9px",color:"#c9b8a6"}}>SENSEI · IDLE · placeholder sprite</span>
        </div>

        <div style={{flex:"2 1 460px",maxWidth:"620px",display:"flex",flexDirection:"column",gap:"30px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"18px"}}>
            <h1 className="h" style={{margin:0,fontSize:"30px",color:"#f2b632",lineHeight:1.35}}>WOLFIE SENSEI</h1>
            <p style={{margin:0,fontSize:"22px",lineHeight:1.35}}>Learn faster with AI, without losing the muscle.</p>
            <p style={{margin:0,color:"#e0d2c2",lineHeight:1.4}}>I'm your training partner. I keep your semester on track, and I make sure you try first before you ask an AI for the answer.</p>
          </div>

          <div className="card" style={{padding:"24px 26px",display:"flex",flexDirection:"column",gap:"16px"}}>
            <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>HERE'S THE PLAN</span>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <span className="h" style={{width:"36px",height:"36px",background:"#c41e1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",flex:"none"}}>1</span>
              <span>Link your browser and Brightspace</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <span className="h" style={{width:"36px",height:"36px",background:"#c41e1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",flex:"none"}}>2</span>
              <span>Choose your powers, a semester goal and your shields</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              <span className="h" style={{width:"36px",height:"36px",background:"#c41e1e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",flex:"none"}}>3</span>
              <span>Start training: quests, XP and streaks</span>
            </div>
          </div>

          <div>
            <button type="button" className="btn gold" onClick={onNext}>START TRAINING</button>
          </div>
        </div>

      </div>

      <div style={{background:"#0d0709",padding:"20px 32px 28px",overflowX:"auto",flex:"none"}}>
        <div style={{display:"flex",alignItems:"flex-start",minWidth:"860px",maxWidth:"1100px",margin:"0 auto"}}>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#c41e1e",boxShadow:"0 0 0 4px #f5ecd9"}}></div>
            <span style={{fontSize:"14px",color:"#f5ecd9",fontWeight:600}}>Hello</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Extension</span>
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
