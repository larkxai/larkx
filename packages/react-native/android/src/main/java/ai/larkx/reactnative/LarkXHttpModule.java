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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/**
 * SDK HTTP client. Redirects are not followed. The process-wide
 * {@code HttpURLConnection.setFollowRedirects} flag is left unchanged, and this
 * module does not install a cookie store or a custom trust manager.
 */
public class LarkXHttpModule extends ReactContextBaseJavaModule {
  private final ExecutorService executor = Executors.newCachedThreadPool();
  private final ConcurrentHashMap<Integer, HttpURLConnection> live = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<Integer, AtomicBoolean> settled = new ConcurrentHashMap<>();
  private final ConcurrentHashMap<Integer, Boolean> cancelled = new ConcurrentHashMap<>();

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
    settled.put(id, new AtomicBoolean(false));
    executor.execute(
        () -> {
          HttpURLConnection connection = null;
          try {
            if (cancelled.containsKey(id)) {
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"cancelled\"}");
              return;
            }
            JSONObject document = new JSONObject(payload);
            String urlText = document.optString("url", "");
            String method = document.optString("method", "GET");
            URI uri;
            try {
              uri = URI.create(urlText);
            } catch (IllegalArgumentException error) {
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"invalid_url\"}");
              return;
            }
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.US);
            if ((!"https".equals(scheme) && !"http".equals(scheme))
                || uri.getHost() == null
                || uri.getRawUserInfo() != null
                || (!"GET".equals(method) && !"POST".equals(method))) {
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"invalid_url\"}");
              return;
            }
            int timeoutMs = document.optInt("timeoutMs", 10_000);
            int maxBytes = Math.max(1, document.optInt("maxBytes", 65_536));
            connection = (HttpURLConnection) uri.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(Math.max(1, timeoutMs));
            connection.setReadTimeout(Math.max(1, timeoutMs));
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            JSONObject headers = document.optJSONObject("headers");
            if (headers != null) {
              java.util.Iterator<String> names = headers.keys();
              while (names.hasNext()) {
                String name = names.next();
                String value = headers.optString(name, "");
                if (name.indexOf('\n') >= 0 || name.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
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
                output.write(encoded);
              }
            }
            live.put(id, connection);
            if (cancelled.containsKey(id)) {
              connection.disconnect();
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"cancelled\"}");
              return;
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"redirect\",\"status\":" + status + "}");
              connection.disconnect();
              return;
            }
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String responseBody = readBounded(stream, maxBytes);
            if (responseBody == null) {
              resolveOnce(id, promise, "{\"ok\":false,\"error\":\"oversized\"}");
              connection.disconnect();
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
            resolveOnce(id, promise, result.toString());
          } catch (java.net.SocketTimeoutException error) {
            String kind = cancelled.containsKey(id) ? "cancelled" : "timeout";
            resolveOnce(id, promise, "{\"ok\":false,\"error\":\"" + kind + "\"}");
          } catch (Exception error) {
            String kind = cancelled.containsKey(id) ? "cancelled" : "network";
            resolveOnce(id, promise, "{\"ok\":false,\"error\":\"" + kind + "\"}");
          } finally {
            live.remove(id);
            if (connection != null) {
              connection.disconnect();
            }
          }
        });
  }

  @ReactMethod
  public void cancel(double requestId) {
    int id = (int) requestId;
    cancelled.put(id, Boolean.TRUE);
    HttpURLConnection connection = live.remove(id);
    if (connection != null) {
      connection.disconnect();
    }
  }

  @Override
  public void invalidate() {
    for (Integer id : live.keySet()) {
      cancel(id);
    }
    executor.shutdownNow();
    super.invalidate();
  }

  private void resolveOnce(int id, Promise promise, String payload) {
    AtomicBoolean flag = settled.computeIfAbsent(id, ignored -> new AtomicBoolean(false));
    if (!flag.compareAndSet(false, true)) {
      return;
    }
    promise.resolve(payload);
  }

  private static String readBounded(InputStream stream, int maxBytes) throws java.io.IOException {
    if (stream == null) {
      return "";
    }
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    int total = 0;
    int read;
    while ((read = stream.read(buffer)) >= 0) {
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
