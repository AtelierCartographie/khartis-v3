import { openDatabase } from './persistence.service';

export function getProjectDatabase(): Promise<IDBDatabase> {
  return openDatabase();
}
