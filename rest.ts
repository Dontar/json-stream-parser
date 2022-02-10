import { RequestListener } from "http";

type HTTPMethod = "get" | "post" | "put" | "patch" | "del" | "options";
type Handler = (...args: [...Parameters<RequestListener>]) => void | PromiseLike<void>;
type Middleware = (...args: [...Parameters<Handler>, (error?: void) => void]) => void | PromiseLike<void>;
type RestAPIBase = Record<HTTPMethod, (handler: Handler) => RestAPIBase>;
type RestAPI = RestAPIBase & { use(handler: Middleware): RestAPI };

const HTTPMethods: HTTPMethod[] = ["get", "post", "put", "patch", "del", "options"];

function check(middleware: Middleware): Handler {
  return (req, res) => {
    return new Promise((r, j) => {
      const promise = middleware(req, res, err => { err ? j(err) : r() });
      if (promise instanceof Promise) r(promise);
    });
  }
}

export default function rest() {
  const handlers = new Map<string, Handler>();
  const middlewares = new Set<Middleware>();

  const mainHandler: Handler =
    async (req, res) => {
      try {

        for (const handler of middlewares) {
          await check(handler)(req, res);
        }

        if (!res.writableEnded) {
          if (handlers.has(req.method!)) {
            const handler = handlers.get(req.method!)!;
            await handler(req, res);
          } else {
            res.setHeader("Allow", [...handlers.keys()]);
            res.statusCode = 405;
            res.end(`Method ${req.method} Not Allowed`);
          }
        }

      } catch (e) {
        console.error(e);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end(e instanceof Error ? e.message : e as string);
        }
      }
    };

  const api = {
    use(middleware: Middleware) {
      middlewares.add(middleware);
      return this;
    }
  } as RestAPI;

  HTTPMethods.forEach(method => {
    api[method] = (handler: Handler) => {
      handlers.set(method.toUpperCase(), handler);
      return api;
    };
  });

  return Object.assign(mainHandler, api);
}
