import { useState } from 'react';

interface GoalScreenProps {
  onNext: (data: { mainGoal: string; questLine: any[] }) => void;
  onBack: () => void;
}

type GoalType = 'research' | 'internship' | 'clubs' | 'grades' | 'grad-school' | 'custom';

export function GoalScreen({ onNext, onBack }: GoalScreenProps) {
  const [selectedGoal, setSelectedGoal] = useState<GoalType | null>('research');
  const [customGoalText, setCustomGoalText] = useState('Join a lab and start by Spring 2027');

  const handleGoalSelect = (goal: GoalType) => {
    setSelectedGoal(goal);
  };

  const handleCustomGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomGoalText(e.target.value);
  };

  const handleBuildQuest = () => {
    if (selectedGoal) {
      onNext({ mainGoal: selectedGoal, questLine: [] });
    }
  };

  return (
    <div className="pg-goals" style={{width: '100%', minHeight: '960px', display: 'flex', flexDirection: 'column', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>SETUP · 5 OF 7</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: '1', display: 'flex', flexWrap: 'wrap', gap: '44px', alignItems: 'flex-start', justifyContent: 'center', padding: '44px 32px', maxWidth: '1220px', width: '100%', boxSizing: 'border-box', margin: '0 auto'}}>

        <div className="card" style={{flex: '1 1 400px', maxWidth: '460px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '22px'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <h1 className="h" style={{margin: '0', fontSize: '16px', color: '#f2b632'}}>PICK YOUR SEMESTER GOAL</h1>
            <p style={{margin: '0', color: '#e0d2c2', lineHeight: '1.35'}}>One main quest keeps you honest. Choose one and I'll answer a few questions to shape it.</p>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '20px'}}>
            <button type="button" className={selectedGoal === 'research' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('research')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="6" y="1" width="4" height="1" fill="#f5ecd9"/><rect x="7" y="2" width="2" height="4" fill="#f5ecd9"/><rect x="6" y="6" width="4" height="2" fill="#f5ecd9"/><rect x="4" y="8" width="8" height="2" fill="#f5ecd9"/><rect x="3" y="10" width="10" height="3" fill="#f5ecd9"/><rect x="4" y="11" width="8" height="2" fill="#c41e1e"/></svg>
              <span style={{fontWeight: '600'}}>Research project</span></button>
            <button type="button" className={selectedGoal === 'internship' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('internship')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="6" y="2" width="4" height="1" fill="#f5ecd9"/><rect x="6" y="3" width="1" height="2" fill="#f5ecd9"/><rect x="9" y="3" width="1" height="2" fill="#f5ecd9"/><rect x="2" y="5" width="12" height="8" fill="#f5ecd9"/><rect x="2" y="8" width="12" height="1" fill="#3a2328"/><rect x="7" y="8" width="2" height="2" fill="#f2b632"/></svg>
              <span style={{fontWeight: '600'}}>Internship or job</span></button>
            <button type="button" className={selectedGoal === 'clubs' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('clubs')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="3" y="4" width="3" height="3" fill="#f5ecd9"/><rect x="10" y="4" width="3" height="3" fill="#f5ecd9"/><rect x="2" y="8" width="5" height="5" fill="#f5ecd9"/><rect x="9" y="8" width="5" height="5" fill="#f5ecd9"/></svg>
              <span style={{fontWeight: '600'}}>Join clubs</span></button>
            <button type="button" className={selectedGoal === 'grades' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('grades')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="7" y="1" width="2" height="3" fill="#f5ecd9"/><rect x="5" y="4" width="6" height="1" fill="#f5ecd9"/><rect x="1" y="5" width="14" height="2" fill="#f5ecd9"/><rect x="3" y="7" width="10" height="2" fill="#f5ecd9"/><rect x="3" y="9" width="3" height="3" fill="#f5ecd9"/><rect x="10" y="9" width="3" height="3" fill="#f5ecd9"/></svg>
              <span style={{fontWeight: '600'}}>Strong grades</span></button>
            <button type="button" className={selectedGoal === 'grad-school' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('grad-school')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="6" y="3" width="4" height="1" fill="#f5ecd9"/><rect x="4" y="4" width="8" height="1" fill="#f5ecd9"/><rect x="2" y="5" width="12" height="2" fill="#f5ecd9"/><rect x="4" y="8" width="8" height="3" fill="#f5ecd9"/><rect x="14" y="6" width="1" height="5" fill="#f2b632"/></svg>
              <span style={{fontWeight: '600'}}>Grad school</span></button>
            <button type="button" className={selectedGoal === 'custom' ? 'sel' : 'card2'} style={{border: '0', padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '17px', cursor: 'pointer', textAlign: 'center'}} onClick={() => handleGoalSelect('custom')}>
              <svg aria-hidden="true" viewBox="0 0 16 16" width="48" height="48" shapeRendering="crispEdges" style={{imageRendering: 'pixelated'}}><rect x="7" y="3" width="2" height="10" fill="#f5ecd9"/><rect x="3" y="7" width="10" height="2" fill="#f5ecd9"/></svg>
              <span style={{fontWeight: '600'}}>Custom</span></button>
          </div>

          <div className="card2" style={{padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <span className="h" style={{fontSize: '10px', color: '#f2b632'}}>SENSEI ASKS</span>
            <span style={{lineHeight: '1.35'}}>What would count as success, and by when?</span>
            <input
              type="text"
              value={customGoalText}
              onChange={handleCustomGoalChange}
              placeholder="Join a lab and start by Spring 2027"
              style={{background: '#0d0709', padding: '12px 14px', color: '#f5ecd9', border: 'none', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px'}}
            />
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap'}}>
            <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
            <button type="button" className="btn" onClick={handleBuildQuest} disabled={!selectedGoal} style={{opacity: selectedGoal ? 1 : 0.5, cursor: selectedGoal ? 'pointer' : 'not-allowed'}}>BUILD MY QUEST</button>
          </div>
        </div>

        <div className="card" style={{flex: '2 1 520px', maxWidth: '660px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '22px'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>YOUR QUEST LINE · SAMPLE</span>
            <div className="sel" style={{padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '13px', color: '#f2b632'}}>BOSS: JOIN A RESEARCH LAB</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>2 of 9 steps</span></div>
              <div style={{display: 'flex', gap: '4px'}} role="img" aria-label="Boss health: 2 of 9 steps cleared">
                <span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#c41e1e'}}></span><span style={{flex: '1', height: '14px', background: '#5a3a41'}}></span><span style={{flex: '1', height: '14px', background: '#5a3a41'}}></span>
              </div>
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '4px dashed #5a3a41'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px'}}>1 · FIND LABS THAT FIT</span><span style={{fontSize: '15px', color: '#6fd27a'}}>2 / 3</span></div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1', color: '#c9b8a6', textDecoration: 'line-through'}}>Browse faculty pages in your department</span><span className="xp">+10 XP</span></div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1', color: '#c9b8a6', textDecoration: 'line-through'}}>Shortlist 5 labs</span><span className="xp">+10 XP</span></div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1'}}>Read one recent paper abstract per lab</span><span className="xp">+20 XP</span></div>
              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '32px'}}><span className="chip">Faculty directory</span><span className="chip">How to skim a paper</span></div>
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '4px dashed #5a3a41'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px'}}>2 · REACH OUT</span><span style={{fontSize: '15px', color: '#c9b8a6'}}>0 / 3</span></div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1'}}>Draft your first email in your own words</span><span className="xp">+20 XP</span></div>
              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '32px'}}><span className="chip">Email outline</span><span className="chip">Office hours</span></div>
            </div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1'}}>Send 5 emails</span><span className="xp">+30 XP</span></div>
            <div className="card2" style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px'}}><span style={{width: '20px', height: '20px', background: '#1a1214', boxShadow: '0 0 0 3px #f5ecd9', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1'}}>Book one conversation with a lab</span><span className="xp">+30 XP</span></div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '4px dashed #5a3a41'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}><span className="h" style={{fontSize: '11px', color: '#b9a898'}}>3 · PREP AND FOLLOW UP</span><span className="h" style={{fontSize: '9px', background: '#4a3a3d', color: '#e0d2c2', padding: '6px 8px'}}>LOCKED</span></div>
            <p style={{margin: '0', fontSize: '16px', color: '#c9b8a6', lineHeight: '1.3'}}>Unlocks after your first reply. I'll build these steps from what the lab says.</p>
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
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#c41e1e', boxShadow: '0 0 0 4px #f5ecd9'}}></div><span style={{fontSize: '14px', color: '#f5ecd9', fontWeight: '600'}}>Goals</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Shields</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#3a2328', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#b9a898'}}>Train!</span></div>
        </div>
      </div>

    </div>
  );
}
