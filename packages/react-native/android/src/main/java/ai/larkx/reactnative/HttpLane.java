package ai.larkx.reactnative;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * At most four SDK requests run, and at most eight wait. A further request is
 * rejected immediately. Queue time counts toward the request deadline.
 */
final class HttpLane {
  static final int MAX_ACTIVE = 4;
  static final int MAX_QUEUED = 8;

  private HttpLane() {}

  static ThreadPoolExecutor create() {
    ThreadPoolExecutor executor =
        new ThreadPoolExecutor(
            MAX_ACTIVE,
            MAX_ACTIVE,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(MAX_QUEUED),
            runnable -> {
              Thread thread = new Thread(runnable, "larkx-http");
              thread.setDaemon(true);
              return thread;
            },
            new ThreadPoolExecutor.AbortPolicy());
    executor.prestartAllCoreThreads();
    return executor;
  }
}
