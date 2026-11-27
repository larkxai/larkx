package ai.larkx.reactnative;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * SDK HTTP client. Redirects are not followed. The process-wide follow-redirects
 * flag, cookie handler, and trust manager are left unchanged.
 *
 * <p>{@code HttpURLConnection} has no per-connection switch that ignores a
 * {@code CookieHandler} installed by the host app. This module does not install
 * one and does not replace the process default. If the app has set a default
 * handler, that handler can still attach cookies. A separate HTTP stack would
 * be required to prevent that, and this package does not add one.
 */
public class LarkXHttpModule extends ReactContextBaseJavaModule {
  private final ThreadPoolExecutor executor = HttpLane.create();
  private final ScheduledExecutorService clocks = Executors.newSingleThreadScheduledExecutor(runnable -> {
    Thread thread = new Thread(runnable, "larkx-http-deadline");
    thread.setDaemon(true);
    return thread;
  });
  private final HttpAttempts attempts = new HttpAttempts();

  public LarkXHttpModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "LarkXHttp";
  }

  @ReactMethod
  public void request(double requestId, String payload, Promise promise) {
    final int id = (int) requestId;
    JSONObject document;
    try {
      document = new JSONObject(payload);
    } catch (Exception error) {
      promise.resolve("{\"ok\":false,\"error\":\"invalid_url\"}");
      return;
    }
    int timeoutMs = Math.max(1, document.optInt("timeoutMs", 10_000));
    long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
    HttpAttempts.Attempt attempt = attempts.open(id, deadline, promise::resolve);
    try {
      executor.execute(() -> perform(id, attempt, document));
    } catch (RejectedExecutionException error) {
      resolve(id, "{\"ok\":false,\"error\":\"network\"}");
    }
  }

  @ReactMethod
  public void cancel(double requestId) {
    int id = (int) requestId;
    HttpAttempts.Attempt attempt = attempts.get(id);
    if (attempt == null) {
      return;
    }
    attempt.cancelled = true;
    Object connection = attempt.connection;
    if (connection instanceof HttpURLConnection) {
      ((HttpURLConnection) connection).disconnect();
    }
    resolve(id, "{\"ok\":false,\"error\":\"cancelled\"}");
  }

  @Override
  public void invalidate() {
    for (Integer id : attempts.ids()) {
      cancel(id);
    }
    executor.shutdownNow();
    clocks.shutdownNow();
    super.invalidate();
  }

  private void perform(int id, HttpAttempts.Attempt attempt, JSONObject document) {
    HttpURLConnection connection = null;
    ScheduledFuture<?> alarm = null;
    try {
      if (attempt.cancelled || attempt.settled.get()) {
        resolve(id, "{\"ok\":false,\"error\":\"cancelled\"}");
        return;
      }
      if (HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0) {
        resolve(id, "{\"ok\":false,\"error\":\"timeout\"}");
        return;
      }
      String urlText = document.optString("url", "");
      String method = document.optString("method", "GET");
      URI uri;
      try {
        uri = URI.create(urlText);
      } catch (IllegalArgumentException error) {
        resolve(id, "{\"ok\":false,\"error\":\"invalid_url\"}");
        return;
      }
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
      if ((!"https".equals(scheme) && !"http".equals(scheme))
          || uri.getHost() == null
          || uri.getRawUserInfo() != null
          || (!"GET".equals(method) && !"POST".equals(method))) {
        resolve(id, "{\"ok\":false,\"error\":\"invalid_url\"}");
        return;
      }
      int maxBytes = Math.max(1, document.optInt("maxBytes", 65_536));
      int remaining = HttpAttempts.remainingMillis(attempt.deadlineNanos);
      if (remaining == 0) {
        resolve(id, "{\"ok\":false,\"error\":\"timeout\"}");
        return;
      }
      connection = (HttpURLConnection) uri.toURL().openConnection();
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(remaining);
      connection.setReadTimeout(remaining);
      connection.setUseCaches(false);
      connection.setRequestMethod(method);
      attempt.connection = connection;
      if (attempt.cancelled) {
        connection.disconnect();
        resolve(id, "{\"ok\":false,\"error\":\"cancelled\"}");
        return;
      }
      int budget = HttpAttempts.remainingMillis(attempt.deadlineNanos);
      if (budget == 0) {
        resolve(id, "{\"ok\":false,\"error\":\"timeout\"}");
        return;
      }
      final HttpURLConnection socket = connection;
      alarm = clocks.schedule(socket::disconnect, budget, TimeUnit.MILLISECONDS);
      JSONObject headers = document.optJSONObject("headers");
      if (headers != null) {
        java.util.Iterator<String> names = headers.keys();
        while (names.hasNext()) {
          String name = names.next();
          String value = headers.optString(name, "");
          if (name.indexOf('\n') >= 0
              || name.indexOf('\r') >= 0
              || value.indexOf('\n') >= 0
              || value.indexOf('\r') >= 0) {
            continue;
          }
          connection.setRequestProperty(name, value);
        }
      }
      String body = document.isNull("body") ? null : document.optString("body", null);
      if ("POST".equals(method) && body != null) {
        byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        try (java.io.OutputStream output = connection.getOutputStream()) {
          if (attempt.cancelled || HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0) {
            throw new java.io.InterruptedIOException();
          }
          output.write(encoded);
        }
      }
      if (attempt.cancelled) {
        resolve(id, "{\"ok\":false,\"error\":\"cancelled\"}");
        return;
      }
      if (HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0) {
        resolve(id, "{\"ok\":false,\"error\":\"timeout\"}");
        return;
      }
      int status = connection.getResponseCode();
      if (status >= 300 && status < 400) {
        resolve(id, "{\"ok\":false,\"error\":\"redirect\",\"status\":" + status + "}");
        return;
      }
      InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      String responseBody = readBounded(stream, maxBytes, attempt);
      if (attempt.cancelled) {
        resolve(id, "{\"ok\":false,\"error\":\"cancelled\"}");
        return;
      }
      if (responseBody == null) {
        String kind =
            HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0 ? "timeout" : "oversized";
        resolve(id, "{\"ok\":false,\"error\":\"" + kind + "\"}");
        return;
      }
      JSONObject result = new JSONObject();
      result.put("ok", true);
      result.put("status", status);
      result.put("body", responseBody);
      JSONObject responseHeaders = new JSONObject();
      Map<String, List<String>> headerFields = connection.getHeaderFields();
      if (headerFields != null) {
        for (Map.Entry<String, List<String>> entry : headerFields.entrySet()) {
          if (entry.getKey() == null || entry.getValue() == null) {
            continue;
          }
          responseHeaders.put(
              entry.getKey().toLowerCase(Locale.US), String.join(", ", entry.getValue()));
        }
      }
      result.put("headers", responseHeaders);
      resolve(id, result.toString());
    } catch (java.net.SocketTimeoutException error) {
      String kind = attempt.cancelled ? "cancelled" : "timeout";
      resolve(id, "{\"ok\":false,\"error\":\"" + kind + "\"}");
    } catch (Exception error) {
      String kind;
      if (attempt.cancelled) {
        kind = "cancelled";
      } else if (HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0) {
        kind = "timeout";
      } else {
        kind = "network";
      }
      resolve(id, "{\"ok\":false,\"error\":\"" + kind + "\"}");
    } finally {
      if (alarm != null) {
        alarm.cancel(false);
      }
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private void resolve(int id, String payload) {
    HttpAttempts.Attempt attempt = attempts.get(id);
    if (attempt == null || !attempts.finish(id)) {
      return;
    }
    if (attempt.settlement != null) {
      attempt.settlement.accept(payload);
    }
  }

  private static String readBounded(InputStream stream, int maxBytes, HttpAttempts.Attempt attempt)
      throws java.io.IOException {
    if (stream == null) {
      return "";
    }
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    int total = 0;
    int read;
    while ((read = stream.read(buffer)) >= 0) {
      if (attempt.cancelled || HttpAttempts.remainingMillis(attempt.deadlineNanos) == 0) {
        stream.close();
        return null;
      }
      total += read;
      if (total > maxBytes) {
        stream.close();
        return null;
      }
      output.write(buffer, 0, read);
    }
    stream.close();
    return output.toString(StandardCharsets.UTF_8);
  }
}
