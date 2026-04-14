import { prisma } from "@/lib/db";

export const TELEGRAM_COACH_MEMORY_MAX_MESSAGES = 10;

export type TelegramCoachMemoryEntry = {
  role: "user" | "assistant";
  content: string;
};

/** Chronological order (oldest first). Most recent TELEGRAM_COACH_MEMORY_MAX_MESSAGES rows. */
export async function getTelegramCoachMemory(
  coachProfileId: string
): Promise<TelegramCoachMemoryEntry[]> {
  const rows = await prisma.telegramCoachMessage.findMany({
    where: { coachProfileId },
    orderBy: { createdAt: "desc" },
    take: TELEGRAM_COACH_MEMORY_MAX_MESSAGES,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
}

/**
 * Append one user + one assistant message and drop oldest rows so total stays ≤ max.
 * Call only after the user successfully received the assistant reply.
 */
export async function appendTelegramCoachExchange(input: {
  coachProfileId: string;
  userContent: string;
  assistantContent: string;
  maxMessages?: number;
}): Promise<void> {
  const max = input.maxMessages ?? TELEGRAM_COACH_MEMORY_MAX_MESSAGES;
  await prisma.$transaction(async (tx) => {
    await tx.telegramCoachMessage.create({
      data: {
        coachProfileId: input.coachProfileId,
        role: "user",
        content: input.userContent,
      },
    });
    await tx.telegramCoachMessage.create({
      data: {
        coachProfileId: input.coachProfileId,
        role: "assistant",
        content: input.assistantContent,
      },
    });
    const count = await tx.telegramCoachMessage.count({
      where: { coachProfileId: input.coachProfileId },
    });
    if (count > max) {
      const drop = count - max;
      const oldest = await tx.telegramCoachMessage.findMany({
        where: { coachProfileId: input.coachProfileId },
        orderBy: { createdAt: "asc" },
        take: drop,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await tx.telegramCoachMessage.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
      }
    }
  });
}
