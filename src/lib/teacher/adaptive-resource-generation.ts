import type { AdaptiveBranchOutline } from "@/lib/session/types";

export function hasReusableAdaptiveResource(
  branch: AdaptiveBranchOutline,
): boolean {
  return Boolean(
    branch.preparedResource?.status === "ready"
    && branch.preparedResource.classroomId?.trim(),
  );
}

export function selectAdaptiveBranchesForGeneration(
  branches: readonly AdaptiveBranchOutline[],
): AdaptiveBranchOutline[] {
  return branches.filter(
    (branch) =>
      branch.enabled !== false
      &&
      branch.status === "teacher-confirmed"
      && !hasReusableAdaptiveResource(branch),
  );
}
