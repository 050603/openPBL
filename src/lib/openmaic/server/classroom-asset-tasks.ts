export async function runIndependentClassroomAssetTasks(input: {
  media: () => Promise<void>;
  tts: () => Promise<void>;
  persistMergedState: () => Promise<void>;
}): Promise<void> {
  await Promise.all([input.media(), input.tts()]);
  await input.persistMergedState();
}

