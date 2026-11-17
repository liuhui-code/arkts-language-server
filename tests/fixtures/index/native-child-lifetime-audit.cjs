// Passive observation of an explicitly selected real Native child; no response,
// stream encoding, timing barrier, launcher substitution or termination policy.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const owner = process.env.ARKTS_TEST_NATIVE_OWNER_AUDIT;
const wire = process.env.ARKTS_TEST_NATIVE_WIRE_AUDIT;
const expected = process.env.ARKTS_TEST_NATIVE_BINARY;
if (wire && !expected) throw Error('wire observation requires explicit Native identity');
const append = (file, value) => fs.appendFileSync(file, JSON.stringify({ at: Date.now(), ...value })+'\n');
function frames(kind) {
  let pending = Buffer.alloc(0), failed = false;
  const error = message => { failed = true; append(wire, { kind: 'audit-error', direction: kind, message }); };
  return {
    add(chunk, encoding) {
      if (failed || chunk === undefined || chunk === null) return;
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk);
      pending = Buffer.concat([pending, bytes]);
      for (;;) {
        const end = pending.indexOf(10);
        if (end < 0) break;
        const line = pending.subarray(0, end); pending = pending.subarray(end+1);
        if (line.length > 16*1024*1024) return error('audit frame exceeded limit');
        if (!line.length) continue;
        try { append(wire, { kind, frame: JSON.parse(line.toString('utf8')) }); }
        catch (cause) { return error(String(cause)); }
      }
      if (pending.length > 16*1024*1024) error('audit frame exceeded limit');
    },
    finish() { if (!failed && pending.length) error('partial protocol frame'); },
  };
}
if (owner || wire) {
  const original = cp.spawn;
  cp.spawn = function(command, args, ...rest) {
    const plain = typeof command === 'string' && Array.isArray(args) && args.length === 0;
    const observeOwner = owner && plain && /^arkts-index-sidecar(?:\.exe)?$/.test(path.basename(command));
    const observeWire = wire && plain && path.resolve(command) === path.resolve(expected);
    // A bad wire identity fails before any child is created. The existing owner
    // path keeps its prior observation/return behavior.
    const digest = observeWire ? createHash('sha256').update(fs.readFileSync(command)).digest('hex') : undefined;
    const child = Reflect.apply(original, this, [command, args, ...rest]);
    if (observeOwner) {
      append(owner, { kind: 'identity', pid: child.pid, binary: command,
        sha256: digest ?? createHash('sha256').update(fs.readFileSync(command)).digest('hex') });
      for (const name of ['stdout', 'stderr']) child[name].on('data', bytes => fs.appendFileSync(owner+'.'+name+'.raw', bytes));
      child.on('close', (code, signal) => append(owner, { kind: 'exit', code, signal, pid: child.pid }));
    }
    if (observeWire) {
      append(wire, { kind: 'identity', pid: child.pid, binary: command, sha256: digest });
      const input = frames('request'), output = frames('response');
      let depth = 0;
      for (const method of ['write', 'end']) {
        const originalCall = child.stdin[method];
        child.stdin[method] = function(chunk, encoding) {
          depth++;
          try {
            const result = Reflect.apply(originalCall, this, arguments);
            if (depth === 1) {
              input.add(chunk, typeof encoding === 'string' ? encoding : undefined);
              if (method === 'end') input.finish();
            }
            return result;
          } finally { depth--; }
        };
      }
      child.stdin.on('error', error => append(wire, { kind: 'stdin-error', message: error.message }));
      child.stdout.on('data', chunk => output.add(chunk));
      child.stdout.on('end', () => output.finish());
      child.on('error', error => append(wire, { kind: 'spawn-error', message: error.message }));
      child.on('close', (code, signal) => { input.finish(); append(wire, { kind: 'exit', code, signal, pid: child.pid }); });
    }
    return child;
  };
}
