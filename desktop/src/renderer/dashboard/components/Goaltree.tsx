import Sprite from '../../../../../design/Sprite';

export default function Goaltree() {
  return (
    <div className="pg-goaltree" style={{width: '100%', minHeight: '1160px', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px', display: 'flex', flexDirection: 'column'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>GOAL TREE</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch'}}>

        <nav aria-label="Main" style={{flex: '0 0 232px', width: '232px', maxWidth: '100%', background: '#0d0709', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box'}}>
          <button type="button" className="nav"><i></i>HOME</button>
          <button type="button" className="nav"><i></i>QUESTS</button>
          <button type="button" className="nav"><i></i>TO-DO</button>
          <button type="button" className="nav on" aria-current="page"><i></i>GOAL TREE</button>
          <button type="button" className="nav"><i></i>FOCUS</button>
          <button type="button" className="nav"><i></i>SHIELDS</button>
          <button type="button" className="nav"><i></i>SETTINGS</button>
          <div style={{marginTop: 'auto', paddingTop: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}>
            <Sprite size={88} variant="idle" />
            <span className="h" style={{fontSize: '9px', color: '#c9b8a6'}}>SENSEI · IDLE</span>
          </div>
        </nav>

        <main style={{flex: '999 1 560px', minWidth: 0, padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: '28px', boxSizing: 'border-box'}}>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap'}}>
            <h1 className="h" style={{margin: 0, fontSize: '20px', color: '#f2b632'}}>GOAL TREE</h1>
            <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}} role="group" aria-label="Goals"><button type="button" className="tab on" aria-pressed="true">Join a research lab</button><button type="button" className="tab">+ Add goal</button></div>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start'}}>

            <section className="card" style={{flex: '2 1 480px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px'}}>
              <div className="sel" style={{padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '13px', color: '#f2b632'}}>BOSS: JOIN A RESEARCH LAB</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>2 of 9 steps · target: Spring 2027</span></div>
                <div className="seg" role="img" aria-label="2 of 9 steps cleared"><span className="f"></span><span className="f"></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
              </div>

              <div className="ms">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px'}}>1 · FIND LABS THAT FIT</span><span style={{fontSize: '15px', color: '#6fd27a'}}>2 / 3</span></div>
                <div className="card2 a"><span className="chk d" aria-hidden="true"></span><span style={{flex: 1, color: '#c9b8a6', textDecoration: 'line-through'}}>Browse faculty pages in your department</span><span className="xp">+10 XP</span></div>
                <div className="card2 a"><span className="chk d" aria-hidden="true"></span><span style={{flex: 1, color: '#c9b8a6', textDecoration: 'line-through'}}>Shortlist 5 labs</span><span className="xp">+10 XP</span></div>
                <div className="sel a"><span className="chk" aria-hidden="true"></span><span style={{flex: 1, fontWeight: 600}}>Read one recent paper abstract per lab</span><span className="xp">+20 XP</span></div>
              </div>

              <div className="ms">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px'}}>2 · REACH OUT</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>0 / 3</span></div>
                <div className="card2 a"><span className="chk" aria-hidden="true"></span><span style={{flex: 1}}>Draft your first email in your own words</span><span className="xp">+20 XP</span></div>
                <div className="card2 a"><span className="chk" aria-hidden="true"></span><span style={{flex: 1}}>Send 5 emails</span><span className="xp">+30 XP</span></div>
                <div className="card2 a"><span className="chk" aria-hidden="true"></span><span style={{flex: 1}}>Book one conversation with a lab</span><span className="xp">+30 XP</span></div>
              </div>

              <div className="ms">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px', color: '#b9a898'}}>3 · PREP AND FOLLOW UP</span><span className="h" style={{fontSize: '9px', background: '#4a3a3d', color: '#e0d2c2', padding: '6px 8px'}}>LOCKED</span></div>
                <p style={{margin: 0, fontSize: '16px', color: '#c9b8a6', lineHeight: 1.35}}>Unlocks after your first reply. I'll build these steps from what the lab says.</p>
              </div>
            </section>

            <aside style={{flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '32px'}}>
              <div className="card" style={{padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
                <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>NEXT ACTION</span>
                <span style={{fontWeight: 600, lineHeight: 1.3}}>Read one recent paper abstract per lab</span>
                <p style={{margin: 0, fontSize: '16px', lineHeight: 1.4, color: '#e0d2c2'}}>Why: knowing what a lab actually works on makes your first email specific, and specific emails get answered more often.</p>
                <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}><button type="button" className="btn" style={{fontSize: '10px', padding: '12px 14px'}}>START FOCUS</button><button type="button" className="btn ghost" style={{fontSize: '10px', padding: '12px 14px'}}>MARK DONE</button></div>
              </div>

              <div className="card" style={{padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
                <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>RESOURCES FOR THIS STEP</span>
                <div className="card2" style={{padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px'}}><span style={{fontWeight: 600}}>Faculty directory</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Your shortlisted labs, with links</span></div>
                <div className="card2" style={{padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px'}}><span style={{fontWeight: 600}}>How to skim a paper</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Abstract, figures, conclusion, in that order</span></div>
                <div className="card2" style={{padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px'}}><span style={{fontWeight: 600}}>Questions to jot down</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Two per paper, for your email</span></div>
                <span style={{fontSize: '15px', color: '#c9b8a6'}}>Sample resources. Real links come from the plan Wolfie builds.</span>
              </div>

              <div className="card2" style={{padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <span style={{lineHeight: 1.35}}>Plan feels off? Tell Wolfie what changed and I'll rebuild the steps.</span>
                <button type="button" className="btn ghost" style={{fontSize: '10px', padding: '12px 14px', alignSelf: 'flex-start'}}>REBUILD PLAN</button>
              </div>
            </aside>

          </div>

        </main>
      </div>
    </div>
  );
}
