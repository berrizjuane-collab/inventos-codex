/** Yield a browser task without the 4 ms clamp of nested setTimeout calls. */
export function yieldToMessages(): Promise<void> {
  return new Promise(resolve => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { port1.close(); port2.close(); resolve(); };
    port2.postMessage(null);
  });
}
