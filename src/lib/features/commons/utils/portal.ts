export function portal(
  node: HTMLElement,
  target: HTMLElement | string = document.body
) {
  let resolvedTarget: HTMLElement | null = null;

  function attach(targetEl: HTMLElement | string) {
    resolvedTarget =
      typeof targetEl === 'string'
        ? document.querySelector<HTMLElement>(targetEl)
        : targetEl;
    if (resolvedTarget) {
      resolvedTarget.appendChild(node);
    }
  }

  attach(target);

  return {
    update(newTarget: HTMLElement | string) {
      attach(newTarget);
    },
    destroy() {
      node.parentElement?.removeChild(node);
    }
  };
}
