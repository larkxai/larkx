#include "session_registry.h"

#include <condition_variable>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace larkx::host {
namespace {

struct Slot {
  std::mutex mu;
  std::condition_variable cv;
  std::shared_ptr<Session> session = std::make_shared<Session>();
  int inflight = 0;
  bool destroyed = false;
};

struct InvokeFrame {
  Slot* slot = nullptr;
  InvokeFrame* previous = nullptr;
};

thread_local InvokeFrame* invoke_frame = nullptr;

int frames_for(const Slot* slot) {
  int count = 0;
  for (const InvokeFrame* frame = invoke_frame; frame != nullptr; frame = frame->previous) {
    if (frame->slot == slot) {
      count += 1;
    }
  }
  return count;
}

}  // namespace

struct SessionRegistry::State {
  std::mutex mu;
  std::unordered_map<Id, std::shared_ptr<Slot>> slots;
  Id next = 1;

  void erase(Id id, const std::shared_ptr<Slot>& slot) {
    std::lock_guard<std::mutex> registry(mu);
    const auto found = slots.find(id);
    if (found != slots.end() && found->second == slot) {
      slots.erase(found);
    }
  }
};

SessionRegistry::SessionRegistry() : state_(new State()) {}

SessionRegistry::~SessionRegistry() {
  std::unordered_map<Id, std::shared_ptr<Slot>> slots;
  {
    std::lock_guard<std::mutex> lock(state_->mu);
    slots.swap(state_->slots);
  }
  for (auto& entry : slots) {
    std::shared_ptr<Session> drop;
    {
      std::unique_lock<std::mutex> lock(entry.second->mu);
      entry.second->destroyed = true;
      entry.second->cv.wait(lock, [&] { return entry.second->inflight == 0; });
      drop = std::move(entry.second->session);
    }
    drop.reset();
  }
  delete state_;
  state_ = nullptr;
}

SessionRegistry::Id SessionRegistry::create() {
  auto slot = std::make_shared<Slot>();
  std::lock_guard<std::mutex> lock(state_->mu);
  const Id id = state_->next;
  state_->next += 1;
  if (state_->next == 0) {
    state_->next = 1;
  }
  state_->slots.emplace(id, std::move(slot));
  return id;
}

bool SessionRegistry::invoke(Id id, const std::function<void(Session&)>& body) {
  std::shared_ptr<Slot> slot;
  std::shared_ptr<Session> session;
  {
    std::lock_guard<std::mutex> registry(state_->mu);
    const auto found = state_->slots.find(id);
    if (found == state_->slots.end()) {
      return false;
    }
    slot = found->second;
  }
  {
    std::lock_guard<std::mutex> guard(slot->mu);
    if (slot->destroyed || slot->session == nullptr) {
      return false;
    }
    session = slot->session;
    slot->inflight += 1;
  }
  struct Inflight {
    State* state;
    Id id;
    std::shared_ptr<Slot> slot;
    ~Inflight() {
      std::shared_ptr<Session> drop;
      bool erase = false;
      {
        std::lock_guard<std::mutex> guard(slot->mu);
        slot->inflight -= 1;
        if (slot->inflight == 0 && slot->destroyed) {
          drop = std::move(slot->session);
          erase = true;
        }
        slot->cv.notify_all();
      }
      drop.reset();
      if (erase) {
        state->erase(id, slot);
      }
    }
  } inflight{state_, id, slot};
  InvokeFrame frame;
  frame.slot = slot.get();
  frame.previous = invoke_frame;
  invoke_frame = &frame;
  struct FrameGuard {
    explicit FrameGuard(InvokeFrame* current) : current(current) {}
    InvokeFrame* current;
    ~FrameGuard() { invoke_frame = current->previous; }
  } frame_guard{&frame};
  body(*session);
  return true;
}

void SessionRegistry::destroy(Id id) {
  std::shared_ptr<Slot> slot;
  {
    std::lock_guard<std::mutex> registry(state_->mu);
    const auto found = state_->slots.find(id);
    if (found == state_->slots.end()) {
      return;
    }
    slot = found->second;
  }
  std::shared_ptr<Session> drop;
  {
    std::unique_lock<std::mutex> guard(slot->mu);
    slot->destroyed = true;
    if (before_wait_) {
      before_wait_();
    }
    const int own = frames_for(slot.get());
    if (own > 0) {
      slot->cv.wait(guard, [&] { return slot->inflight == own; });
      return;
    }
    slot->cv.wait(guard, [&] { return slot->inflight == 0; });
    drop = std::move(slot->session);
  }
  drop.reset();
  state_->erase(id, slot);
}

void SessionRegistry::set_before_wait_for_tests(std::function<void()> hook) { before_wait_ = std::move(hook); }

}  // namespace larkx::host
