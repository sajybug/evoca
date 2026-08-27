import { useEffect, useState } from "react";
import type { Provider, ProviderModel, Configuration, StorageSettings } from "../../types/domain";
import { evoca } from "../../services/evoca";
import { ConfirmModal } from "../common/ConfirmModal";
import { SearchableSelect } from "../common/SearchableSelect";

interface Props {
  configurations: Configuration[];
  onChange: (configurations: Configuration[]) => void;
  onClose: () => void;
}

type Section = "general" | "configurations" | "providers" | "backup";

const settingsLabelClass = "flex flex-col gap-1.5 text-[10px] font-medium leading-4 text-white/55";
const settingsBodyClass = "text-[10px] leading-5 text-white/40";
const settingsHeadingClass = "m-0 text-[12px] font-semibold text-white";
const settingsTitleClass = "m-0 text-[13px] font-semibold tracking-[-.01em] text-white";
const settingsSectionMetaClass = "text-[9px] font-semibold uppercase tracking-[.14em] text-white/25";
const settingsBadgeClass = "text-[8px] font-medium uppercase tracking-[.12em] text-white/22";
const settingsButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40";
const settingsTextareaClass = "min-h-[120px] w-full resize-y rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] leading-5 text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25";


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
  pinned: false,
  lastUsedAt: 0,
  useCount: 0,
  createdAt: 0,
  updatedAt: 0,
});

