import Sprite from '../../../../../design/Sprite';

export default function Quests() {
  return (
    <div className="pg-quests" style={{width: '100%', minHeight: '1040px', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px', display: 'flex', flexDirection: 'column'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>QUESTS</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch'}}>

        <nav aria-label="Main" style={{flex: '0 0 232px', width: '232px', maxWidth: '100%', background: '#0d0709', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '6px', boxSizing: 'border-box'}}>
          <button type="button" className="nav"><i></i>HOME</button>
          <button type="button" className="nav on" aria-current="page"><i></i>QUESTS</button>
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
              <h1 className="h" style={{margin: 0, fontSize: '20px', color: '#f2b632'}}>QUEST BOARD</h1>
              <span style={{color: '#c9b8a6'}}>Daily quests reset at midnight. Weekly quests reset on Monday.</span>
            </div>
            <div className="card" style={{padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', gap: '12px'}}><span className="h" style={{fontSize: '10px'}}>LEVEL 4</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>340 / 500 XP</span></div>
              <div className="seg" role="img" aria-label="340 of 500 XP"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span><span></span></div>
            </div>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start'}}>

            <section className="card" style={{flex: '1 1 380px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'}}><h2 className="h" style={{margin: 0, fontSize: '13px', color: '#f2b632'}}>DAILY</h2><span style={{fontSize: '15px', color: '#c9b8a6'}}>1 of 3 done</span></div>
              <div className="card2 q"><span className="chk d" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span style={{color: '#c9b8a6', textDecoration: 'line-through'}}>Try first</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Write an attempt at a gate before using AI</span></div><span style={{fontSize: '15px', color: '#6fd27a'}}>1 / 1</span><span className="xp">+15 XP</span></div>
              <div className="card2 q"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Focus 25</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Finish one 25-minute focus session</span></div><span style={{fontSize: '15px', color: '#c9b8a6'}}>0 / 1</span><span className="xp">+25 XP</span></div>
              <div className="card2 q"><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Clear one</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Finish one Brightspace to-do</span></div><span style={{fontSize: '15px', color: '#c9b8a6'}}>0 / 1</span><span className="xp">+30 XP</span></div>
            </section>

            <section className="card" style={{flex: '1 1 380px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'}}><h2 className="h" style={{margin: 0, fontSize: '13px', color: '#f2b632'}}>WEEKLY</h2><span style={{fontSize: '15px', color: '#c9b8a6'}}>0 of 3 done</span></div>
              <div className="card2 q" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}><div style={{display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'}}><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Five sessions</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Finish 5 focus sessions</span></div><span className="xp">+80 XP</span></div><div className="seg" role="img" aria-label="3 of 5"><span className="f"></span><span className="f"></span><span className="f"></span><span></span><span></span></div></div>
              <div className="card2 q" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}><div style={{display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'}}><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Reach out</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Send 5 emails toward your lab goal</span></div><span className="src" style={{background: '#990000', color: '#f5ecd9'}}>GOAL</span><span className="xp">+60 XP</span></div><div className="seg" role="img" aria-label="0 of 5"><span></span><span></span><span></span><span></span><span></span></div></div>
              <div className="card2 q" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}><div style={{display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'}}><span className="chk" aria-hidden="true"></span><div style={{flex: '1 1 180px', display: 'flex', flexDirection: 'column'}}><span>Clean week</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Don't open a blocked site for 7 days</span></div><span className="xp">+50 XP</span></div><div className="seg" role="img" aria-label="6 of 7 days"><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span className="f"></span><span></span></div></div>
            </section>

          </div>

          <section className="card" style={{padding: '26px', display: 'flex', flexDirection: 'column', gap: '18px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><h2 className="h" style={{margin: 0, fontSize: '13px', color: '#f2b632'}}>BADGES</h2><span style={{fontSize: '15px', color: '#c9b8a6'}}>2 of 8 earned · sample</span></div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '20px'}}>
              <div className="card2 badge"><span className="bt" aria-hidden="true"></span><span style={{fontWeight: 600}}>First Gate</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Wrote your first attempt</span></div>
              <div className="card2 badge"><span className="bt" aria-hidden="true"></span><span style={{fontWeight: 600}}>3-Day Streak</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Three days in a row</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>7-Day Streak</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>6 of 7 days</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>Paper Skimmer</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Read 5 abstracts</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>Try First x10</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>10 attempts logged</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>Clean Week</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>7 days, no blocked sites</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>First Email</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Send a lab email</span></div>
              <div className="card2 badge"><span className="bt l" aria-hidden="true"></span><span style={{fontWeight: 600, color: '#c9b8a6'}}>Boss Cleared</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>Finish a main quest</span></div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
