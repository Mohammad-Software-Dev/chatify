const resetCallbacks = new Set();

export const registerStoreReset = (callback) => {
  if (typeof callback !== "function") return () => {};
  resetCallbacks.add(callback);
  return () => resetCallbacks.delete(callback);
};

export const resetRegisteredStores = () => {
  resetCallbacks.forEach((callback) => {
    try {
      callback();
    } catch {
      // Store resets must not block logout/auth cleanup.
    }
  });
};
