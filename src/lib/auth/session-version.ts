import type { AuthClaims } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function hasCurrentSessionVersion(
  claims: AuthClaims,
): Promise<boolean> {
  if (!claims.sub) return false;
  if (claims.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({
      where: { id: claims.sub },
      select: { sessionVersion: true },
    });
    return teacher?.sessionVersion === claims.sv;
  }
  const account = await prisma.studentAccount.findUnique({
    where: {
      courseId_studentId: {
        courseId: claims.courseId,
        studentId: claims.studentId,
      },
    },
    select: { sessionVersion: true },
  });
  return account?.sessionVersion === claims.sv;
}
