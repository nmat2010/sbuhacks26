import { useEffect, useState } from 'react';
import { PixelCard, PixelButton, PixelInput, OptionButton, Switch, Stepper } from '../pixel-components';
import { useSettings } from '../hooks/useSettings';
import { useBrightspace } from '../hooks/useBrightspace';
import { useAppStatus } from '../hooks/useAppStatus';
import type { DashPrefs } from '../../../common/ipc-dashboard';
import type { PermissionState } from '../../../common/ipc-sensing';
import '../styles/tokens.css';
import './SettingsPage.css';

interface RowProps {
  name: string;
  help: string;
  children: React.ReactNode;
}

function Row({ name, help, children }: RowProps) {
  return (
    <PixelCard variant="inset" className="settings-row">
      <div className="settings-row__name">
        <span>{name}</span>
        <span className="settings-row__help">{help}</span>
      </div>
      <div className="settings-row__ctl">{children}</div>
    </PixelCard>
  );
}

function ToggleRow({ name, help, checked, onToggle }: { name: string; help: string; checked: boolean; onToggle: (v: boolean) => void }) {
  return (
    <Row name={name} help={help}>
      <span className="ws-heading" style={{ fontSize: '9px' }} aria-hidden="true">{checked ? 'ON' : 'OFF'}</span>
      <Switch checked={checked} onToggle={onToggle} label={name} />
    </Row>
  );
}

function formatSynced(iso: string | null): string {
  if (!iso) return 'not synced yet';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `synced ${hours} h ago`;
  return `synced ${Math.floor(hours / 24)} d ago`;
}

type Notice = { text: string; error?: boolean } | null;

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  if (!settings) {
    return <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>SETTINGS</h1>;
  }
  return <SettingsBody prefs={settings} updateSettings={updateSettings} resetSettings={resetSettings} />;
}

interface BodyProps {
  prefs: DashPrefs;
  updateSettings: (u: Partial<DashPrefs>) => Promise<DashPrefs>;
  resetSettings: () => Promise<DashPrefs>;
}

