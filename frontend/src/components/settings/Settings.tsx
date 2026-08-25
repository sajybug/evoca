import { useEffect, useState } from "react";
import type { Provider, ProviderModel, Configuration } from "../../types/domain";
import { evoca } from "../../services/evoca";

interface Props {
  configurations: Configuration[];
  onChange: (configurations: Configuration[]) => void;
  onClose: () => void;
}

type Section = "general" | "configurations" | "providers";

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
  const [configurationModels, setConfigurationModels] = useState<ProviderModel[]>([]);
  const [modelName, setModelName] = useState("");
  const [modelLabel, setModelLabel] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl+Space");

  useEffect(() => {
    evoca.getHotkey().then((value) => setHotkey(value || "Ctrl+Space")).catch(() => setHotkey("Ctrl+Space"));
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
      <div className="brand-row">
        <div><span className="brand-mark">✦</span> Settings</div>
        <div className="settings-actions">
          <button type="button" className="text-button" onClick={onClose}>Close</button>
          <button type="button" className="danger" onClick={() => void evoca.quit()}>Exit eVoca</button>
        </div>
      </div>

      <div className="settings-tabs">
        <button type="button" className={section === "general" ? "tab active" : "tab"} onClick={() => setSection("general")}>
          General
        </button>
        <button type="button" className={section === "configurations" ? "tab active" : "tab"} onClick={() => setSection("configurations")}>
          Configurations
        </button>
        <button type="button" className={section === "providers" ? "tab active" : "tab"} onClick={() => setSection("providers")}>
          Providers
        </button>
      </div>

      {message && <div className="status-message">{message}</div>}

      {section === "general" ? (
        <div className="settings-grid">
          <div className="editor">
            <div className="editor-heading">
              <h3>Global hotkey</h3>
              <span>Toggle overlay</span>
            </div>
            <p className="muted">Pressing this shortcut toggles eVoca between the tray and the foreground. It does not depend on mouse focus or outside clicks.</p>
            <label>Hotkey
              <select value={hotkey} onChange={async (e) => {
                const value = e.target.value;
                try {
                  await evoca.setHotkey(value);
                  setHotkey(value);
                  setMessage(`Hotkey changed to ${value}.`);
                } catch (error) {
                  setMessage(`Hotkey change failed: ${String(error)}`);
                }
              }}>
                <option>Ctrl+Space</option>
                <option>Ctrl+Shift+Space</option>
                <option>Alt+Space</option>
                <option>Ctrl+Alt+Space</option>
              </select>
            </label>
            <div className="status-message">Current: <code>{hotkey}</code></div>
          </div>
        </div>
      ) : section === "configurations" ? (
        <div className="settings-grid">
          <aside className="settings-sidebar">
            <button type="button" className="side-row create-row" onClick={() => setConfiguration(freshConfiguration(providers))}>
              ＋ New configuration
            </button>
            {configurations.map((s) => (
              <button
                type="button"
                key={s.id}
                className={configuration?.id === s.id ? "side-row active" : "side-row"}
                onClick={() => setConfiguration(s)}
              >
                ✦ {s.name}
              </button>
            ))}
          </aside>

          <div className="editor">
            {configuration ? (
              <>
                <label>Name<input value={configuration.name} onChange={e => setConfiguration({...configuration,name:e.target.value})}/></label>
                <label>Description<input value={configuration.description ?? ""} onChange={e => setConfiguration({...configuration,description:e.target.value})}/></label>

                <div className="form-row">
                  <label>Provider
                    <select
                      value={configuration.providerId}
                      onChange={e => {
                        const providerId = e.target.value;
                        setConfiguration({ ...configuration, providerId, model: "" });
                        setConfigurationModels([]);
                      }}
                    >
                      <option value="">Select provider</option>
                      {providers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>

                  <label>Model
                    <select
                      value={configuration.model}
                      disabled={!configuration.providerId}
                      onChange={e => setConfiguration({...configuration,model:e.target.value})}
                    >
                      <option value="">Select model</option>
                      {configuration.model && !configurationModels.some(m => m.name === configuration.model) && (
                        <option value={configuration.model}>{configuration.model} (saved)</option>
                      )}
                      {configurationModels.map(m => (
                        <option key={m.id} value={m.name}>{m.displayName || m.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>System Prompt<textarea value={configuration.spell} onChange={e => setConfiguration({...configuration,spell:e.target.value})}/></label>

                <div className="form-row">
                  <label>Temperature<input type="number" step="0.1" min="0" max="2" value={configuration.temperature ?? 0.2} onChange={e => setConfiguration({...configuration,temperature:Number(e.target.value)})}/></label>
                  <label>Max tokens<input type="number" min="1" value={configuration.maxTokens ?? 2000} onChange={e => setConfiguration({...configuration,maxTokens:Number(e.target.value)})}/></label>
                </div>

                <div className="footer">
                  <button type="button" className="danger" onClick={async () => {
                    await evoca.deleteConfiguration(configuration.id);
                    const next = await evoca.getConfigurations();
                    onChange(next);
                    setConfiguration(next[0] ?? null);
                  }}>Delete</button>
                  <button type="button" className="primary" disabled={saving} onClick={() => void saveConfiguration()}>
  {saving ? "Saving..." : "Save configuration"}
</button>
                </div>
              </>
            ) : <div className="empty-state">Create your first configuration.</div>}
          </div>
        </div>
      ) : (
        <div className="settings-grid">
          <aside className="settings-sidebar">
            <button type="button" className="side-row create-row" onClick={addProvider}>
              ＋ Add provider
            </button>

            {providers.map(r => (
              <button
                type="button"
                key={r.id}
                className={provider?.id === r.id ? "side-row active" : "side-row"}
                onClick={() => {
                  setProvider(r);
                  setSection("providers");
                  setMessage("");
                }}
              >
                {r.name}
              </button>
            ))}
          </aside>

          <div className="editor">
            {provider ? (
              <>
                <div className="editor-heading">
                  <h3>{provider.name}</h3>
                  <span>{providers.some((item) => item.id === provider.id) ? "Saved" : "New"}</span>
                </div>

                <label>Provider name<input value={provider.name} onChange={e => setProvider({...provider,name:e.target.value})}/></label>

                <div className="form-row">
                  <label>Type<select value={provider.kind} onChange={e => setProvider({...provider,kind:e.target.value})}>
                    <option value="openai_compatible">OpenAI compatible</option>
                    <option value="ollama">Ollama</option>
                  </select></label>

                  <label>Base URL<input value={provider.baseUrl ?? ""} onChange={e => setProvider({...provider,baseUrl:e.target.value})}/></label>
                </div>

                <div className="form-row">
                  <label>Credential reference<input value={provider.credentialRef ?? ""} onChange={e => setProvider({...provider,credentialRef:e.target.value})}/></label>
                  <label>API key environment variable<input value={provider.apiKeyEnv ?? ""} placeholder="EVOCA_MY_PROVIDER_KEY" onChange={e => setProvider({...provider,apiKeyEnv:e.target.value})}/></label>
                </div>

                <label>Custom headers (JSON)<textarea value={provider.headersJson ?? "{}"} onChange={e => setProvider({...provider,headersJson:e.target.value})}/></label>

                <div className="models-section">
                  <div className="section-title">Models</div>
                  <div className="model-add-row">
                    <input placeholder="Model ID" value={modelName} onChange={e => setModelName(e.target.value)}/>
                    <input placeholder="Display name" value={modelLabel} onChange={e => setModelLabel(e.target.value)}/>
                    <button type="button" className="secondary" disabled={!modelName.trim()} onClick={() => void addModel()}>Add</button>
                  </div>

                  <div className="model-list">
                    {models.filter(Boolean).map(m => (
                      <div className="model-row" key={m.id}>
                        <span>{m.displayName?.trim() || m.name}</span>
                        <code>{m.name}</code>
                        <button type="button" className="text-button" onClick={() => void deleteModel(m.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="footer">
                  <button type="button" className="danger" onClick={() => void deleteProvider()}>Delete provider</button>
                  <button type="button" className="primary" disabled={saving} onClick={() => void saveProvider()}>
  {saving ? "Saving..." : "Save provider"}
</button>
                </div>
              </>
            ) : (
              <div className="empty-state">Click “Add provider” to create one.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
