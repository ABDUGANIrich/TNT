import * as fs from 'node:fs/promises';
import path from 'node:path';
import { BRIDGE, ROOT, json, type Plan, type State } from './model.js';
import { exists, hash, safePath, snapshot } from './paths.js';

export const MUTEX = '.skill-tree-mutation.lock';
export const TRANSACTION = '.skill-tree-transaction';
export const RECOVERY_MUTEX = '.skill-tree-recovery.lock';
const digest = (files: Map<string, Buffer>): string => hash(json([...files].map(([p,b]) => [p,hash(b)]).sort(([a],[b]) => a! < b! ? -1 : a! > b! ? 1 : 0)));
interface Journal { schemaVersion: 1; status: 'prepared' | 'committed'; hadRoot: boolean; before: string; after: string; oldBridge: string | null; newBridge: string | null; bridgeChanged: boolean }

export async function assertIdle(project: string): Promise<void> {
  if (await exists(await safePath(project, RECOVERY_MUTEX))) throw new Error('Recovery is in progress; wait before accessing the installation.');
  if (await exists(await safePath(project, MUTEX))) throw new Error('Another mutation is running, or its lock is stale. If the owning process has exited, run skill-tree recover.');
  if (await exists(await safePath(project, TRANSACTION))) throw new Error('Interrupted transaction found. Run skill-tree recover before continuing.');
}
export async function withMutation<T>(project: string, action: () => Promise<T>, recovery = false): Promise<T> {
  const guardPath = await safePath(project, RECOVERY_MUTEX);
  if (!recovery) {
    if (await exists(guardPath)) throw new Error('Recovery lock exists. Wait for recovery to finish; inspect its PID if the process exited.');
    return lockedMutation(project,action,false);
  }
  // Serialize stale-lock reclamation itself, so two recovery processes cannot unlink
  // a newly acquired mutation lock. A crashed recovery guard requires manual inspection.
  let guard;
  try { guard = await fs.open(guardPath,'wx'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Recovery lock exists. If its process exited, verify no skill-tree process is running before manually removing .skill-tree-recovery.lock.'); throw e; }
  try {
    await guard.writeFile(json({pid:process.pid})); await guard.sync(); await guard.close();
    return await lockedMutation(project,action,true);
  } finally { await guard.close().catch(() => {}); await fs.unlink(guardPath); }
}
async function lockedMutation<T>(project: string, action: () => Promise<T>, recovery: boolean): Promise<T> {
  await safePath(project);
  const mutex = await safePath(project, MUTEX);
  if (recovery && await exists(mutex)) {
    const owner = JSON.parse(await fs.readFile(mutex, 'utf8')) as {pid: number};
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid mutation lock; inspect it manually.');
    try { process.kill(owner.pid, 0); throw new Error(`Mutation process ${owner.pid} is still alive; recovery refused.`); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
    await fs.unlink(mutex);
  }
  let handle;
  try { handle = await fs.open(mutex, 'wx'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Conflicting mutation lock. Wait for the other command, or use recover after it exits.'); throw e; }
  try {
    await handle.writeFile(json({pid:process.pid})); await handle.sync(); await handle.close();
    if (!recovery && await exists(await safePath(project,RECOVERY_MUTEX))) throw new Error('Recovery began while acquiring the mutation lock; retry after recovery.');
    if (!recovery && await exists(await safePath(project, TRANSACTION))) throw new Error('Interrupted transaction found. Run skill-tree recover.');
    return await action();
  } finally { await handle.close().catch(() => {}); await fs.unlink(mutex); }
}
async function writeDurable(file: string, bytes: string | Buffer): Promise<void> {
  const h = await fs.open(file, 'w');
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
}
async function setBridge(project: string, value: Buffer | null): Promise<void> {
  const file = await safePath(project, BRIDGE);
  if (value) {
    await fs.mkdir(path.dirname(file), {recursive:true});
    const temporary = await safePath(project, TRANSACTION + '/bridge-next');
    await writeDurable(temporary, value);
    await fs.rename(temporary, file);
  } else if (await exists(file)) await fs.unlink(file);
}
async function bridgeBytes(project: string): Promise<Buffer | null> {
  const file = await safePath(project, BRIDGE);
  return await exists(file) ? fs.readFile(file) : null;
}
export async function commit(project: string, plan: Plan, previous: State | null, checkpoint?: (phase: string) => void): Promise<void> {
  if (!plan.changed) return;
  const root = await safePath(project, ROOT); const txn = await safePath(project, TRANSACTION);
  const before = previous?.files ?? new Map<string,Buffer>();
  if (digest(await snapshot(root)) !== digest(before)) throw new Error('Installation changed while planning; retry.');
  await fs.mkdir(txn);
  const stage = path.join(txn, 'stage'); const backup = path.join(txn, 'backup');
  let journalWritten = false;
  try {
    if (previous) await fs.cp(root, stage, {recursive:true, preserveTimestamps:true, errorOnExist:true});
    else await fs.mkdir(stage);
    for (const p of plan.removals) {
      const file = await safePath(stage, p); await fs.unlink(file);
      let parent = path.dirname(file);
      while (parent !== stage) {
        try { await fs.rmdir(parent); } catch (e) { if (['ENOTEMPTY','EEXIST'].includes((e as NodeJS.ErrnoException).code ?? '')) break; throw e; }
        parent = path.dirname(parent);
      }
    }
    for (const [p,b] of plan.files) {
      const file = await safePath(stage,p);
      if (previous?.files.get(p)?.equals(b)) continue;
      await fs.mkdir(path.dirname(file),{recursive:true}); await writeDurable(file,b);
    }
    const after = await snapshot(stage);
    // Recheck the live tree and bridge after staging, before the first destructive rename.
    if (digest(await snapshot(root)) !== digest(before)) throw new Error('Installation changed during staging; retry.');
    const currentBridge = plan.integration === 'unchanged' ? previous?.bridge ?? null : await bridgeBytes(project);
    if (plan.integration !== 'unchanged' && (currentBridge?.toString('base64') ?? null) !== (previous?.bridge?.toString('base64') ?? null)) throw new Error('Host integration changed during staging; retry.');
    const journal: Journal = {schemaVersion:1,status:'prepared',hadRoot:!!previous,before:digest(before),after:digest(after),oldBridge:previous?.bridge?.toString('base64') ?? null,newBridge:plan.bridge?.toString('base64') ?? null,bridgeChanged:plan.integration !== 'unchanged'};
    await writeDurable(path.join(txn,'journal.json'),json(journal)); journalWritten = true;
    checkpoint?.('staged');
    if (previous) await fs.rename(root,backup);
    checkpoint?.('backed-up');
    await fs.rename(stage,root);
    checkpoint?.('installed');
    if (journal.bridgeChanged) await setBridge(project,plan.bridge);
    checkpoint?.('integrated');
    // Atomic commit marker: recovery rolls back before this, finishes cleanup after it.
    await writeDurable(path.join(txn,'journal-next.json'),json({...journal,status:'committed'}));
    await fs.rename(path.join(txn,'journal-next.json'),path.join(txn,'journal.json'));
    await fs.rm(txn,{recursive:true});
  } catch (error) {
    if (journalWritten) {
      try { await recover(project); }
      catch (rollback) { throw new Error(`Commit failed: ${(error as Error).message}. Recovery needed: ${(rollback as Error).message}`); }
    } else await fs.rm(txn,{recursive:true,force:true});
    throw error;
  }
}
export async function recover(project: string, dryRun = false): Promise<string> {
  const txn = await safePath(project,TRANSACTION); const root = await safePath(project,ROOT);
  if (!await exists(txn)) return 'No interrupted transaction.';
  const journalPath = await safePath(txn,'journal.json');
  if (!await exists(journalPath)) {
    // The live installation is never touched before the journal is durable.
    if (!dryRun) { await snapshot(txn); await fs.rm(txn,{recursive:true}); }
    return dryRun ? 'Would discard staging/cleanup remnants; live installation unchanged.' : 'Discarded staging/cleanup remnants; live installation unchanged.';
  }
  const j = JSON.parse(await fs.readFile(journalPath,'utf8')) as Journal;
  if (j.schemaVersion !== 1 || !['prepared','committed'].includes(j.status) || typeof j.hadRoot !== 'boolean' || typeof j.bridgeChanged !== 'boolean' || !/^[a-f0-9]{64}$/.test(j.before) || !/^[a-f0-9]{64}$/.test(j.after) ||
    [j.oldBridge,j.newBridge].some(b => b !== null && (typeof b !== 'string' || Buffer.from(b,'base64').toString('base64') !== b))) throw new Error('Invalid recovery journal; restore from backup manually.');
  await snapshot(txn); // rejects symlinks anywhere before recursive cleanup
  if (j.status === 'committed') {
    if (digest(await snapshot(root)) !== j.after) throw new Error('Committed installation changed before cleanup; preserve edits and inspect transaction manually.');
    if (j.bridgeChanged && ((await bridgeBytes(project))?.toString('base64') ?? null) !== j.newBridge) throw new Error('Committed host bridge changed before cleanup.');
    if (!dryRun) await fs.rm(txn,{recursive:true});
    return dryRun ? 'Would finish committed transaction cleanup.' : 'Finished committed transaction cleanup.';
  }
  const backup = await safePath(txn,'backup'); const hasBackup = await exists(backup); const hasRoot = await exists(root);
  if (hasBackup && digest(await snapshot(backup)) !== j.before) throw new Error('Backup changed; recovery refuses to overwrite files.');
  const liveDigest = digest(await snapshot(root));
  if (hasRoot && liveDigest !== j.after && liveDigest !== j.before) throw new Error('Live files changed since interruption. Save these edits before manual recovery.');
  if (j.hadRoot && !hasBackup && (!hasRoot || liveDigest !== j.before)) throw new Error('Original backup missing; manual recovery required.');
  if (j.bridgeChanged) {
    const actual = (await bridgeBytes(project))?.toString('base64') ?? null;
    if (actual !== j.oldBridge && actual !== j.newBridge) throw new Error('Host bridge changed or its write was interrupted. Restore the oldBridge bytes from journal.json before recovery.');
  }
  if (dryRun) return 'Would restore the previous installation and host bridge from the transaction journal.';
  if (hasBackup) {
    if (hasRoot) await fs.rm(root,{recursive:true});
    await fs.rename(backup,root);
  } else if (!j.hadRoot && hasRoot) await fs.rm(root,{recursive:true});
  if (j.bridgeChanged) await setBridge(project,j.oldBridge === null ? null : Buffer.from(j.oldBridge,'base64'));
  await fs.rm(txn,{recursive:true});
  return 'Recovered previous installation and host integration.';
}
