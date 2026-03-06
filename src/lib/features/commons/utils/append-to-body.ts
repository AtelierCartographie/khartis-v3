export function appendToBody(node: HTMLElement) {
  document.body.appendChild(node);

  return {
    destroy() {
      node.remove();
    }
  };
}
