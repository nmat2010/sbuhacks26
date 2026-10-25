import Sprite from '../../../../../design/Sprite';

interface DoneProps {
  onNext: () => void;
  onBack: () => void;
  data: any;
}

export default function Done({ onNext, onBack, data }: DoneProps) {
  return (
    <div className="pg-done" style={{width: '100%', minHeight: '820px', display: 'flex', flexDirection: 'column', background: '#1a1214', color: '#f5ecd9', fontFamily: "'Pixelify Sans',monospace", fontSize: '18px'}}>

      <div style={{height: '44px', background: '#0d0709', borderBottom: '4px solid #990000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flex: 'none'}}>
        <span className="h" style={{fontSize: '11px'}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize: '10px', color: '#c9b8a6'}}>SETUP · 7 OF 7</span>
        <div style={{display: 'flex', gap: '8px'}} aria-hidden="true"><span style={{width: '14px', height: '14px', background: '#f2b632'}}></span><span style={{width: '14px', height: '14px', background: '#6fd27a'}}></span><span style={{width: '14px', height: '14px', background: '#e5484d'}}></span></div>
      </div>

      <div style={{flex: '1', display: 'flex', flexWrap: 'wrap', gap: '52px', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', maxWidth: '1180px', width: '100%', boxSizing: 'border-box', margin: '0 auto'}}>

        <div style={{flex: '1 1 280px', maxWidth: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px'}}>
          <Sprite size={224} variant="cheer" />
          <span className="h" style={{fontSize: '9px', color: '#c9b8a6'}}>SENSEI · CHEERING · placeholder sprite</span>
        </div>

        <div className="card" style={{flex: '2 1 460px', maxWidth: '640px', padding: '34px', display: 'flex', flexDirection: 'column', gap: '24px'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
            <h1 className="h" style={{margin: '0', fontSize: '20px', color: '#f2b632', lineHeight: '1.4'}}>SETUP COMPLETE</h1>
            <p style={{margin: '0', color: '#e0d2c2', lineHeight: '1.4'}}>You're ready, trainee. Here's what I'm tracking for you.</p>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
            <span className="h" style={{fontSize: '12px', background: '#f2b632', color: '#1a1214', padding: '10px 12px'}}>+50 XP</span>
            <span style={{color: '#e0d2c2'}}>First reward for finishing setup</span>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            <div className="card2 row"><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1 1 160px', color: '#c9b8a6'}}>Semester</span><span style={{fontWeight: '600'}}>{data.semester || 'Fall 2026'} · {data.courses?.length || 4} courses · {data.assignmentCount || 23} assignments</span></div>
            <div className="card2 row"><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1 1 160px', color: '#c9b8a6'}}>Main quest</span><span style={{fontWeight: '600'}}>{data.mainGoal === 'research' ? 'Research project' : data.mainGoal === 'internship' ? 'Internship or job' : data.mainGoal === 'clubs' ? 'Join clubs' : data.mainGoal === 'grades' ? 'Strong grades' : data.mainGoal === 'grad-school' ? 'Grad school' : data.mainGoal === 'custom' ? (data.customGoalText || 'Custom goal') : 'Join a research lab'}</span></div>
            <div className="card2 row"><span style={{width: '20px', height: '20px', background: '#6fd27a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1 1 160px', color: '#c9b8a6'}}>Shields</span><span style={{fontWeight: '600'}}>{data.shields?.length || 6} set · {data.shields?.filter((s: any) => s.mode === 'GATE').length || 2} gate · {data.shields?.filter((s: any) => s.mode === 'BLOCK').length || 1} block · {data.shields?.filter((s: any) => s.mode === 'WARN').length || 3} warn</span></div>
            <div className="card2 row"><span style={{width: '20px', height: '20px', background: data.overlayEnabled && data.screenRecordingEnabled && data.voiceEnabled ? '#6fd27a' : '#f2a03a', flex: 'none'}} aria-hidden="true"></span><span style={{flex: '1 1 160px', color: '#c9b8a6'}}>Powers</span><span style={{fontWeight: '600', color: data.overlayEnabled && data.screenRecordingEnabled && data.voiceEnabled ? '#6fd27a' : '#f2a03a'}}>{[data.overlayEnabled, data.screenRecordingEnabled, data.voiceEnabled].filter(Boolean).length} of 3 on{data.overlayEnabled && data.screenRecordingEnabled && data.voiceEnabled ? '' : ' · finish later in Settings'}</span></div>
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '4px'}}>
            <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
            <button type="button" className="btn gold" onClick={onNext}>ENTER DASHBOARD</button>
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
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#f2b632', boxShadow: '0 0 0 4px #5a3a41'}}></div><span style={{fontSize: '14px', color: '#f2b632'}}>Shields</span></div>
          <div style={{flex: '1', height: '4px', marginTop: '10px', background: 'repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)'}}></div>
          <div style={{width: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'}}><div style={{width: '24px', height: '24px', background: '#c41e1e', boxShadow: '0 0 0 4px #f5ecd9'}}></div><span style={{fontSize: '14px', color: '#f5ecd9', fontWeight: '600'}}>Train!</span></div>
        </div>
      </div>

    </div>
  );
}
