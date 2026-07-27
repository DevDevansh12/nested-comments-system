import morgan, { StreamOptions } from "morgan";
import { env } from "../config/env";

const stream: StreamOptions = {
  write: (message: string) => {
    process.stdout.write(message);
  },
};

const format = env.isProd() ? "combined" : "dev";

export const loggerMiddleware = morgan(format, { stream });
