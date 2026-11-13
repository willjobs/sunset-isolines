/** Serialize map updates and commit only the latest fully prepared frame. */
export function createFramePresenter(prepare, commit) {
  let pending = Promise.resolve();
  return (frame, isCurrent) => {
    const work = pending.then(async () => {
      if (!isCurrent()) return false;
      const prepared = await prepare(frame);
      if (!isCurrent()) return false;
      await commit(prepared);
      return isCurrent();
    });
    pending = work.catch(() => {});
    return work;
  };
}
