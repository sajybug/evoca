import { create } from 'zustand';
type State = 'closed' | 'searching' | 'input' | 'loading' | 'output' | 'error';
interface Store {
  state: State;
  selected: string | null;
  input: string;
  output: string;
  error: string | null;
  open: () => void;
  close: () => void;
  backToSearch: () => void;
  select: (id: string) => void;
  setInput: (v: string) => void;
  setOutput: (v: string) => void;
  appendOutput: (v: string) => void;
  setError: (v: string | null) => void;
  setState: (v: State) => void;
}
export const useOverlayStore = create<Store>((set) => ({
  state: 'closed',
  selected: null,
  input: '',
  output: '',
  error: null,
  open: () => set({ state: 'searching', error: null }),
  close: () => set({ state: 'closed', selected: null, input: '', output: '', error: null }),
  backToSearch: () =>
    set({ state: 'searching', selected: null, input: '', output: '', error: null }),
  select: (id) => set({ state: 'input', selected: id, input: '', output: '', error: null }),
  setInput: (input) => set({ input }),
  setOutput: (output) => set({ output, state: 'output' }),
  appendOutput: (output) => set((current) => ({ output: current.output + output })),
  setError: (error) => set({ error, state: 'error' }),
  setState: (state) => set({ state }),
}));
