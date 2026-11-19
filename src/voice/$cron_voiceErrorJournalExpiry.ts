/** Start immediately on installation; overdue intervals catch up on worker restart. */
export default { fn: "voice.journal.purge", every: "1h", now: true };
