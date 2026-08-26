import { useEffect, useState } from "react";
import type { Provider, ProviderModel, Configuration, StorageSettings } from "../../types/domain";
import { evoca } from "../../services/evoca";

interface Props {
  configurations: Configuration[];
  onChange: (configurations: Configuration[]) => void;
  onClose: () => void;
}

type Section = "general" | "configurations" | "providers";


function Icon({ name }: { name: "trash" | "save" | "x" | "power" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "trash") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    );
  }

  if (name === "save") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M5 4h12l2 2v14H5z" />
        <path d="M8 4v6h8V4" />
        <path d="M8 20v-6h8v6" />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }

  // power
  return (
    <svg {...common} aria-hidden="true">
      <path d="M12 3v9" />
      <path d="M6.35 6.35a8 8 0 1 0 11.3 0" />
    </svg>
  );
}


const freshConfiguration = (providers: Provider[]): Configuration => ({
  id: crypto.randomUUID(),
  name: "New Configuration",
  description: "",
  icon: "✦",
  providerId: providers[0]?.id ?? "",
  model: "",
  spell: "",
  inputType: "text",
  outputType: "text",
  temperature: 0.2,
  maxTokens: 2000,
  createdAt: 0,
  updatedAt: 0,
});

const freshProvider = (): Provider => ({
  id: crypto.randomUUID(),
  name: "New Provider",
  kind: "openai_compatible",
  baseUrl: "https://api.openai.com/v1",
  credentialRef: "",
  apiKeyEnv: "",
  headersJson: "{}",
  createdAt: 0,
});

