import Sprite from '../../../../../design/Sprite';

export default function Dashboard() {
  return (
    <div className="pg-dashboard" style={{width: '100%', minHeight: '1120px', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px', display: 'flex', flexDirection: 'column'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>HOME</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch'}}>

        <nav aria-label="Main" style={{flex: '0 0 232px', width: '232px', maxWidth: '100%', background: '#0d0709', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box'}}>
          <button type="button" className="nav on"><i></i>HOME</button>
          <button type="button" className="nav"><i></i>QUESTS</button>
          <button type="button" className="nav"><i></i>TO-DO</button>
          <button type="button" className="nav"><i></i>GOAL TREE</button>
          <button type="button" className="nav"><i></i>FOCUS</button>
          <button type="button" className="nav"><i></i>SHIELDS</button>
          <button type="button" className="nav"><i></i>SETTINGS</button>
          <div style={{marginTop: 'auto', paddingTop: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}>
            <Sprite size={88} variant="idle" />
            <span className="h" style={{fontSize: '9px', color: '#c9b8a6'}}>SENSEI · IDLE</span>
          </div>
        </nav>

        <main style={{flex: '999 1 560px', minWidth: 0, padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: '32px', boxSizing: 'border-box'}}>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap'}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <h1 className="h" style={{margin: 0, fontSize: '20px', color: '#f2b632'}}>TODAY'S TRAINING</h1>
              <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}><span className="card2" style={{padding: '4px 12px', fontSize: '16px'}}>Fall 2026</span><span className="card2" style={{padding: '4px 12px', fontSize: '16px'}}>5 courses</span><span className="card2" style={{padding: '4px 12px', fontSize: '16px', color: '#6fd27a'}}>Brightspace synced</span></div>
            </div>
            <button type="button" className="btn gold">START FOCUS SESSION</button>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '32px'}}>

            <div className="card" style={{flex: '1 1 260px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>LEVEL</span>
              <div style={{display: 'flex', alignItems: 'baseline', gap: '12px'}}><span className="h" style={{fontSize: '26px', color: '#f2b632'}}>4</span><span style={{fontWeight: 600}}>Pup Scholar</span></div>
              <div className="seg g" role="img" aria-label="340 of 500 XP"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span><span></span></div>
              <span style={{fontSize: '15px', color: '#c9b8a6'}}>340 / 500 XP</span>
            </div>

            <div className="card" style={{flex: '1 1 260px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>STREAK</span>
              <div style={{display: 'flex', alignItems: 'baseline', gap: '12px'}}><span className="h" style={{fontSize: '26px', color: '#f2b632'}}>6</span><span style={{fontWeight: 600}}>days</span></div>
              <div style={{display: 'flex', gap: '6px'}} role="img" aria-label="Last 7 days: 6 done"><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#f2b632'}}></span><span style={{width: '22px', height: '22px', background: '#5a3a41'}}></span></div>
              <span style={{fontSize: '15px', color: '#c9b8a6'}}>Do one quest today to keep it</span>
            </div>

            <div className="card" style={{flex: '2 1 340px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>MENTAL MUSCLE · SAMPLE DATA</span>
              <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{width: '116px', flex: 'none', fontSize: '16px'}}>Recall</span><div className="seg b" style={{flex: 1}} role="img" aria-label="Recall 6 of 10"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span><span></span><span></span></div></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{width: '116px', flex: 'none', fontSize: '16px'}}>Focus</span><div className="seg b" style={{flex: 1}} role="img" aria-label="Focus 7 of 10"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span><span></span></div></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{width: '116px', flex: 'none', fontSize: '16px'}}>Independence</span><div className="seg b" style={{flex: 1}} role="img" aria-label="Independence 4 of 10"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>
            </div>

          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start'}}>

            <section className="card" style={{flex: '2 1 420px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <h2 className="h" style={{margin: '0 0 4px', fontSize: '13px', color: '#f2b632'}}>QUESTS FOR TODAY</h2>
              <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><div style={{flex: '1 1 200px', display: 'flex', flexDirection: 'column'}}><span>Lab 4 report</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>ESE 271 · due Tue Oct 27</span></div><span className="src">BRIGHTSPACE</span><span className="xp">+40 XP</span></div>
              <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><div style={{flex: '1 1 200px', display: 'flex', flexDirection: 'column'}}><span>Problem set 6</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>AMS 261 · due Wed Oct 28</span></div><span className="src">BRIGHTSPACE</span><span className="xp">+30 XP</span></div>
              <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><div style={{flex: '1 1 200px', display: 'flex', flexDirection: 'column'}}><span>Project milestone</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>CSE 220 · due Fri Oct 30</span></div><span className="src">BRIGHTSPACE</span><span className="xp">+40 XP</span></div>
              <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><div style={{flex: '1 1 200px', display: 'flex', flexDirection: 'column'}}><span>Read one lab's recent paper abstract</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Goal · Join a research lab</span></div><span className="src" style={{background: '#990000', color: '#f5ecd9'}}>GOAL</span><span className="xp">+20 XP</span></div>
              <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><div style={{flex: '1 1 200px', display: 'flex', flexDirection: 'column'}}><span style={{color: '#c9b8a6', textDecoration: 'line-through'}}>Shortlist 5 labs</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Goal · Join a research lab</span></div><span className="src" style={{background: '#990000', color: '#f5ecd9'}}>GOAL</span><span className="xp">DONE</span></div>
            </section>

            <aside style={{flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '32px'}}>
              <div className="card" style={{padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
                <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>SENSEI SAYS</span>
                <p style={{margin: 0, lineHeight: 1.4}}>Lab 4 is due in three days. Try the first problem on paper before you open any AI. I'll hold the gate.</p>
                <button type="button" className="btn" style={{alignSelf: 'flex-start'}}>START 25 MIN</button>
              </div>

              <div className="card" style={{padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
                <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>MAIN QUEST</span>
                <span style={{fontWeight: 600}}>Join a research lab</span>
                <div className="seg" role="img" aria-label="2 of 9 steps"><span className="f"></span><span className="f"></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <span style={{fontSize: '15px', color: '#c9b8a6'}}>Next: read one abstract per lab</span>
                <button type="button" className="btn gold" style={{alignSelf: 'flex-start', fontSize: '10px', padding: '12px 16px'}}>OPEN GOAL TREE</button>
              </div>
            </aside>

          </div>

          <section className="card" style={{padding: '26px', display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-end'}}>
            <div style={{flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <h2 className="h" style={{margin: 0, fontSize: '13px', color: '#f2b632'}}>SHIELD LOG · THIS WEEK</h2>
              <div style={{display: 'flex', gap: '28px', flexWrap: 'wrap'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}><span className="h" style={{fontSize: '20px', color: '#f2b632'}}>4</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>AI gates</span></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}><span className="h" style={{fontSize: '20px', color: '#6fd27a'}}>3</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>tried first</span></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}><span className="h" style={{fontSize: '20px', color: '#e5484d'}}>2</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>blocked</span></div>
              </div>
              <span style={{fontSize: '15px', color: '#c9b8a6'}}>Sample numbers. Real counts come from the overlay.</span>
            </div>
            <div style={{flex: '2 1 340px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <span style={{fontSize: '15px', color: '#c9b8a6'}}>Focus minutes by day</span>
              <div style={{display: 'flex', alignItems: 'flex-end', gap: '12px', height: '120px'}} role="img" aria-label="Focus minutes Monday to Sunday: 50, 75, 40, 95, 60, 25, 10">
                <div style={{flex: 1, height: '50%', background: '#f2b632'}}></div><div style={{flex: 1, height: '75%', background: '#f2b632'}}></div><div style={{flex: 1, height: '40%', background: '#f2b632'}}></div><div style={{flex: 1, height: '95%', background: '#f2b632'}}></div><div style={{flex: 1, height: '60%', background: '#f2b632'}}></div><div style={{flex: 1, height: '25%', background: '#c41e1e'}}></div><div style={{flex: 1, height: '10%', background: '#5a3a41'}}></div>
              </div>
              <div style={{display: 'flex', gap: '12px', fontSize: '14px', color: '#c9b8a6'}}><span style={{flex: 1, textAlign: 'center'}}>M</span><span style={{flex: 1, textAlign: 'center'}}>T</span><span style={{flex: 1, textAlign: 'center'}}>W</span><span style={{flex: 1, textAlign: 'center'}}>T</span><span style={{flex: 1, textAlign: 'center'}}>F</span><span style={{flex: 1, textAlign: 'center'}}>S</span><span style={{flex: 1, textAlign: 'center'}}>S</span></div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
