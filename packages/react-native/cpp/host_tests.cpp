#include "session_registry.h"
#include "utf.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <initializer_list>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

int failures = 0;

void expect(bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    failures += 1;
  }
}

void expect_eq(const std::string& actual, const std::string& wanted, const char* message) {
  if (actual != wanted) {
    std::cerr << message << '\n';
    failures += 1;
  }
}

std::string bytes(std::initializer_list<unsigned char> values) {
  std::string text;
  text.reserve(values.size());
  for (const unsigned char value : values) {
    text.push_back(static_cast<char>(value));
  }
  return text;
}

void test_utf_round_trip() {
  const std::string utf8 =
      std::string("hello ") + bytes({0xC3, 0xA9}) + " " +
      bytes({0xE3, 0x81, 0x93, 0xE3, 0x82, 0x93, 0xE3, 0x81, 0xAB, 0xE3, 0x81, 0xA1, 0xE3, 0x81, 0xAF}) + " " +
      bytes({0xD0, 0x9F, 0xD1, 0x80, 0xD0, 0xB8, 0xD0, 0xB2, 0xD0, 0xB5, 0xD1, 0x82}) + " " +
      bytes({0xD9, 0x85, 0xD8, 0xB1, 0xD8, 0xAD, 0xD8, 0xA8, 0xD8, 0xA7}) + " " +
      bytes({0xE4, 0xBD, 0xA0, 0xE5, 0xA5, 0xBD}) + " " + bytes({0xF0, 0x9F, 0x98, 0x80}) + " " +
      bytes({0xF0, 0x9D, 0x84, 0x9E});
  const std::u16string utf16 = larkx::host::utf8_to_utf16(utf8);
  expect_eq(larkx::host::utf16_to_utf8(utf16.data(), utf16.size()), utf8, "multilingual UTF-8 round trip");

  const char16_t emoji[] = {0xD83D, 0xDE00};
  const std::string emoji_utf8 = larkx::host::utf16_to_utf8(emoji, 2);
  expect(emoji_utf8 == bytes({0xF0, 0x9F, 0x98, 0x80}), "emoji uses a four-byte UTF-8 sequence");
  const std::u16string emoji_back = larkx::host::utf8_to_utf16(emoji_utf8);
  expect(emoji_back.size() == 2 && emoji_back[0] == 0xD83D && emoji_back[1] == 0xDE00, "emoji UTF-16 surrogate pair");

  const char16_t clef[] = {0xD834, 0xDD1E};
  const std::string clef_utf8 = larkx::host::utf16_to_utf8(clef, 2);
  expect(clef_utf8 == bytes({0xF0, 0x9D, 0x84, 0x9E}), "supplementary character uses standard UTF-8");

  const char16_t with_nul[] = {u'a', 0, u'b'};
  const std::string nul_utf8 = larkx::host::utf16_to_utf8(with_nul, 3);
  expect(nul_utf8.size() == 3 && nul_utf8[0] == 'a' && nul_utf8[1] == '\0' && nul_utf8[2] == 'b',
         "embedded NUL is one UTF-8 byte");
  const std::u16string nul_back = larkx::host::utf8_to_utf16(nul_utf8);
  expect(nul_back.size() == 3 && nul_back[1] == 0, "embedded NUL round trip");

  const char16_t lone[] = {0xD83D};
  const std::string replaced = larkx::host::utf16_to_utf8(lone, 1);
  expect(replaced == bytes({0xEF, 0xBF, 0xBD}), "lone surrogate becomes U+FFFD");
  const std::u16string overlong = larkx::host::utf8_to_utf16(bytes({0xC0, 0x80}));
  expect(overlong.size() == 1 && overlong[0] == 0xFFFD, "modified UTF-8 NUL is not accepted as U+0000");
}

