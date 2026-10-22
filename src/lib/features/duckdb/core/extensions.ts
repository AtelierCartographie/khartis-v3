import { DUCK_CONST, EXTENSIONS, LOAD_SPATIAL_SQL } from '../constants';
import type { DuckDBContext, ExtensionName } from '../types';
import { executeQuery } from './query';

const LOAD_SQL: Record<ExtensionName, string> = {
  spatial: `INSTALL ${EXTENSIONS.SPATIAL}; ${LOAD_SPATIAL_SQL}`,
  json: `INSTALL ${EXTENSIONS.JSON}; LOAD ${EXTENSIONS.JSON};`
};

/**
 * Loads an extension once per engine. Concurrent callers share the pending
 * load, and a failed load is attempted again on the next call.
 */
export function ensureExtension(
  ctx: Pick<DuckDBContext, 'connection' | 'extensionLoads'>,
  name: ExtensionName
): Promise<void> {
  const pending = ctx.extensionLoads.get(name);
  if (pending) return pending;

  const load = executeQuery(ctx.connection, LOAD_SQL[name], {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  }).then(() => undefined);
  ctx.extensionLoads.set(name, load);
  load.catch(() => ctx.extensionLoads.delete(name));
  return load;
}
