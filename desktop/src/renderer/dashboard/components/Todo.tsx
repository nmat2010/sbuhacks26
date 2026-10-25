import Sprite from '../../../../../design/Sprite';

export default function Todo() {
  return (
    <div className="pg-todo" style={{width: '100%', minHeight: '1080px', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px', display: 'flex', flexDirection: 'column'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>TO-DO</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch'}}>

        <nav aria-label="Main" style={{flex: '0 0 232px', width: '232px', maxWidth: '100%', background: '#0d0709', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box'}}>
          <button type="button" className="nav"><i></i>HOME</button>
          <button type="button" className="nav"><i></i>QUESTS</button>
          <button type="button" className="nav on" aria-current="page"><i></i>TO-DO</button>
          <button type="button" className="nav"><i></i>GOAL TREE</button>
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
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <h1 className="h" style={{margin: 0, fontSize: '20px', color: '#f2b632'}}>TO-DO</h1>
              <span style={{color: '#c9b8a6'}}>Imported from Brightspace · Fall 2026 · 23 items</span>
            </div>
            <button type="button" className="btn gold" style={{fontSize: '11px'}}>RE-SYNC NOW</button>
          </div>

          <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}} role="group" aria-label="Filter by course">
            <button type="button" className="chip on" aria-pressed="true">All</button><button type="button" className="chip">CSE 220</button><button type="button" className="chip">ESE 271</button><button type="button" className="chip">AMS 261</button><button type="button" className="chip">PHY 131</button>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start'}}>

            <section className="card" style={{flex: '2 1 460px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
              <h2 className="grp">OVERDUE · 0</h2>
              <span style={{fontSize: '16px', color: '#6fd27a'}}>Nothing overdue. Nice.</span>

              <h2 className="grp" style={{marginTop: '14px'}}>THIS WEEK · 4</h2>
              <div className="sel r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span style={{fontWeight: 600}}>Lab 4 report</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>ESE 271 · Tue Oct 27</span></div><span className="xp">+40 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Problem set 6</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>AMS 261 · Wed Oct 28</span></div><span className="xp">+30 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Project milestone</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>CSE 220 · Fri Oct 30</span></div><span className="xp">+40 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Homework 5</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>PHY 131 · Sat Oct 31</span></div><span className="xp">+30 XP</span></div>

              <h2 className="grp" style={{marginTop: '14px'}}>NEXT WEEK · 4</h2>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Quiz 3 prep</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>CSE 220 · Mon Nov 2</span></div><span className="xp">+20 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Problem set 7</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>AMS 261 · Wed Nov 4</span></div><span className="xp">+30 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Lab 5 pre-lab</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>ESE 271 · Fri Nov 6</span></div><span className="xp">+20 XP</span></div>
              <div className="card2 r"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Midterm 2</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>PHY 131 · Mon Nov 9</span></div><span className="src">EXAM</span><span className="xp">+60 XP</span></div>

              <span style={{fontSize: '15px', color: '#c9b8a6', marginTop: '6px'}}>Later: 11 more items</span>
            </section>

            <aside className="card" style={{flex: '1 1 320px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
              <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>SELECTED · LAB 4 REPORT</span>
              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}><span className="src">ESE 271</span><span className="src">DUE TUE OCT 27</span><span className="src">BRIGHTSPACE</span></div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                <span style={{color: '#c9b8a6', fontSize: '16px'}}>Sensei's breakdown · sample</span>
                <div className="card2 r" style={{padding: '10px 14px'}}><span className="h" style={{fontSize: '10px', color: '#f2b632', width: '20px', flex: 'none'}}>1</span><span style={{flex: '1 1 150px'}}>Set up the circuit equations on paper</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>~30 min</span></div>
                <div className="card2 r" style={{padding: '10px 14px'}}><span className="h" style={{fontSize: '10px', color: '#f2b632', width: '20px', flex: 'none'}}>2</span><span style={{flex: '1 1 150px'}}>Solve and check against the lab data</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>~45 min</span></div>
                <div className="card2 r" style={{padding: '10px 14px'}}><span className="h" style={{fontSize: '10px', color: '#f2b632', width: '20px', flex: 'none'}}>3</span><span style={{flex: '1 1 150px'}}>Write up results and conclusion</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>~40 min</span></div>
              </div>
              <div className="card2" style={{padding: '14px 16px', fontSize: '16px', lineHeight: 1.35, color: '#e0d2c2'}}><span style={{color: '#f2b632', fontWeight: 600}}>Try-first rule: </span>AI sites stay on GATE until you log an attempt for step 1.</div>
              <div style={{display: 'flex', gap: '14px', flexWrap: 'wrap'}}><button type="button" className="btn" style={{fontSize: '10px', padding: '12px 14px'}}>START STEP 1</button><button type="button" className="btn gold" style={{fontSize: '10px', padding: '12px 14px'}}>REBUILD STEPS</button></div>
            </aside>

          </div>

        </main>
      </div>
    </div>
  );
}
