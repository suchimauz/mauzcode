/** Values that can be stored in a durable command result and returned over HTTP. */
export type Json = string | number | boolean | null | types.commands.Json[] | {[key: string]: types.commands.Json};
