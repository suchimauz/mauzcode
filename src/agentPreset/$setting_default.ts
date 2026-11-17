/** Preset used only when a new session does not explicitly select one. */
export default {
    type: 'string',
    default: 'standard',
    title: 'Default agent preset',
    description: 'Identifier of the code-defined built-in or stored custom preset for new sessions. A missing identifier fails creation; existing snapshots are unchanged.',
};
