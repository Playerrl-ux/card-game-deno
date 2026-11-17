import z from "zod";

export const eventDataSchema = z.object({
  name: z.enum(["DATABASE_WRITE", "DATABASE_READ"]),
  matchId: z.string().optional().default("any"),
  promiseId: z.number().optional(),
  data: z.object({
    sql: z.string(),
    args: z.any(),
    method: z.enum(["get", "all"]).optional().default("all"),
    useMain: z.boolean().optional().default(false),
    alreadyWritten: z.boolean().optional().default(false),
  }),
});

export const mainSttmSchema = z.object({
  name: z.enum(["MAIN_STATEMENT"]),
  mainSttm: z.string(),
});

export const finishGameSchema = z.object({
  name: z.enum(["FINISH_GAME"]),
  matchId: z.string(),
  promiseId: z.number(),
});

export type EventData = z.infer<typeof eventDataSchema>;

export const generalSchema = z.union([
  eventDataSchema,
  mainSttmSchema,
  finishGameSchema,
]);

export type GeneralType = z.infer<typeof generalSchema>;

export const ackDataSchema = z.object({
  promiseId: z.number(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type AckData = z.infer<typeof ackDataSchema>;
