package ai.larkx.reactnative;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Java lifecycle checks. This is not an Android emulator or device run. */
public final class HttpAttemptsTest {
  public static void main(String[] args) throws Exception {
    completedRequestsLeaveNoBookkeeping();
    aLateFinishDoesNotResolveTwice();
    cancellationRemovesTheAttempt();
    theLaneRejectsWorkBeyondTheQueue();
    queuedWorkUsesTheOriginalDeadline();
    System.out.println("android http bookkeeping checks passed");
  }

  private static void completedRequestsLeaveNoBookkeeping() {
    HttpAttempts attempts = new HttpAttempts();
    List<String> results = new ArrayList<>();
    for (int id = 0; id < 80; id++) {
      int requestId = id;
      HttpAttempts.Attempt attempt =
          attempts.open(requestId, System.nanoTime(), results::add);
      String kind = "ok";
      if (requestId % 4 == 1) {
        kind = "network";
      } else if (requestId % 4 == 2) {
        kind = "timeout";
      } else if (requestId % 4 == 3) {
        kind = "cancelled";
      }
      if ("cancelled".equals(kind)) {
        attempt.cancelled = true;
      }
      check(attempts.finish(requestId), "the first completion wins");
      results.add(kind);
    }
    check(attempts.size() == 0, "completed requests stay in the table");
    check(results.size() == 80, "every completion was recorded");
  }

  private static void aLateFinishDoesNotResolveTwice() {
    HttpAttempts attempts = new HttpAttempts();
    AtomicInteger resolved = new AtomicInteger();
    attempts.open(7, System.nanoTime(), (payload) -> resolved.incrementAndGet());
    check(attempts.finish(7), "the first finish succeeds");
    check(!attempts.finish(7), "a late finish succeeds");
    check(attempts.size() == 0, "a finished request remains");
    check(resolved.get() == 0, "finish itself must not resolve");
  }

  private static void cancellationRemovesTheAttempt() {
    HttpAttempts attempts = new HttpAttempts();
    AtomicInteger resolved = new AtomicInteger();
    HttpAttempts.Attempt attempt =
        attempts.open(3, System.nanoTime(), (payload) -> {
          check("cancelled".equals(payload), "cancel payload");
          resolved.incrementAndGet();
        });
    attempt.cancelled = true;
    check(attempts.finish(3), "cancel finishes the attempt");
    attempt.settlement.accept("cancelled");
    check(!attempts.finish(3), "cancel then completion both finish");
    check(attempts.get(3) == null, "cancelled request remains");
    check(resolved.get() == 1, "cancel resolved more than once");
  }

  private static void theLaneRejectsWorkBeyondTheQueue() throws Exception {
    ThreadPoolExecutor executor = HttpLane.create();
    CountDownLatch hold = new CountDownLatch(1);
    CountDownLatch running = new CountDownLatch(HttpLane.MAX_ACTIVE);
    try {
      for (int index = 0; index < HttpLane.MAX_ACTIVE; index++) {
        executor.execute(
            () -> {
              running.countDown();
              await(hold);
            });
      }
      check(running.await(5, TimeUnit.SECONDS), "workers did not start");
      int rejected = 0;
      int queued = 0;
      for (int index = 0; index < HttpLane.MAX_QUEUED + 1; index++) {
        try {
          executor.execute(() -> await(hold));
          queued += 1;
        } catch (RejectedExecutionException error) {
          rejected += 1;
        }
      }
      check(queued == HttpLane.MAX_QUEUED, "the queue accepted a different number of tasks");
      check(rejected == 1, "overload was not rejected");
    } finally {
      hold.countDown();
      executor.shutdownNow();
      check(executor.awaitTermination(5, TimeUnit.SECONDS), "the lane did not stop");
    }
  }

  private static void queuedWorkUsesTheOriginalDeadline() throws Exception {
    ThreadPoolExecutor executor = HttpLane.create();
    CountDownLatch hold = new CountDownLatch(1);
    CountDownLatch running = new CountDownLatch(HttpLane.MAX_ACTIVE);
    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(150);
    AtomicInteger expired = new AtomicInteger();
    try {
      for (int index = 0; index < HttpLane.MAX_ACTIVE; index++) {
        executor.execute(
            () -> {
              running.countDown();
              await(hold);
            });
      }
      check(running.await(5, TimeUnit.SECONDS), "workers did not start");
      CountDownLatch queuedDone = new CountDownLatch(1);
      executor.execute(
          () -> {
            if (HttpAttempts.remainingMillis(deadline) == 0) {
              expired.incrementAndGet();
            }
            queuedDone.countDown();
          });
      Thread.sleep(400);
      hold.countDown();
      check(queuedDone.await(5, TimeUnit.SECONDS), "queued work did not run");
      check(expired.get() == 1, "queue wait started a fresh deadline");
    } finally {
      hold.countDown();
      executor.shutdownNow();
      executor.awaitTermination(5, TimeUnit.SECONDS);
    }
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await();
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
    }
  }

  private static void check(boolean condition, String message) {
    if (!condition) {
      throw new AssertionError(message);
    }
  }
}
