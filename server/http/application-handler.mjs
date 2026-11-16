const API_PATH = /^(?:\/healthz|\/readyz|\/api\/)/;

export function createApplicationHandler({ api, staticApp }) {
  if (!api || !staticApp) throw new Error("api and staticApp handlers are required");
  return async function handle(request) {
    const path = new URL(request.url).pathname;
    return API_PATH.test(path) ? api(request) : staticApp(request);
  };
}
