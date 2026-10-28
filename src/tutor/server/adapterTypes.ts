// The shape a live adapter package exposes to the app. Adapters live outside src/ (adapters/<name>/)
// and are compiled in only when selected with `npm run tutor:select-adapter`.
import type { TutorProvider } from "../contract";

export interface TutorAdapter {
  /** shown to students for disclosure, e.g. "OpenAI" */
  name: string;
  /** true when the adapter's own server-side credentials are present */
  configured: boolean;
  provider: TutorProvider | null;
  /** model identifiers in use (documented, never sent to the browser) */
  models: Record<string, string>;
}
export type AdapterFactory = (env: Record<string, string | undefined>) => TutorAdapter;
