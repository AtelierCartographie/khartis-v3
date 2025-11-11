/**
 * Hook pour la gestion de la virtualisation et du scroll infini dans un tableau
 * Optimise les performances en ne rendant que les lignes visibles + buffer
 */

export interface UseVirtualScrollProps {
  /** Nombre total de lignes dans le tableau */
  numRows: number | (() => number);

  /** Nombre maximum de lignes à afficher à la fois */
  maxRows: number;

  /** Callback pour charger plus de données */
  onLoadMore: () => Promise<void>;

  /** Référence au container du tableau (optionnel) */
  tableContainer?: HTMLDivElement;
}

export interface UseVirtualScrollReturn {
  /** Indices des lignes actuellement affichées */
  rows: number[];

  /** Index de la première ligne affichée */
  startIndex: number;

  /** Nombre de lignes de décalage pour centrer l'élément */
  offsetRows: number;

  /**
   * Gestionnaire d'événement scroll
   * Charge de nouvelles lignes quand on atteint le haut ou le bas
   */
  handleScroll: () => void;

  /**
   * Navigue vers une ligne spécifique par son ID
   * @param id ID de la ligne (1-based)
   */
  goToId: (id: number) => Promise<void>;

  /**
   * Initialise les lignes à partir d'un index de départ
   * @param start Index de départ (0-based)
   */
  initializeRows: (start: number) => Promise<void>;

  /**
   * Définit la référence du container pour le scroll
   */
  setTableContainer: (container: HTMLDivElement | undefined) => void;
}

/**
 * Crée un tableau d'indices séquentiels
 * @param length Nombre d'éléments
 * @param start Index de départ (défaut: 0)
 * @returns Tableau d'indices [start, start+1, ..., start+length-1]
 */
function createIndexArray(length: number, start = 0): number[] {
  return Array.from({ length }, (_, i) => i + start);
}

/**
 * Hook de virtualisation pour les tableaux avec scroll infini
 *
 * @example
 * ```typescript
 * const virtualScroll = useVirtualScroll({
 *   numRows: () => 10000,
 *   maxRows: 12.5,
 *   onLoadMore: async () => {
 *     await loadData();
 *   }
 * });
 *
 * // Dans le template
 * <div bind:this={tableRef} onscroll={virtualScroll.handleScroll}>
 *   {#each virtualScroll.rows as rowIndex}
 *     <Row index={rowIndex} />
 *   {/each}
 * </div>
 * ```
 */
export function useVirtualScroll(
  props: UseVirtualScrollProps
): UseVirtualScrollReturn {
  let rows = $state<number[]>([]);
  let startIndex = $state<number>(0);
  let tableContainer = $state<HTMLDivElement | undefined>(props.tableContainer);

  // Constantes
  const rowHeight = 32; // Hauteur d'une ligne en pixels
  const offsetRows = 5; // Nombre de lignes de buffer
  const scrollIncrement = 13; // Nombre de lignes à charger par scroll

  /**
   * Obtient le nombre total de lignes
   */
  function getNumRows(): number {
    return typeof props.numRows === 'function'
      ? props.numRows()
      : props.numRows;
  }

  /**
   * Initialise les lignes à afficher à partir d'un index de départ
   */
  async function initializeRows(start: number): Promise<void> {
    const numRows = getNumRows();
    const end = numRows - start;
    const length = Math.min(end, props.maxRows * 2);
    rows = createIndexArray(length, start);
    startIndex = start;
    await props.onLoadMore();
  }

  /**
   * Gère le scroll pour charger de nouvelles lignes
   * - Scroll vers le bas : ajoute des lignes à la fin
   * - Scroll vers le haut : ajoute des lignes au début
   */
  function handleScroll(): void {
    if (!tableContainer) return;

    const numRows = getNumRows();
    const scrollBottom =
      tableContainer.scrollHeight -
      tableContainer.clientHeight -
      tableContainer.scrollTop;

    // Scroll vers le bas
    if (scrollBottom < 1 && rows[rows.length - 1] + 1 < numRows) {
      const endIndex = rows[rows.length - 1] + 1;
      const newEndIndex = Math.min(numRows, endIndex + scrollIncrement);
      const newLength = newEndIndex - endIndex;
      const moreRows = createIndexArray(newLength, endIndex);
      rows = [...rows, ...moreRows];
      props.onLoadMore();
    }
    // Scroll vers le haut
    else if (tableContainer.scrollTop <= 0 && startIndex > 0) {
      const newStartIndex = Math.max(0, startIndex - scrollIncrement);
      const newLength = startIndex - newStartIndex;
      const newRows = createIndexArray(newLength, newStartIndex);
      rows = [...newRows, ...rows];
      startIndex = newStartIndex;
      tableContainer.scrollTop = newLength * rowHeight;
      props.onLoadMore();
    }
  }

  /**
   * Navigue vers une ligne spécifique
   * Centre la ligne dans le viewport si possible
   */
  async function goToId(id: number): Promise<void> {
    const numRows = getNumRows();
    if (numRows === 0 || id > numRows) return;

    const index = id - 1; // Convertir ID (1-based) en index (0-based)
    if (index !== -1) {
      const newStartIndex = Math.max(0, index - offsetRows);
      await initializeRows(newStartIndex);

      // Scroll vers la position de la ligne
      const scrollPosition = offsetRows * rowHeight;
      if (tableContainer) {
        tableContainer.scrollTop = scrollPosition;
      }
    }
  }

  /**
   * Définit la référence du container
   */
  function setTableContainer(container: HTMLDivElement | undefined): void {
    tableContainer = container;
  }

  return {
    get rows() {
      return rows;
    },
    get startIndex() {
      return startIndex;
    },
    get offsetRows() {
      return offsetRows;
    },
    handleScroll,
    goToId,
    initializeRows,
    setTableContainer
  };
}
