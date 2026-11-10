import { z } from 'zod'

/** One CLI-reachable PMS action; each action validates its own `args` in the desktop app. */
export const CodezeraPmsCall = z.object({
  action: z.string().min(1).max(64),
  args: z.unknown().optional()
})
