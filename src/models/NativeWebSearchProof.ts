/** Non-secret evidence for credentials used at handoff. Renewal may keep a login generation, never a credential revision. */
export type NativeWebSearchProof = Readonly<{ generation: string; revision: string }>;
