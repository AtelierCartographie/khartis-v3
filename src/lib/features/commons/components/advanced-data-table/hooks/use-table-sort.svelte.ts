/**
 * Hook pour la gestion du tri des colonnes dans un tableau
 * Gère l'état du tri et la logique de toggle ASC/DESC/null
 */

export interface UseTableSortProps {
  /**
   * Callback appelé lorsque le tri change
   * Permet au parent de réagir aux changements (ex: recharger les données)
   */
  onSortChange?: (column: string | null, order: 'ASC' | 'DESC' | null) => void;
}

export interface UseTableSortReturn {
  /** Colonne actuellement triée (null si aucun tri) */
  sortColumn: string | null;

  /** Ordre de tri actuel (ASC, DESC, ou null) */
  sortOrder: 'ASC' | 'DESC' | null;

  /**
   * Trier le tableau par une colonne spécifique
   * @param column Nom de la colonne à trier
   * @param order Ordre de tri (ASC ou DESC)
   */
  sortTable: (column: string, order: 'ASC' | 'DESC') => void;

  /**
   * Toggle le tri d'une colonne
   * Cycle: null → ASC → DESC → null
   * @param column Nom de la colonne
   */
  toggleSort: (column: string) => void;
}

/**
 * Hook de gestion du tri pour les tableaux
 *
 * @example
 * ```typescript
 * const sort = useTableSort({
 *   onSortChange: async (col, order) => {
 *     await reloadData();
 *   }
 * });
 *
 * // Dans le template
 * <button onclick={() => sort.toggleSort('name')}>
 *   Trier par nom
 * </button>
 * ```
 */
export function useTableSort(props?: UseTableSortProps): UseTableSortReturn {
  let sortColumn = $state<string | null>(null);
  let sortOrder = $state<'ASC' | 'DESC' | null>(null);

  /**
   * Définit le tri sur une colonne et un ordre spécifiques
   */
  function sortTable(column: string, order: 'ASC' | 'DESC'): void {
    sortColumn = column;
    sortOrder = order;
    props?.onSortChange?.(column, order);
  }

  /**
   * Toggle le tri d'une colonne avec cycle ASC → DESC → null
   * Si on clique sur une autre colonne, commence par ASC
   */
  function toggleSort(column: string): void {
    if (sortColumn !== column) {
      // Nouvelle colonne : commencer par ASC
      sortColumn = column;
      sortOrder = 'ASC';
    } else {
      // Même colonne : cycler ASC → DESC → null
      if (sortOrder === 'ASC') {
        sortOrder = 'DESC';
      } else if (sortOrder === 'DESC') {
        // Retour à l'état non trié
        sortColumn = null;
        sortOrder = null;
      } else {
        sortOrder = 'ASC';
      }
    }

    props?.onSortChange?.(sortColumn, sortOrder);
  }

  return {
    get sortColumn() {
      return sortColumn;
    },
    get sortOrder() {
      return sortOrder;
    },
    sortTable,
    toggleSort
  };
}
