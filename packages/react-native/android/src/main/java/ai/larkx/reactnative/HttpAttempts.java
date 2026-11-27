package ai.larkx.reactnative;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Active SDK HTTP attempts. Completed attempts are removed. There is no history. */
final class HttpAttempts {
  static final class Attempt {
    final long deadlineNanos;
    final AtomicBoolean settled = new AtomicBoolean(false);
    final Consumer<String> settlement;
    volatile boolean cancelled;
    volatile Object connection;

    Attempt(long deadlineNanos, Consumer<String> settlement) {
      this.deadlineNanos = deadlineNanos;
      this.settlement = settlement;
    }
  }

  private final ConcurrentHashMap<Integer, Attempt> active = new ConcurrentHashMap<>();

  Attempt open(int id, long deadlineNanos, Consumer<String> settlement) {
    Attempt created = new Attempt(deadlineNanos, settlement);
    Attempt previous = active.putIfAbsent(id, created);
    return previous == null ? created : previous;
  }

  Attempt get(int id) {
    return active.get(id);
  }

  /**
   * Marks the attempt finished and removes it.
   * Returns true only for the first caller, so a late callback cannot resolve twice.
   */
  boolean finish(int id) {
    Attempt attempt = active.remove(id);
    if (attempt == null) {
      return false;
    }
    return attempt.settled.compareAndSet(false, true);
  }

  int size() {
    return active.size();
  }

  List<Integer> ids() {
    return new ArrayList<>(active.keySet());
  }

  static int remainingMillis(long deadlineNanos) {
    long nanos = deadlineNanos - System.nanoTime();
    if (nanos <= 0) {
      return 0;
    }
    long millis = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(nanos);
    if (millis <= 0) {
      return 1;
    }
    if (millis > Integer.MAX_VALUE) {
      return Integer.MAX_VALUE;
    }
    return (int) millis;
  }
}
