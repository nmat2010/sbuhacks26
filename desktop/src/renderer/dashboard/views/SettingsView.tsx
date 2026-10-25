import { useEffect, useState } from 'react';
import type { RuleEntryType } from '@wolfie/shared';
import type { PublicSettingKey, PublicSettings } from '../../../common/ipc-sensing';

// Settings: the AI websites and distracting websites Wolfie warns about (add, remove, turn one off,
// e.g. YouTube while it is a learning source), plus the main switches. Saved with settings-set.

type SwitchKey = 'monitoring.capture_window_titles' | 'voice.enabled' | 'voice.read_replies';

export function SettingsView() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI
      .invoke('settings-get')
      .then(setSettings)
      .catch(() => setError("Couldn't load the settings."));
    return window.electronAPI.on('settings-changed', ({ key, value }) =>
      setSettings((s) => (s ? ({ ...s, [key]: value } as PublicSettings) : s))
    );
  }, []);

  const save = async (key: PublicSettingKey, value: unknown) => {
    const res = await window.electronAPI.invoke('settings-set', key, value);
    if (!res.success) {
      setError(res.error ?? "Couldn't save that setting.");
      return;
    }
    setError(null);
    setSettings((s) => (s ? ({ ...s, [key]: res.value ?? value } as PublicSettings) : s));
  };

  const handleExport = async () => {
    const res = await window.electronAPI.invoke('data-export');
    if (res.success && res.path) alert(`Saved to ${res.path}`);
    else if (!res.canceled) setError(res.error ?? "Couldn't export the data.");
  };

  const handleClear = async () => {
    if (!confirm('Clear all your sessions, reports, chat and history? Your settings are kept.')) return;
    const res = await window.electronAPI.invoke('data-clear', { keepSettings: true });
    if (!res.success) setError(res.error ?? "Couldn't clear the data.");
  };

  if (!settings) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h1 className="view-title">Settings</h1>
          <p className="view-subtitle">{error ?? 'Loading...'}</p>
        </div>
      </div>
    );
  }

  const toggle = (key: SwitchKey, title: string, subtitle: string) => (
    <div className="list-item">
      <div>
        <h3 className="list-item-title">{title}</h3>
        <p className="list-item-subtitle">{subtitle}</p>
      </div>
      <label className="switch">
        <input type="checkbox" checked={settings[key]} onChange={(e) => void save(key, e.target.checked)} />
        <span className="slider"></span>
      </label>
    </div>
  );

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <p className="view-subtitle">Configure Wolfie Sensei</p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: '#e74c3c' }}>
          <div className="card-content" style={{ color: '#a30000' }}>
            {error}
          </div>
        </div>
      )}

      <RuleList
        title="AI Websites"
        description="Wolfie warns you when you open these during a study session."
        rules={settings['monitored.ai_tools']}
        onChange={(rules) => void save('monitored.ai_tools', rules)}
      />

      <RuleList
        title="Distracting Websites"
        description="Wolfie warns you when you visit these during a study session. Turn one off while you use it for learning."
        rules={settings['monitored.distractions']}
        onChange={(rules) => void save('monitored.distractions', rules)}
      />

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Monitoring & Voice</h2>
        </div>
        <div className="card-content">
          {toggle('monitoring.capture_window_titles', 'Window Title Capture', 'Capture window titles for better context')}
          {toggle('voice.read_replies', 'Read Replies Aloud', 'Wolfie reads his chat replies with his voice')}
          {toggle('voice.enabled', 'Voice Mode', 'Wolfie speaks warnings and hints out loud')}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Data</h2>
        </div>
        <div className="card-content">
          <button className="btn btn-secondary" style={{ marginRight: '12px' }} onClick={() => void handleExport()}>
            Export Data (JSON)
          </button>
          <button className="btn btn-secondary" style={{ color: '#e74c3c' }} onClick={() => void handleClear()}>
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}

/** One list of websites (AI tools or distractions): turn each on/off, remove it, or add one. */
function RuleList({
  title,
  description,
  rules,
  onChange
}: {
  title: string;
  description: string;
  rules: RuleEntryType[];
  onChange: (rules: RuleEntryType[]) => void;
}) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');

  const add = () => {
    const list = domains
      .split(/[\s,]+/)
      .map((d) => d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    if (!list.length) return;
    onChange([...rules, { name: name.trim() || list[0], domains: list, appNames: [], enabled: true }]);
    setName('');
    setDomains('');
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-content">
        <p style={{ color: '#6e6e73', marginBottom: '12px' }}>{description}</p>
        {rules.map((rule, i) => (
          <div key={`${rule.name}-${i}`} className="rule-row">
            <label className="switch" title={rule.enabled ? 'Warning on' : 'Warning off'}>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => onChange(rules.map((r, j) => (j === i ? { ...r, enabled: e.target.checked } : r)))}
              />
              <span className="slider"></span>
            </label>
            <span className="rule-name">{rule.name}</span>
            <span className="rule-domains">{rule.domains.join(', ')}</span>
            <button className="link-btn" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <div className="rule-add">
          <input placeholder="Name (e.g. Discord)" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            placeholder="Websites (e.g. discord.com)"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn btn-primary" onClick={add}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
