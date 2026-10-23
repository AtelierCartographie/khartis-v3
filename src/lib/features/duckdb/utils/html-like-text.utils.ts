import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { isTextLikeColumnType } from '$lib/features/commons/utils/html-like-text.utils';
import { sqlIdentifier } from '$lib/features/commons/utils/sql.utils';

export function buildStripHtmlTextSqlExpression(expression: string): string {
  return `strip_html_text(${expression}::VARCHAR)`;
}

export function buildOrderedColumnExpression(
  columnName: string,
  columnType: string | null | undefined
): string {
  const columnRef = sqlIdentifier(columnName);

  return isTextLikeColumnType(columnType)
    ? buildStripHtmlTextSqlExpression(columnRef)
    : columnRef;
}

export function buildOrderClause(
  columnName: string,
  columnType: string | null | undefined,
  order: 'ASC' | 'DESC'
): string {
  const direction = order === 'DESC' ? 'DESC' : 'ASC';
  const orderedExpression = buildOrderedColumnExpression(
    columnName,
    columnType
  );

  return `${orderedExpression} ${direction} NULLS LAST, "${INTERNAL_COLUMN.ID}" ${direction}`;
}