void test_destroy_waits_for_invoke() {
  larkx::host::SessionRegistry registry;
  const auto id = registry.create();
  std::mutex mu;
  std::condition_variable cv;
  std::vector<std::string> order;
  bool release = false;
  auto log = [&](const char* event) {
    std::lock_guard<std::mutex> lock(mu);
    order.emplace_back(event);
    cv.notify_all();
  };
  std::thread worker([&] {
    const bool called = registry.invoke(id, [&](larkx::host::Session& session) {
      log("entered");
      std::unique_lock<std::mutex> lock(mu);
      cv.wait(lock, [&] { return release; });
      lock.unlock();
      log("using");
      std::string out;
      expect(session.invoke("versions", "{}", out).ok(), "session stays alive until invoke returns");
      log("used");
    });
    expect(called, "in-flight invoke runs");
  });
  {
    std::unique_lock<std::mutex> lock(mu);
    cv.wait(lock, [&] { return !order.empty(); });
  }
  std::thread killer([&] {
    registry.destroy(id);
    log("destroy-return");
  });
  {
    std::lock_guard<std::mutex> lock(mu);
    release = true;
  }
  cv.notify_all();
  worker.join();
  killer.join();
  expect(order.size() == 4 && order[0] == "entered" && order[1] == "using" && order[2] == "used" &&
             order[3] == "destroy-return",
         "destroy waits until the other thread leaves invoke");
  expect(!registry.invoke(id, [](larkx::host::Session&) {}), "invoke after destroy does not run");
  registry.destroy(id);
}

void test_reentrant_destroy_does_not_deadlock() {
  larkx::host::SessionRegistry registry;
  const auto id = registry.create();
  bool alive = false;
  const bool called = registry.invoke(id, [&](larkx::host::Session& session) {
    registry.destroy(id);
    std::string out;
    alive = session.invoke("versions", "{}", out).ok();
  });
  expect(called && alive, "reentrant destroy keeps the session until invoke returns");
  expect(!registry.invoke(id, [](larkx::host::Session&) {}), "the session is gone after the reentrant invoke");
}

void test_destroy_other_session_from_invoke_waits() {
  larkx::host::SessionRegistry registry;
  const auto left = registry.create();
  const auto right = registry.create();
  std::atomic<bool> entered{false};
  std::atomic<bool> release{false};
  std::atomic<bool> returned{false};
  registry.set_before_wait_for_tests([&] { release.store(true); });
  std::thread worker([&] {
    const bool called = registry.invoke(right, [&](larkx::host::Session& session) {
      entered.store(true);
      while (!release.load()) {
        std::this_thread::yield();
      }
      std::string out;
      expect(session.invoke("versions", "{}", out).ok(), "the other session stays alive until its invoke returns");
    });
    expect(called, "the other session invoke runs");
  });
  while (!entered.load()) {
    std::this_thread::yield();
  }
  std::thread killer([&] {
    const bool called = registry.invoke(left, [&](larkx::host::Session& session) {
      registry.destroy(right);
      returned.store(true);
      std::string out;
      expect(session.invoke("versions", "{}", out).ok(), "destroying one session leaves the caller session open");
    });
    expect(called, "destroy runs from inside another session");
  });
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  while (!release.load() && std::chrono::steady_clock::now() < deadline) {
    std::this_thread::yield();
  }
  expect(release.load(), "destroy waits for the other session before returning");
  if (!release.load()) {
    release.store(true);
  }
  worker.join();
  killer.join();
  expect(returned.load(), "destroy returns after the other session leaves invoke");
  expect(!registry.invoke(right, [](larkx::host::Session&) {}), "the destroyed session rejects later calls");
  expect(registry.invoke(left, [](larkx::host::Session&) {}), "the caller session remains usable");
  registry.set_before_wait_for_tests(nullptr);
  registry.destroy(left);
}

void test_concurrent_invoke_and_destroy() {
  larkx::host::SessionRegistry registry;
  const auto id = registry.create();
  std::atomic<int> started{0};
  std::vector<std::thread> threads;
  threads.reserve(8);
  for (int index = 0; index < 8; index += 1) {
    threads.emplace_back([&] {
      registry.invoke(id, [&](larkx::host::Session& session) {
        started.fetch_add(1);
        std::string out;
        session.invoke("versions", "{}", out);
      });
    });
  }
  while (started.load() == 0) {
    std::this_thread::yield();
  }
  registry.destroy(id);
  for (std::thread& thread : threads) {
    thread.join();
  }
  expect(!registry.invoke(id, [](larkx::host::Session&) {}), "concurrent destroy leaves no live handle");
}

}  // namespace

int main() {
  test_utf_round_trip();
  test_destroy_waits_for_invoke();
  test_reentrant_destroy_does_not_deadlock();
  test_destroy_other_session_from_invoke_waits();
  test_concurrent_invoke_and_destroy();
  if (failures != 0) {
    std::cerr << failures << " host test failure(s)\n";
    return 1;
  }
  std::cout << "larkx host tests passed\n";
  return 0;
}
