/** Preset used only when a new session does not explicitly select one. */
export default {
    type: 'string',
    default: 'standard',
    title: 'Default agent preset',
    description: 'Identifier of the stored preset for new sessions. A missing identifier fails creation; existing snapshots are unchanged.',
};