export function Settings({ configurations, onChange, onClose }: Props) {
  const [section, setSection] = useState<Section>("configurations");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [configuration, setConfiguration] = useState<Configuration | null>(configurations[0] ?? null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<ProviderModel[]>([]);
  const [providerTesting, setProviderTesting] = useState(false);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [configurationModels, setConfigurationModels] = useState<ProviderModel[]>([]);
  const [modelName, setModelName] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Space");
  const [storage, setStorage] = useState<StorageSettings | null>(null);
  const [storageSaving, setStorageSaving] = useState(false);

  useEffect(() => {
    evoca.getHotkey().then((value) => setHotkey(value || "Ctrl+Space")).catch(() => setHotkey("Ctrl+Space"));
    evoca.getStorageSettings().then(setStorage).catch((error) => setMessage(String(error)));
  }, []);

  useEffect(() => {
    let active = true;
    evoca.getProviders()
      .then((data) => {
        if (!active) return;
        // Wails may return null/nil for an empty result set. Always keep UI state as arrays.
        const nextProviders = Array.isArray(data) ? data : [];
        setProviders(nextProviders);
        if (nextProviders.length && !provider) setProvider(nextProviders[0]);
      })
      .catch((error) => setMessage(String(error)));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const providerId = configuration?.providerId;
    if (!providerId) {
      setConfigurationModels([]);
      return;
    }

    let active = true;
    evoca.getProviderModels(providerId)
      .then((data) => {
        if (!active) return;
        // Never let a null/nil backend response break the settings page.
        const nextModels = Array.isArray(data) ? data : [];
        setConfigurationModels(nextModels);
        setConfiguration((current) => {
          if (!current || current.providerId !== providerId) return current;
          if (current.model && nextModels.some((model) => model && model.name === current.model)) return current;
          return { ...current, model: nextModels[0]?.name ?? current.model };
        });
      })
      .catch((error) => {
        if (active) {
          setConfigurationModels([]);
          setMessage(String(error));
        }
      });

    return () => { active = false; };
  }, [configuration?.providerId]);

  useEffect(() => {
    // Do not hit the DB for a brand-new unsaved provider.
    if (!provider || !providers.some((item) => item.id === provider.id)) {
      setModels([]);
      return;
    }

    let active = true;
    evoca.getProviderModels(provider.id)
      .then((data) => {
        if (active) setModels(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (active) setMessage(String(error));
      });

    return () => { active = false; };
  }, [provider, providers]);

  function addProvider() {
    const next = freshProvider();
    setMessage("");
    setProvider(next);
    setModels([]);
    setDiscoveredModels([]);
    setModelName("");
    setModelLabel("");
    setSection("providers");
  }

  async function saveProvider() {
    if (!provider) return;
    if (!provider.name.trim()) {
      setMessage("Provider name is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await evoca.saveProvider(provider);

      const nextProviders = await evoca.getProviders();
      const saved = nextProviders.find((item) => item.id === provider.id) ?? provider;

      setProviders(nextProviders);
      setProvider(saved);
      const savedModels = await evoca.getProviderModels(saved.id);
      setModels(Array.isArray(savedModels) ? savedModels : []);
      setMessage("Provider saved successfully.");
    } catch (error) {
      setMessage(`Save provider failed: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function testProvider() {
    if (!provider) return;
    setProviderTesting(true);
    setMessage("");
    try {
      await evoca.testProvider(provider);
      setMessage("Provider connection successful.");
    } catch (error) {
      setMessage(`Provider test failed: ${String(error)}`);
    } finally {
      setProviderTesting(false);
    }
  }

  async function discoverModels() {
    if (!provider) return;
    setDiscoveringModels(true);
    setMessage("");
    try {
      const next = await evoca.discoverProviderModels(provider);
      setDiscoveredModels(Array.isArray(next) ? next : []);
      setMessage(`${next.length} model${next.length === 1 ? "" : "s"} found.`);
    } catch (error) {
      setDiscoveredModels([]);
      setMessage(`Model discovery failed: ${String(error)}`);
    } finally {
      setDiscoveringModels(false);
    }
  }

  async function addDiscoveredModel(model: ProviderModel) {
    if (!provider) return;
    try {
      if (!providers.some((item) => item.id === provider.id)) {
        await evoca.saveProvider(provider);
        const nextProviders = await evoca.getProviders();
        setProviders(nextProviders);
        setProvider(nextProviders.find((item) => item.id === provider.id) ?? provider);
      }
      await evoca.saveProviderModel(model);
      const nextModels = await evoca.getProviderModels(provider.id);
      setModels(Array.isArray(nextModels) ? nextModels : []);
      setDiscoveredModels((current) => current.filter((item) => item.name !== model.name));
      setMessage(`Model "${model.name}" added.`);
    } catch (error) {
      setMessage(`Add model failed: ${String(error)}`);
    }
  }

  async function deleteProvider() {
    if (!provider) return;

    try {
      // Unsaved local provider: simply clear the editor.
      if (!providers.some((item) => item.id === provider.id)) {
        setProvider(null);
        setModels([]);
        return;
      }

      await evoca.deleteProvider(provider.id);
      const nextProviders = await evoca.getProviders();
      setProviders(nextProviders);
      setProvider(nextProviders[0] ?? null);
      setModels(nextProviders[0] ? await evoca.getProviderModels(nextProviders[0].id) : []);
      onChange(await evoca.getConfigurations());
      setMessage("Provider deleted.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function addModel() {
    if (!provider) return;
    if (!provider.name.trim()) {
      setMessage("Save the provider before adding models.");
      return;
    }
    if (!modelName.trim()) return;

    try {
      // Provider must exist in DB first.
      if (!providers.some((item) => item.id === provider.id)) {
        await evoca.saveProvider(provider);
        const nextProviders = await evoca.getProviders();
        setProviders(nextProviders);
      }

      await evoca.saveProviderModel({
        id: crypto.randomUUID(),
        providerId: provider.id,
        name: modelName.trim(),
        displayName: modelLabel.trim() || modelName.trim(),
        createdAt: 0,
      });

      setModelName("");
      setModelLabel("");
      const nextModels = await evoca.getProviderModels(provider.id);
      setModels(Array.isArray(nextModels) ? nextModels : []);
      setMessage("Model added.");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function deleteModel(id: string) {
    try {
      await evoca.deleteProviderModel(id);
      if (provider) {
        const nextModels = await evoca.getProviderModels(provider.id);
        setModels(Array.isArray(nextModels) ? nextModels : []);
      }
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function saveConfiguration() {
    if (!configuration) return;

    if (!configuration.name.trim()) {
      setMessage("Configuration name is required.");
      return;
    }

    if (!configuration.providerId) {
      setMessage("Select a provider first.");
      return;
    }

    if (!configuration.model.trim()) {
      setMessage("Select a model first.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await evoca.saveConfiguration(configuration);
      onChange(await evoca.getConfigurations());
      setMessage("Configuration saved successfully.");
    } catch (error) {
      setMessage(`Save configuration failed: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }


  return (
    <section className="panel settings-panel">
      <div className="settings-topbar window-drag-handle">
        <div className="settings-topbar-left">
          <span className="brand-mark inline-flex items-center justify-center leading-none">✦</span>
          <div className="settings-topbar-copy"><h1>Settings</h1><p>Shape how eVoca runs, stores data, and connects to models.</p></div>
        </div>
        <div className="settings-topbar-actions settings-actions">
          <button type="button" className="chrome-button chrome-button-danger" onClick={() => void evoca.quit()}>Exit eVoca</button>
          <button type="button" className="chrome-button" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="settings-tabs">
        <button type="button" className={section === "general" ? "tab active" : "tab"} onClick={() => setSection("general")}>General</button>
        <button type="button" className={section === "configurations" ? "tab active" : "tab"} onClick={() => setSection("configurations")}>Configurations</button>
        <button type="button" className={section === "providers" ? "tab active" : "tab"} onClick={() => setSection("providers")}>Providers</button>
      </div>

      <div className="settings-workspace">
        {message && <div className={`status-message mb-3 ${message.toLowerCase().includes("successful") || message.toLowerCase().includes("saved") || message.toLowerCase().includes("changed") || message.toLowerCase().includes("found") || message.toLowerCase().includes("added") ? "success" : ""}`}>{message}</div>}

        {section === "general" ? (
          <div className="settings-general-scroll">
            <div className="editor-card">
              <div className="editor-heading"><div><h3>General</h3><p className="mt-1.5 text-[9px] text-white/28">Global behavior and local storage for this installation.</p></div><span>LOCAL</span></div>
              <div className="hotkey-card">
                <div className="editor-section-head"><div><div className="section-title">Global hotkey</div><p>Toggle the launcher from anywhere in Windows.</p></div></div>
                <div className="form-row">
                  <label>Shortcut
                    <select value={hotkey} onChange={async (e) => { const value = e.target.value; try { await evoca.setHotkey(value); setHotkey(value); setMessage(`Hotkey changed to ${value}.`); } catch (error) { setMessage(`Hotkey change failed: ${String(error)}`); } }}>
                      <option>Ctrl+Space</option><option>Ctrl+Shift+Space</option><option>Alt+Space</option><option>Ctrl+Alt+Space</option>
                    </select>
                    <span className="field-help">Escape dismisses the transient launcher views.</span>
                  </label>
                  <div className="setting-value-line self-end"><span>Current</span><code>{hotkey}</code></div>
                </div>
              </div>

              <div className="editor-section">
                <div className="editor-section-head"><div><div className="section-title">Data storage</div><p>SQLite database and captured screenshot files.</p></div><span className="text-[8px] text-white/22">Restart after path changes</span></div>
                <div className="storage-card">
                  <p className="muted mb-4">Choose where eVoca keeps its local database and chat images. Changing these paths is persisted immediately, but the new database location is picked up after restart.</p>
                  {storage && <div className="space-y-3">
                    <label>Database path<input value={storage.databasePath} onChange={(e) => setStorage({ ...storage, databasePath: e.target.value })} /></label>
                    <label>Chat images path<input value={storage.imagesPath} onChange={(e) => setStorage({ ...storage, imagesPath: e.target.value })} /></label>
                    <div className="editor-footer"><small>Local files only · no account required</small><button type="button" className="primary" disabled={storageSaving} onClick={async () => { setStorageSaving(true); try { await evoca.setStorageSettings(storage); setMessage("Storage paths saved. Restart eVoca to apply the new database path."); } catch (error) { setMessage(`Storage settings failed: ${String(error)}`); } finally { setStorageSaving(false); } }}>{storageSaving ? "Saving…" : "Save paths"}</button></div>
                  </div>}
                </div>
              </div>
            </div>
          </div>
        ) : section === "configurations" ? (
          <div className="settings-grid">
            <aside className="settings-sidebar">
              <div className="settings-list-header"><span>Configurations</span><span>{configurations.length}</span></div>
              <button type="button" className="side-row create-row" onClick={() => setConfiguration(freshConfiguration(providers))}><span className="side-row-title"><span className="side-icon">＋</span>New configuration</span></button>
              {configurations.map((s) => <button type="button" key={s.id} className={configuration?.id === s.id ? "side-row active" : "side-row"} onClick={() => setConfiguration(s)}><span className="side-row-title"><span className="side-icon">{s.icon || "✦"}</span>{s.name}</span><small>{providers.find((p) => p.id === s.providerId)?.name || "No provider"} · {s.model || "No model"}</small></button>)}
            </aside>

            <div className="settings-editor">
              {configuration ? <div className="editor-card">
                <div className="editor-heading"><div><h3>{configuration.name || "Configuration"}</h3><p className="mt-1.5 text-[9px] text-white/28">A reusable workflow from input to model result.</p></div><span>CONFIGURATION</span></div>
                <div className="form-row">
                  <label>Name<input value={configuration.name} onChange={e => setConfiguration({...configuration,name:e.target.value})}/></label>
                  <label>Description<input value={configuration.description ?? ""} placeholder="What is this workflow for?" onChange={e => setConfiguration({...configuration,description:e.target.value})}/></label>
                </div>
                <div className="form-row">
                  <label>Provider<select value={configuration.providerId} onChange={e => { const providerId = e.target.value; setConfiguration({ ...configuration, providerId, model: "" }); setConfigurationModels([]); }}><option value="">Select provider</option>{providers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
                  <label>Model<select value={configuration.model} disabled={!configuration.providerId} onChange={e => setConfiguration({...configuration,model:e.target.value})}><option value="">Select model</option>{configuration.model && !configurationModels.some(m => m.name === configuration.model) && <option value={configuration.model}>{configuration.model} (saved)</option>}{configurationModels.map(m => <option key={m.id} value={m.name}>{m.displayName || m.name}</option>)}</select></label>
                </div>
                <label>System Prompt<textarea className="min-h-[240px]" value={configuration.spell} onChange={e => setConfiguration({...configuration,spell:e.target.value})}/><span className="field-help">This prompt is sent as the reusable system instruction for every run.</span></label>
                <div className="editor-section">
                  <div className="editor-section-head"><div><div className="section-title">Generation</div><p>Keep these values close to the task rather than the provider.</p></div></div>
                  <div className="form-row"><label>Temperature<input type="number" step="0.1" min="0" max="2" value={configuration.temperature ?? 0.2} onChange={e => setConfiguration({...configuration,temperature:Number(e.target.value)})}/></label><label>Max tokens<input type="number" min="1" value={configuration.maxTokens ?? 2000} onChange={e => setConfiguration({...configuration,maxTokens:Number(e.target.value)})}/></label></div>
                </div>
                <div className="editor-footer"><button type="button" className="button danger" onClick={async () => { await evoca.deleteConfiguration(configuration.id); const next = await evoca.getConfigurations(); onChange(next); setConfiguration(next[0] ?? null); }}>Delete</button><div className="settings-actions"><small>{configuration.providerId ? "Ready to save" : "Select a provider and model"}</small><button type="button" className="primary button" disabled={saving} onClick={() => void saveConfiguration()}>{saving ? "Saving…" : "Save configuration"}</button></div></div>
              </div> : <div className="editor-card empty-state">Create a configuration from the left panel to begin.</div>}
            </div>
          </div>
        ) : (
          <div className="settings-grid">
            <aside className="settings-sidebar">
              <div className="settings-list-header"><span>Providers</span><span>{providers.length}</span></div>
              <button type="button" className="side-row create-row" onClick={addProvider}><span className="side-row-title"><span className="side-icon">＋</span>Add provider</span></button>
              {providers.map(r => <button type="button" key={r.id} className={provider?.id === r.id ? "side-row active" : "side-row"} onClick={() => { setProvider(r); setDiscoveredModels([]); setSection("providers"); setMessage(""); }}><span className="side-row-title"><span className="side-icon">⌁</span>{r.name}</span><small>{r.kind === "ollama" ? "Ollama" : "OpenAI compatible"}</small></button>)}
            </aside>
            <div className="settings-editor">
              {provider ? <div className="editor-card">
                <div className="editor-heading"><div><h3>{provider.name}</h3><p className="mt-1.5 text-[9px] text-white/28">Connection details, credentials references, and models.</p></div><span>{providers.some((item) => item.id === provider.id) ? "SAVED" : "NEW"}</span></div>
                <div className="provider-actions mb-4"><button type="button" disabled={providerTesting} onClick={() => void testProvider()}>{providerTesting ? "Testing…" : "Test connection"}</button><button type="button" disabled={discoveringModels} onClick={() => void discoverModels()}>{discoveringModels ? "Discovering…" : "Discover models"}</button></div>
                <div className="form-row"><label>Provider name<input value={provider.name} onChange={e => setProvider({...provider,name:e.target.value})}/></label><label>Type<select value={provider.kind} onChange={e => setProvider({...provider,kind:e.target.value})}><option value="openai_compatible">OpenAI compatible</option><option value="ollama">Ollama</option></select></label></div>
                <label>Base URL<input value={provider.baseUrl ?? ""} onChange={e => setProvider({...provider,baseUrl:e.target.value})}/></label>
                <div className="form-row"><label>Credential reference<input value={provider.credentialRef ?? ""} onChange={e => setProvider({...provider,credentialRef:e.target.value})}/></label><label>API key environment variable<input value={provider.apiKeyEnv ?? ""} placeholder="EVOCA_MY_PROVIDER_KEY" onChange={e => setProvider({...provider,apiKeyEnv:e.target.value})}/></label></div>
                <label>Custom headers (JSON)<textarea className="min-h-[120px]" value={provider.headersJson ?? "{}"} onChange={e => setProvider({...provider,headersJson:e.target.value})}/></label>

                <div className="models-section">
                  <div className="editor-section-head"><div><div className="section-title">Models</div><p>Add local model aliases or import what the provider exposes.</p></div><span className="text-[8px] text-white/22">{models.length} saved</span></div>
                  <div className="model-add-row"><input placeholder="Model ID" value={modelName} onChange={e => setModelName(e.target.value)}/><input placeholder="Display name" value={modelLabel} onChange={e => setModelLabel(e.target.value)}/><button type="button" className="button primary" disabled={!modelName.trim()} onClick={() => void addModel()}>Add</button></div>
                  <div className="model-list">{models.filter(Boolean).map(m => <div className="model-row" key={m.id}><span>{m.displayName?.trim() || m.name}</span><code>{m.name}</code><button type="button" className="text-button" onClick={() => void deleteModel(m.id)}>Remove</button></div>)}</div>
                  {discoveredModels.length > 0 && <div className="discovered-models"><div className="section-title">Available from provider</div><div className="model-list">{discoveredModels.map(m => <div className="model-row" key={m.id}><span>{m.displayName?.trim() || m.name}</span><code>{m.name}</code><button type="button" className="text-button" onClick={() => void addDiscoveredModel(m)}>Add</button></div>)}</div></div>}
                </div>
                <div className="editor-footer"><button type="button" className="button danger" onClick={() => void deleteProvider()}>Delete provider</button><button type="button" className="primary button" disabled={saving} onClick={() => void saveProvider()}>{saving ? "Saving…" : "Save provider"}</button></div>
              </div> : <div className="editor-card empty-state">Add a provider from the left panel to connect eVoca to an LLM backend.</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
