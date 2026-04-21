import { openDatabase } from './persistence';

export function getProjectDatabase(): Promise<IDBDatabase> {
  return openDatabase();
}