function SettingsBody({ prefs, updateSettings, resetSettings }: BodyProps) {
  const { courses, semester, refresh: refreshCourses } = useBrightspace();
  const { status } = useAppStatus();

  const [notice, setNotice] = useState<Notice>(null);
  const [syncing, setSyncing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<PermissionState>('unknown');
  const [editingSemester, setEditingSemester] = useState(false);
  const [semesterDraft, setSemesterDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void window.ipc.invoke('permissions-get').then((p) => setScreen(p.screen)).catch(() => undefined);
  }, []);

  const say = (text: string, error = false) => setNotice({ text, error });

  const save = async (updates: Partial<DashPrefs>) => {
    try {
      await updateSettings(updates);
      setNotice(null);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not save that change.', true);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    say('Asking the extension for your courses...');
    try {
      const result = await window.ipc.invoke('brightspace-sync');
      await refreshCourses();
      say(result.success ? `Synced ${result.items} items from ${result.courses} courses.` : result.error ?? 'Sync failed.', !result.success);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Sync failed.', true);
    } finally {
      setSyncing(false);
    }
  };

  const repair = async () => {
    try {
      const info = await window.ipc.invoke('extension-pairing-regenerate');
      setToken(info.token);
      say('New pairing code made. Type it into the extension popup.');
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not make a new code.', true);
    }
  };

  const recheckScreen = async () => {
    try {
      const p = await window.ipc.invoke('permissions-request', 'screen');
      setScreen(p.screen);
      say(p.screen === 'granted' ? 'Screen recording is allowed.' : 'Allow Wolfie in System Settings, then restart the app.', p.screen !== 'granted');
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not check permissions.', true);
    }
  };

  const exportData = async () => {
    try {
      const r = await window.ipc.invoke('data-export');
      if (r.canceled) return say('Export canceled.');
      say(r.success ? `Saved to ${r.path}` : r.error ?? 'Export failed.', !r.success);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Export failed.', true);
    }
  };

  const deleteData = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      say('This erases sessions, reports, scores and streak. Press DELETE again to confirm.', true);
      return;
    }
    setConfirmDelete(false);
    try {
      const r = await window.ipc.invoke('data-clear', { keepSettings: false });
      say(r.success ? 'All data deleted.' : r.error ?? 'Delete failed.', !r.success);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Delete failed.', true);
    }
  };

  const semesterText = prefs.semester ?? semester ?? 'Not detected yet';
  const courseCount = courses.length;
  const synced = !!prefs.brightspaceSyncedAt || courseCount > 0;
  const extensionLabel = status.extensionConnected ? 'CONNECTED' : status.extensionListening ? 'WAITING' : 'OFFLINE';

  return (
    <div className="settings-page">
      <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>SETTINGS</h1>

      {notice && (
        <div className="settings-status" role="status" aria-live="polite">
          <span className={notice.error ? 'settings-status--error' : undefined}>{notice.text}</span>
        </div>
      )}

      <div className="settings-page__cols">
        <div className="settings-page__col">
          <PixelCard as="section" aria-labelledby="s1" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s1" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>CONNECTIONS</h2>
            <Row name="Browser extension" help={token ? `Pairing code: ${token}` : status.extensionConnected ? 'Paired with this computer' : 'Not connected. Open Chrome with the extension.'}>
              <span className={`settings-pill ${status.extensionConnected ? '' : 'settings-pill--off'}`}>{extensionLabel}</span>
              <PixelButton size="sm" onClick={repair}>RE-PAIR</PixelButton>
            </Row>
            <Row name="Brightspace" help={`${semesterText} · ${courseCount} ${courseCount === 1 ? 'course' : 'courses'} · ${formatSynced(prefs.brightspaceSyncedAt)}`}>
              <span className={`settings-pill ${synced ? '' : 'settings-pill--idle'}`}>{synced ? 'SYNCED' : 'NOT SYNCED'}</span>
              <PixelButton size="sm" onClick={syncNow} disabled={syncing}>{syncing ? 'SYNCING...' : 'RE-SYNC'}</PixelButton>
            </Row>
            <Row name="Active semester" help={editingSemester ? 'Type the semester, then press SAVE' : prefs.semester ? 'Set by you' : 'Detected from your course dates'}>
              {editingSemester ? (
                <>
                  <PixelInput
                    aria-label="Active semester"
                    value={semesterDraft}
                    onChange={(e) => setSemesterDraft(e.target.value)}
                    style={{ width: '150px' }}
                    placeholder="Fall 2026"
                  />
                  <PixelButton size="sm" onClick={() => { void save({ semester: semesterDraft }); setEditingSemester(false); }}>SAVE</PixelButton>
                </>
              ) : (
                <PixelButton size="sm" onClick={() => { setSemesterDraft(prefs.semester ?? semester ?? ''); setEditingSemester(true); }}>CHANGE</PixelButton>
              )}
            </Row>
          </PixelCard>

          <PixelCard as="section" aria-labelledby="s2" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s2" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>REPORTS AND DASHBOARD</h2>
            <ToggleRow name="Record problems in each session" help="Logs what you study and each problem you work on" checked={prefs.reports.recordProblems} onToggle={(v) => save({ reports: { ...prefs.reports, recordProblems: v } })} />
            <ToggleRow name="Show productivity curve" help="Optional chart at the bottom of the dashboard" checked={prefs.reports.showProductivityCurve} onToggle={(v) => save({ reports: { ...prefs.reports, showProductivityCurve: v } })} />
            <ToggleRow name="Weekly report on Sunday" help="Wolfie sums up your strong and weak topics" checked={prefs.reports.weeklyReport} onToggle={(v) => save({ reports: { ...prefs.reports, weeklyReport: v } })} />
          </PixelCard>

          <PixelCard as="section" aria-labelledby="s3" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s3" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>POWERS</h2>
            <ToggleRow name="Overlay" help="Warn and gate pop-ups" checked={prefs.powers.overlay} onToggle={(v) => save({ powers: { ...prefs.powers, overlay: v } })} />
            <Row name="Screen recording" help={screen === 'granted' ? 'Allowed. Needs a restart after you change it' : 'Needs a restart after you allow it'}>
              <span className={`settings-pill ${screen === 'granted' ? '' : 'settings-pill--idle'}`}>{screen === 'granted' ? 'ALLOWED' : 'NOT ALLOWED'}</span>
              <PixelButton size="sm" onClick={recheckScreen}>RECHECK</PixelButton>
            </Row>
            <ToggleRow name="Voice" help="Talk to Wolfie" checked={prefs.powers.voice} onToggle={(v) => save({ powers: { ...prefs.powers, voice: v } })} />
          </PixelCard>
        </div>

        <div className="settings-page__col">
          <PixelCard as="section" aria-labelledby="s4" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s4" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>INDEPENDENCE RULES</h2>
            <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>These decide whether a day keeps your independence streak.</span>
            <Row name="Attempt length" help="Characters to write before an AI site unlocks">
              <Stepper label="attempt length" value={prefs.independence.attemptLength} min={0} max={500} step={5} onChange={(v) => save({ independence: { ...prefs.independence, attemptLength: v } })} />
            </Row>
            <Row name="Unlock for" help="Minutes an AI site stays open">
              <Stepper label="unlock minutes" value={prefs.independence.unlockMinutes} min={0} max={240} step={5} onChange={(v) => save({ independence: { ...prefs.independence, unlockMinutes: v } })} />
            </Row>
            <Row name="AI share cap" help="Percent of study time AI may take">
              <Stepper label="AI share cap" value={Math.round(prefs.independence.aiShareCap * 100)} min={0} max={100} step={5} onChange={(v) => save({ independence: { ...prefs.independence, aiShareCap: v / 100 } })} />
            </Row>
            <Row name="Try-first timer" help="Minutes to work alone before asking AI">
              <Stepper label="try-first minutes" value={prefs.independence.tryFirstMinutes} min={0} max={240} step={5} onChange={(v) => save({ independence: { ...prefs.independence, tryFirstMinutes: v } })} />
            </Row>
          </PixelCard>

          <PixelCard as="section" aria-labelledby="s5" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s5" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>PRIVACY AND DATA</h2>
            <PixelCard variant="inset" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span><span style={{ color: 'var(--ws-text-muted)' }}>Stored on this computer: </span>your courses, session reports, problem log, topic scores, streak and settings.</span>
              <span><span style={{ color: 'var(--ws-text-muted)' }}>Sent off this computer: </span>only the text of a hint request, to the AI model that writes the hint, while a session runs.</span>
            </PixelCard>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <PixelButton size="sm" onClick={exportData}>EXPORT MY DATA</PixelButton>
              <PixelButton size="sm" onClick={deleteData}>{confirmDelete ? 'CONFIRM DELETE' : 'DELETE MY DATA'}</PixelButton>
            </div>
          </PixelCard>

          <PixelCard as="section" aria-labelledby="s6" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="s6" className="ws-heading" style={{ margin: 0, fontSize: '12px', color: 'var(--ws-gold)' }}>APPEARANCE</h2>
            <Row name="Pixel scale" help="Size of the pixel art">
              {([1, 2, 3] as const).map((n) => (
                <OptionButton key={n} pressed={prefs.appearance.pixelScale === n} onClick={() => save({ appearance: { ...prefs.appearance, pixelScale: n } })}>
                  {n}X
                </OptionButton>
              ))}
            </Row>
            <ToggleRow name="Reduce motion" help="Turns off blinking and sprite animation" checked={prefs.appearance.reduceMotion} onToggle={(v) => save({ appearance: { ...prefs.appearance, reduceMotion: v } })} />
            <ToggleRow name="Sound effects" help="XP chimes and Wolfie sounds" checked={prefs.appearance.soundEffects} onToggle={(v) => save({ appearance: { ...prefs.appearance, soundEffects: v } })} />
            <div>
              <PixelButton size="sm" onClick={async () => { try { await resetSettings(); say('Settings reset to defaults.'); } catch (e) { say(e instanceof Error ? e.message : 'Reset failed.', true); } }}>
                RESET TO DEFAULTS
              </PixelButton>
            </div>
          </PixelCard>
        </div>
      </div>
    </div>
  );
}
