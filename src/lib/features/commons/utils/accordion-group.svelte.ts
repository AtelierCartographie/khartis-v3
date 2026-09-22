export interface AccordionGroup {
  isOpen: (key: string) => boolean;
  setOpen: (key: string, expanded: boolean) => void;
}

export function createAccordionGroup(
  initialKey?: () => string | undefined
): AccordionGroup {
  let openKey = $state<string | undefined>(undefined);
  let claimedInitialKey = $state(false);

  const resolvedKey = $derived.by(() => {
    if (claimedInitialKey) return openKey;
    const first = initialKey?.();
    return first ?? undefined;
  });

  return {
    isOpen: (key: string) => resolvedKey === key,
    setOpen: (key: string, expanded: boolean) => {
      claimedInitialKey = true;
      openKey = expanded ? key : undefined;
    }
  };
}
