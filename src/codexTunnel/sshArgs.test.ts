import { test, expect } from 'bun:test';
import sshArgs from './sshArgs';

const build = (args: string[]) => sshArgs({} as Context, null, { connection: { bin: 'ssh', args, host: 'fixture' }, port: 12345 });
test('dedicated tunnel strips inherited multiplexing but retains unrelated options', () => {
    expect(build(['-p', '22', '-o', 'ControlMaster=auto', '-o', 'ControlPath=/tmp/fixture', '-o', 'ControlPersist=60', '--'])).toEqual([
        'ssh', '-p', '22', '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ControlPersist=no', '-o', 'ExitOnForwardFailure=yes', '-N', '-D', '127.0.0.1:12345', '--', 'fixture',
    ]);
});
test('missing option value is not mistaken for a multiplexing option', () => {
    expect(build(['-o']).slice(0, 3)).toEqual(['ssh', '-o', '-o']);
});
