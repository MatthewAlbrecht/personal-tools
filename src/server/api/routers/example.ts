import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const exampleRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.name ?? "World"}!`,
      };
    }),

  getAll: publicProcedure.query(() => {
    return [
      { id: 1, text: "Example item 1" },
      { id: 2, text: "Example item 2" },
      { id: 3, text: "Example item 3" },
    ];
  }),

  create: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(({ input }) => {
      // In a real app, this would save to a database
      return {
        id: Math.floor(Math.random() * 10000),
        text: input.text,
        createdAt: new Date(),
      };
    }),
});

