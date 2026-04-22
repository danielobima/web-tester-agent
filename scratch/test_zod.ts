import { z } from "zod";

const Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("a"), value: z.string() }),
  z.object({ kind: z.enum(["b", "c"]), data: z.number() })
]);

console.log("Validating 'a':", Schema.safeParse({ kind: "a", value: "test" }).success);
console.log("Validating 'b':", Schema.safeParse({ kind: "b", data: 123 }).success);
console.log("Validating 'c':", Schema.safeParse({ kind: "c", data: 456 }).success);
console.log("Validating 'd' (fail):", Schema.safeParse({ kind: "d", data: 789 }).success);
