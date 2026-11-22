/** Return the server allow-list of UI icon identifiers shared by commands and tools. */
export default function (_ctx: Context, _session: Session | null, _opts: {}): string[] {
    return [
        'file', 'file-plus', 'file-edit', 'search', 'terminal', 'code', 'answer', 'checklist', 'check',
        'delegate', 'flag', 'form', 'canvas', 'archive', 'compass', 'book', 'target', 'comment',
        'comment-check', 'plug', 'unplug', 'stop', 'info', 'ticket', 'clock', 'user', 'list', 'status',
        'wrench', 'alarm-clock', 'list-checks', 'circle-dashed', 'paperclip',
    ];
}
