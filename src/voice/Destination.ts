/** Where a provider processes captured audio; shown before the microphone is opened. */
export type Destination = {
    /** `cloud` processes audio on a vendor server, `host` keeps it on the machine running MauzCode. */
    kind: "cloud" | "host";
    /** Short user-facing label such as "OpenAI (api.openai.com)"; never a secret or key. */
    label: string;
};