const freshProvider = (): Provider => ({
  id: crypto.randomUUID(),
  name: "New Provider",
  kind: "openai_compatible",
  baseUrl: "https://api.openai.com/v1",
  credentialRef: `provider_${crypto.randomUUID()}`,
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
  const [backupBusy, setBackupBusy] = useState(false);
  const [providerCredential, setProviderCredential] = useState("");
  const [credentialSaved, setCredentialSaved] = useState(false);
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "configuration" | "provider" | "model" | "restore"; id?: string } | null>(null);

  useEffect(() => {
    if (!message) return;

    const timeout = setTimeout(() => setMessage(""), 3000);

    return () => clearTimeout(timeout);
  }, [message]);

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
    setProviderCredential("");
    setCredentialSaved(false);
    if (!provider?.credentialRef || !providers.some((item) => item.id === provider.id)) return;
    let active = true;
    evoca.hasProviderCredential(provider.credentialRef).then((saved) => { if (active) setCredentialSaved(saved); }).catch(() => { if (active) setCredentialSaved(false); });
    return () => { active = false; };
  }, [provider?.credentialRef, provider?.id, providers]);

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

  async function saveProviderCredential() {
    if (!provider || !provider.credentialRef) { setMessage("Credential reference is required."); return; }
    if (!providerCredential) { setMessage("Enter an API key first."); return; }
    setCredentialBusy(true);
    try {
      await evoca.setProviderCredential(provider.credentialRef, providerCredential);
      setProviderCredential("");
      setCredentialSaved(true);
      setMessage("API key stored in Windows Credential Manager.");
    } catch (error) { setMessage(`Store credential failed: ${String(error)}`); }
    finally { setCredentialBusy(false); }
  }

  async function removeProviderCredential() {
    if (!provider?.credentialRef) return;
    setCredentialBusy(true);
    try {
      await evoca.deleteProviderCredential(provider.credentialRef);
      setCredentialSaved(false);
      setProviderCredential("");
      setMessage("Stored API key removed.");
    } catch (error) { setMessage(`Remove credential failed: ${String(error)}`); }
    finally { setCredentialBusy(false); }
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

  async function performDeleteProvider() {
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

  async function performDeleteModel(id: string) {
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

  async function togglePinnedConfiguration() {
    if (!configuration?.id) return;
    try {
      await evoca.setConfigurationPinned(configuration.id, !configuration.pinned);
      onChange(await evoca.getConfigurations());
      setConfiguration((current) => current ? { ...current, pinned: !current.pinned } : current);
      setMessage(!configuration.pinned ? "Configuration pinned." : "Configuration unpinned.");
    } catch (error) {
      setMessage(`Pin change failed: ${String(error)}`);
    }
  }

  async function duplicateConfiguration() {
    if (!configuration?.id) return;
    try {
      const duplicate = await evoca.duplicateConfiguration(configuration.id);
      const nextConfigurations = await evoca.getConfigurations();
      onChange(nextConfigurations);
      setConfiguration(nextConfigurations.find((item) => item.id === duplicate.id) ?? duplicate);
      setMessage("Configuration duplicated successfully.");
    } catch (error) {
      setMessage(`Duplicate failed: ${String(error)}`);
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
    <section className="h-full w-full overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)] flex flex-col">
      <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4 [--wails-draggable:drag]">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[11px] border border-evoca-accent/20 bg-[#F5E8C5] text-[30px] text-[#1B1B1A] inline-flex items-center justify-center leading-none">✦</span>
          <div><h1 className={settingsTitleClass}>Settings</h1><p className="text-[9px] leading-4 text-white/32">Shape how eVoca runs, stores data, and connects to models.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white !border-red-200/10 !bg-red-300/[.04] !text-red-100/60 hover:!bg-red-300/[.08] hover:!text-red-50" onClick={() => void evoca.quit()}>Exit eVoca</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="mx-5 my-4 grid grid-cols-4 gap-1 rounded-[12px] border border-white/[.06] bg-black/15 p-1">
        <button type="button" className={`${section === "general" ? "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70 bg-white/[.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]" : "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70"}`} onClick={() => setSection("general")}>General</button>
        <button type="button" className={`${section === "configurations" ? "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70 bg-white/[.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]" : "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70"}`} onClick={() => setSection("configurations")}>Configurations</button>
        <button type="button" className={`${section === "providers" ? "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70 bg-white/[.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]" : "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70"}`} onClick={() => setSection("providers")}>Providers</button>
        <button type="button" className={`${section === "backup" ? "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70 bg-white/[.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]" : "rounded-[9px] border-0 bg-transparent px-3 py-2 text-[10px] font-semibold text-white/35 transition hover:bg-white/[.035] hover:text-white/70"}`} onClick={() => setSection("backup")}>Backup</button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-5 pb-5">
        {message && <div className={`pointer-events-none absolute left-5 right-5 z-50 rounded-[10px] border px-3 py-2 text-[9px] leading-4 shadow-lg backdrop-blur-md transition-all duration-200 ${message.toLowerCase().includes("successful") || message.toLowerCase().includes("saved") || message.toLowerCase().includes("changed") || message.toLowerCase().includes("found") || message.toLowerCase().includes("added") ? "border-emerald-200/10 bg-emerald-300/[.04] text-evoca-success" : "border-red-200/10 bg-red-300/[.04] text-evoca-danger"}`}>{message}</div>}

        {section === "general" ? (
          <div className="h-full min-h-0 overflow-y-auto pr-1">
            <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className={settingsHeadingClass}>General</h3><p className="mt-1.5 text-[9px] leading-4 text-white/28">Global behavior and local storage for this installation.</p></div><span className={settingsBadgeClass}>LOCAL</span></div>
              <div className="rounded-[14px] border border-white/[.06] bg-white/[.018] p-4">
                <div className="mb-3 flex items-center justify-between"><div><div className={settingsSectionMetaClass}>Global hotkey</div><p className={settingsBodyClass}>Toggle the launcher from anywhere in Windows.</p></div></div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={settingsLabelClass}>Shortcut
                    <SearchableSelect value={hotkey} options={["Ctrl+Space","Ctrl+Shift+Space","Alt+Space","Ctrl+Alt+Space"].map(value => ({value,label:value}))} onChange={async (value) => { try { await evoca.setHotkey(value); setHotkey(value); setMessage(`Hotkey changed to ${value}.`); } catch (error) { setMessage(`Hotkey change failed: ${String(error)}`); } }} />
                    <span className="mt-1.5 text-[8px] leading-4 text-white/23">Escape dismisses the transient launcher views.</span>
                  </label>
                  <div className="mt-5 my-auto flex items-center justify-between rounded-[10px] border border-white/[.05] bg-black/15 px-3 py-2.5 self-end text-[9px] text-white/35"><span>Current</span><code className="rounded-[6px] border border-white/[.08] bg-white/[.025] px-1.5 py-1 font-mono text-[8px] text-white/33">{hotkey}</code></div>
                </div>
              </div>

              <div className="mt-5 border-t border-white/[.06] pt-4">
                <div className="mb-3 flex items-center justify-between"><div><div className={settingsSectionMetaClass}>Data storage</div><p className={settingsBodyClass}>SQLite database and captured screenshot files.</p></div><span className="text-[8px] text-white/22">Restart after path changes</span></div>
                <div className="rounded-[14px] border border-white/[.06] bg-white/[.018] p-4">
                  <p className="mb-4 text-[10px] leading-5 text-white/35">Choose where eVoca keeps its local database and chat images. Changing these paths is persisted immediately, but the new database location is picked up after restart.</p>
                  {storage && <div className="space-y-3">
                    <label className={settingsLabelClass}>Database file<div className="flex items-center gap-2"><input readOnly className="min-w-0 flex-1 rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white/65 outline-none" value={storage.databasePath} /><button type="button" className={settingsButtonClass} onClick={async () => { try { const selected = await evoca.chooseDirectory(storage.databasePath, "Choose database folder"); if (selected) { const base = selected.replace(/[\\/]+$/, ""); setStorage({ ...storage, databasePath: `${base}\\evoca.db` }); } } catch (error) { setMessage(`Folder selection failed: ${String(error)}`); } }}>Choose…</button></div></label>
                    <label className={settingsLabelClass}>Chat images folder<div className="flex items-center gap-2"><input readOnly className="min-w-0 flex-1 rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white/65 outline-none" value={storage.imagesPath} /><button type="button" className={settingsButtonClass} onClick={async () => { try { const selected = await evoca.chooseDirectory(storage.imagesPath, "Choose chat images folder"); if (selected) setStorage({ ...storage, imagesPath: selected }); } catch (error) { setMessage(`Folder selection failed: ${String(error)}`); } }}>Choose…</button></div></label>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.06] pt-4"><small className="text-[8px] text-white/25">Local files only · no account required</small><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" disabled={storageSaving} onClick={async () => { setStorageSaving(true); try { await evoca.setStorageSettings(storage); setMessage("Storage paths saved. Restart eVoca to apply the new database path."); } catch (error) { setMessage(`Storage settings failed: ${String(error)}`); } finally { setStorageSaving(false); } }}>{storageSaving ? "Saving…" : "Save paths"}</button></div>
                  </div>}
                </div>
              </div>
            </div>
          </div>
        ) : section === "backup" ? (
          <div className="h-full min-h-0 overflow-y-auto pr-1">
            <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className={settingsHeadingClass}>Backup & Restore</h3><p className="mt-1.5 text-[9px] leading-4 text-white/28">Protect local configurations, providers, execution history, and saved chat images.</p></div><span className={settingsBadgeClass}>LOCAL</span></div>
              <div className="space-y-3">
                <div className="rounded-[14px] border border-white/[.06] bg-white/[.018] p-4"><div className="flex items-start justify-between gap-4"><div><div className={settingsSectionMetaClass}>Create backup</div><p className={settingsBodyClass}>A single ZIP contains your SQLite data and the images used by History. API keys are not copied from environment variables.</p></div><button type="button" className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f]" disabled={backupBusy} onClick={async () => { setBackupBusy(true); try { const target = await evoca.chooseBackupSavePath(""); if (target) { await evoca.createBackup(target); setMessage("Backup created successfully."); } } catch (error) { setMessage(`Backup failed: ${String(error)}`); } finally { setBackupBusy(false); } }}>{backupBusy ? "Working…" : "Create backup"}</button></div></div>
                <div className="rounded-[14px] border border-white/[.06] bg-white/[.018] p-4"><div className="flex items-start justify-between gap-4"><div><div className={settingsSectionMetaClass}>Restore backup</div><p className={settingsBodyClass}>Restoring replaces the current local database and History images with the selected backup.</p></div><button type="button" className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-red-200/10 !bg-red-300/[.055] !text-evoca-danger" disabled={backupBusy} onClick={() => setConfirm({ kind: "restore" })}>Restore backup</button></div></div>
                <div className="rounded-[12px] border border-amber-200/[.08] bg-amber-200/[.025] px-3 py-2.5 text-[9px] leading-5 text-white/35">Restoring does not restore operating-system environment variables or other machine secrets.</div>
              </div>
            </div>
          </div>
        ) : section === "configurations" ? (
          <div className="grid min-h-0 h-full grid-cols-[228px_minmax(0,1fr)] gap-5 max-[900px]:grid-cols-1">
            <aside className="min-h-0 overflow-auto border-r border-white/[.06] pr-4 max-[900px]:max-h-[240px] max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:pb-3 max-[900px]:pr-0">
              <div className="mb-2 flex items-center justify-between text-[9px] font-medium uppercase tracking-[.12em] text-white/25"><span>Configurations</span><span>{configurations.length}</span></div>
              <button type="button" className="mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04] mb-3 border-dashed !border-evoca-accent/20 !bg-evoca-accent/[.025] !text-evoca-accent hover:!bg-evoca-accent/[.05]" onClick={() => setConfiguration(freshConfiguration(providers))}><span className="flex items-center gap-2 truncate text-[10px] font-semibold text-white/80"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-white/[.06] bg-white/[.03] text-[10px] text-evoca-accent">＋</span>New configuration</span></button>
              {configurations.map((s) => <button type="button" key={s.id} className={configuration?.id === s.id ? "mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04] border-evoca-accent/30 bg-evoca-accent/[.08] shadow-[inset_2px_0_0_rgba(216,184,110,.65),0_0_0_1px_rgba(216,184,110,.04)]" : "mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04]"} onClick={() => setConfiguration(s)}><span className="flex items-center gap-2 truncate text-[10px] font-semibold text-white/80"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-white/[.06] bg-white/[.03] text-[10px] text-evoca-accent">{s.icon || "✦"}</span>{s.name}</span><small className="text-xs mt-0.5 block truncate !text-white/24">{providers.find((p) => p.id === s.providerId)?.name || "No provider"} · {s.model || "No model"}</small></button>)}
            </aside>

            <div className="min-w-0 min-h-0 overflow-auto">
              {configuration ? <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4">
                <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className={settingsHeadingClass}>{configuration.name || "Configuration"}</h3><p className="mt-1.5 text-[9px] text-white/28">A reusable workflow from input to model result.</p></div><span className={settingsBadgeClass}>CONFIGURATION</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={settingsLabelClass}>Name<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={configuration.name} onChange={e => setConfiguration({...configuration,name:e.target.value})}/></label>
                  <label className={settingsLabelClass}>Description<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={configuration.description ?? ""} placeholder="What is this workflow for?" onChange={e => setConfiguration({...configuration,description:e.target.value})}/></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={settingsLabelClass}>Provider<SearchableSelect value={configuration.providerId} options={[{value:"",label:"Select provider"}, ...providers.map(r => ({value:r.id,label:r.name}))]} onChange={providerId => { setConfiguration({ ...configuration, providerId, model: "" }); setConfigurationModels([]); }} /></label>
                  <label className={settingsLabelClass}>Model<SearchableSelect value={configuration.model} disabled={!configuration.providerId} options={[{value:"",label:"Select model"}, ...(configuration.model && !configurationModels.some(m => m.name === configuration.model) ? [{value:configuration.model,label:`${configuration.model} (saved)`}] : []), ...configurationModels.map(m => ({value:m.name,label:m.displayName || m.name}))]} onChange={model => setConfiguration({...configuration,model})} /></label>
                </div>
                <label className={settingsLabelClass}>System Prompt<textarea className={`${settingsTextareaClass} min-h-[240px]`} value={configuration.spell} onChange={e => setConfiguration({...configuration,spell:e.target.value})}/><span className="mt-1.5 text-[8px] leading-4 text-white/23">This prompt is sent as the reusable system instruction for every run.</span></label>
                <div className="mt-5 border-t border-white/[.06] pt-4">
                  <div className="mb-3 flex items-center justify-between"><div><div className={settingsSectionMetaClass}>Generation</div><p className={settingsBodyClass}>Keep these values close to the task rather than the provider.</p></div></div>
                  <div className="grid grid-cols-2 gap-3"><label className={settingsLabelClass}>Temperature<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" type="number" step="0.1" min="0" max="2" value={configuration.temperature ?? 0.2} onChange={e => setConfiguration({...configuration,temperature:Number(e.target.value)})}/></label><label className={settingsLabelClass}>Max tokens<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" type="number" min="1" value={configuration.maxTokens ?? 2000} onChange={e => setConfiguration({...configuration,maxTokens:Number(e.target.value)})}/></label></div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.06] pt-4"><div className="flex items-center gap-2"><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white" onClick={() => void togglePinnedConfiguration()}>{configuration.pinned ? "Unpin" : "Pin"}</button><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white" onClick={() => void duplicateConfiguration()}>Duplicate</button><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-red-200/10 !bg-red-300/[.055] !text-evoca-danger hover:!bg-red-300/[.09]" onClick={() => setConfirm({ kind: "configuration", id: configuration.id })}>Delete</button><div className="flex items-center gap-2"><small className="text-[8px] text-white/25">{configuration.providerId ? "Ready to save" : "Select a provider and model"}</small><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" disabled={saving} onClick={() => void saveConfiguration()}>{saving ? "Saving…" : "Save configuration"}</button></div></div></div>
              </div> : <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4 flex min-h-[160px] flex-1 items-center justify-center text-center text-[10px] text-white/28">Create a configuration from the left panel to begin.</div>}
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 h-full grid-cols-[228px_minmax(0,1fr)] gap-5 max-[900px]:grid-cols-1">
            <aside className="min-h-0 overflow-auto border-r border-white/[.06] pr-4 max-[900px]:max-h-[240px] max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:pb-3 max-[900px]:pr-0">
              <div className="mb-2 flex items-center justify-between text-[9px] font-medium uppercase tracking-[.12em] text-white/25"><span>Providers</span><span>{providers.length}</span></div>
              <button type="button" className="mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04] mb-3 border-dashed !border-evoca-accent/20 !bg-evoca-accent/[.025] !text-evoca-accent hover:!bg-evoca-accent/[.05]" onClick={addProvider}><span className="flex items-center gap-2 truncate text-[10px] font-semibold text-white/80"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-white/[.06] bg-white/[.03] text-[10px] text-evoca-accent">＋</span>Add provider</span></button>
              {providers.map(r => <button type="button" key={r.id} className={provider?.id === r.id ? "mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04] border-evoca-accent/30 bg-evoca-accent/[.08] shadow-[inset_2px_0_0_rgba(216,184,110,.65),0_0_0_1px_rgba(216,184,110,.04)]" : "mb-1 w-full rounded-[11px] border border-transparent bg-transparent px-3 py-2.5 text-left transition hover:border-white/[.06] hover:bg-white/[.04]"} onClick={() => { setProvider(r); setDiscoveredModels([]); setSection("providers"); setMessage(""); }}><span className="flex items-center gap-2 truncate text-[10px] font-semibold text-white/80"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] border border-white/[.06] bg-white/[.03] text-[10px] text-evoca-accent">⌁</span>{r.name}</span><small className="mt-0.5 block text-[8px] text-white/25">{r.kind === "ollama" ? "Ollama" : "OpenAI compatible"}</small></button>)}
            </aside>
            <div className="min-w-0 min-h-0 overflow-auto">
              {provider ? <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4">
                <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className={settingsHeadingClass}>{provider.name}</h3><p className="mt-1.5 text-[9px] text-white/28">Connection details, credentials references, and models.</p></div><span className={settingsBadgeClass}>{providers.some((item) => item.id === provider.id) ? "SAVED" : "NEW"}</span></div>
                <div className="flex items-center gap-2 mb-4"><button type="button" className={settingsButtonClass} disabled={providerTesting} onClick={() => void testProvider()}>{providerTesting ? "Testing…" : "Test connection"}</button><button type="button" className={settingsButtonClass} disabled={discoveringModels} onClick={() => void discoverModels()}>{discoveringModels ? "Discovering…" : "Discover models"}</button></div>
                <div className="grid grid-cols-2 gap-3"><label className={settingsLabelClass}>Provider name<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={provider.name} onChange={e => setProvider({...provider,name:e.target.value})}/></label><label className={settingsLabelClass}>Type<SearchableSelect value={provider.kind} options={[{value:"openai_compatible",label:"OpenAI compatible"},{value:"ollama",label:"Ollama"}]} onChange={kind => setProvider({...provider,kind})}/></label></div>
                <label className={settingsLabelClass}>Base URL<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={provider.baseUrl ?? ""} onChange={e => setProvider({...provider,baseUrl:e.target.value})}/></label>
                <div className="grid grid-cols-2 gap-3"><label className={settingsLabelClass}>Credential reference<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={provider.credentialRef ?? ""} onChange={e => { setProvider({...provider,credentialRef:e.target.value}); setCredentialSaved(false); }}/></label><label className={settingsLabelClass}>API key environment variable<input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" value={provider.apiKeyEnv ?? ""} placeholder="Optional environment fallback" onChange={e => setProvider({...provider,apiKeyEnv:e.target.value})}/></label></div>
                <div className="mt-3 rounded-[12px] border border-evoca-accent/10 bg-evoca-accent/[.035] p-3"><div className="flex items-center justify-between gap-3"><div><div className={settingsSectionMetaClass}>Windows Credential Manager</div><p className="mt-1 text-[9px] leading-4 text-white/35">API keys are stored outside SQLite and loaded only when a request needs them.</p></div><span className={`text-[8px] font-semibold uppercase tracking-[.12em] ${credentialSaved ? "text-evoca-success" : "text-white/25"}`}>{credentialSaved ? "STORED" : "NOT STORED"}</span></div><div className="mt-2 flex gap-2"><input type="password" autoComplete="off" className="min-w-0 flex-1 rounded-[10px] border border-white/[.075] bg-black/20 px-3 py-2 text-[10px] text-white outline-none placeholder:text-white/22 focus:border-evoca-accent/30" placeholder={credentialSaved ? "Enter a new key to replace the stored one" : "Paste API key"} value={providerCredential} onChange={e => setProviderCredential(e.target.value)} /><button type="button" className={settingsButtonClass} disabled={credentialBusy || !provider.credentialRef || !providerCredential} onClick={() => void saveProviderCredential()}>{credentialBusy ? "Saving…" : "Store key"}</button>{credentialSaved && <button type="button" className={settingsButtonClass} disabled={credentialBusy} onClick={() => void removeProviderCredential()}>Remove</button>}</div></div>
                <label className={settingsLabelClass}>Custom headers (JSON)<textarea className={settingsTextareaClass} value={provider.headersJson ?? "{}"} onChange={e => setProvider({...provider,headersJson:e.target.value})}/></label>

                <div className="mt-5 border-t border-white/[.06] pt-4">
                  <div className="mb-3 flex items-center justify-between"><div><div className={settingsSectionMetaClass}>Models</div><p className={settingsBodyClass}>Add local model aliases or import what the provider exposes.</p></div><span className="text-[8px] text-white/22">{models.length} saved</span></div>
                  <div className="grid grid-cols-[1.15fr_1fr_auto] gap-2"><input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" placeholder="Model ID" value={modelName} onChange={e => setModelName(e.target.value)}/><input className="w-full rounded-[11px] border border-white/[.075] bg-white/[.025] px-3 py-2.5 text-[11px] text-white outline-none transition shadow-[inset_0_1px_0_rgba(255,255,255,.02)] focus:border-evoca-accent/35 focus:bg-white/[.045] focus:ring-2 focus:ring-evoca-accent/[.06] placeholder:text-white/25" placeholder="Display name" value={modelLabel} onChange={e => setModelLabel(e.target.value)}/><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" disabled={!modelName.trim()} onClick={() => void addModel()}>Add</button></div>
                  <div className="mt-2 flex flex-col gap-1.5">{models.filter(Boolean).map(m => <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-[10px] border border-white/[.05] bg-white/[.02] px-2.5 py-2.5" key={m.id}><span className="truncate text-[9px] text-white/65">{m.displayName?.trim() || m.name}</span><code className="truncate rounded-[6px] border border-white/[.08] bg-white/[.025] px-1.5 py-1 font-mono text-[8px] text-white/33">{m.name}</code><button type="button" className="rounded-[8px] border border-transparent px-2 py-1.5 text-[9px] text-white/35 transition hover:bg-white/[.05] hover:text-white" onClick={() => setConfirm({ kind: "model", id: m.id })}>Remove</button></div>)}</div>
                  {discoveredModels.length > 0 && <div className="mt-4 rounded-[11px] border border-dashed border-white/[.06] bg-black/10 p-2.5"><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-white/25">Available from provider</div><div className="mt-2 flex flex-col gap-1.5">{discoveredModels.map(m => <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-[10px] border border-white/[.05] bg-white/[.02] px-2.5 py-2.5" key={m.id}><span className="truncate text-[9px] text-white/65">{m.displayName?.trim() || m.name}</span><code className="truncate rounded-[6px] border border-white/[.08] bg-white/[.025] px-1.5 py-1 font-mono text-[8px] text-white/33">{m.name}</code><button type="button" className="rounded-[8px] border border-transparent px-2 py-1.5 text-[9px] text-white/35 transition hover:bg-white/[.05] hover:text-white" onClick={() => void addDiscoveredModel(m)}>Add</button></div>)}</div></div>}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.06] pt-4"><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-red-200/10 !bg-red-300/[.055] !text-evoca-danger hover:!bg-red-300/[.09]" onClick={() => setConfirm({ kind: "provider", id: provider.id })}>Delete provider</button><button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[.075] bg-white/[.045] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:border-white/[.12] hover:bg-white/[.08] hover:text-white disabled:opacity-40 !border-evoca-accent/35 !bg-evoca-accent !text-[#18170f] !shadow-[0_8px_22px_rgba(216,184,110,.13)] hover:!bg-evoca-accent-2" disabled={saving} onClick={() => void saveProvider()}>{saving ? "Saving…" : "Save provider"}</button></div>
              </div> : <div className="rounded-[16px] border border-white/[.06] bg-white/[.018] p-4 flex min-h-[160px] flex-1 items-center justify-center text-center text-[10px] text-white/28">Add a provider from the left panel to connect eVoca to an LLM backend.</div>}
            </div>
          </div>
        )}
      </div>
    <ConfirmModal
      open={confirm !== null}
      title={confirm?.kind === "restore" ? "Restore backup?" : "Delete item?"}
      message={confirm?.kind === "restore" ? "Current local configurations and History will be replaced." : "This action cannot be undone."}
      confirmLabel={confirm?.kind === "restore" ? "Restore" : "Delete"}
      busy={backupBusy || saving}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => {
        const action = confirm;
        if (!action) return;
        if (action.kind === "restore") {
          setBackupBusy(true);
          try { const target = await evoca.chooseBackupFile(""); if (target) { await evoca.restoreBackup(target); onChange(await evoca.getConfigurations()); setMessage("Backup restored successfully."); } setConfirm(null); }
          catch (error) { setMessage(`Restore failed: ${String(error)}`); }
          finally { setBackupBusy(false); }
          return;
        }
        if (action.kind === "configuration" && action.id) {
          try { await evoca.deleteConfiguration(action.id); const next = await evoca.getConfigurations(); onChange(next); setConfiguration(next[0] ?? null); setConfirm(null); setMessage("Configuration deleted."); } catch (error) { setMessage(String(error)); }
          return;
        }
        if (action.kind === "provider" && action.id) { await performDeleteProvider(); setConfirm(null); return; }
        if (action.kind === "model" && action.id) { await performDeleteModel(action.id); setConfirm(null); }
      }}
    />
    </section>
  );
}
