// sc-engine: runs Nuvio Engine (torrent streaming over libtorrent) for the local server.
//
// The local server talks to this program over its stdin and stdout, one line per message, and
// gives the player the stream links this program reports. It leaves when its stdin closes, so it
// can never outlive the server that started it.
//
//   in:   add <TAB> tag <TAB> magnet         files <TAB> torrent
//         prepare <TAB> tag <TAB> torrent <TAB> file index
//         stop <TAB> stream                  remove <TAB> torrent          stats
//   out:  one JSON object per line
//
// Usage: sc-engine <folder> [milliseconds a stream stays open without requests]
#include <sys/statvfs.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

#include "nuvio_engine/nuvio_engine.h"

namespace {

constexpr std::uint64_t MiB = 1024ULL * 1024ULL;

std::mutex output;

std::string quoted(const char* text) {
  std::string out = "\"";
  for (const char* p = text; *p; ++p) {
    const auto c = static_cast<unsigned char>(*p);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += *p;
    } else if (c < 0x20) {
      char code[8];
      std::snprintf(code, sizeof(code), "\\u%04x", c);
      out += code;
    } else {
      out += *p;
    }
  }
  return out + "\"";
}

void say(const std::string& line) {
  const std::lock_guard<std::mutex> lock(output);
  std::fputs(line.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}

std::string field(const char* name, const std::string& value) {
  return std::string("\"") + name + "\":" + value;
}

std::string number(std::uint64_t value) {
  return std::to_string(value);
}

std::vector<std::string> split(const std::string& line) {
  std::vector<std::string> parts;
  std::size_t start = 0;
  while (true) {
    const auto tab = line.find('\t', start);
    if (tab == std::string::npos) {
      parts.push_back(line.substr(start));
      return parts;
    }
    parts.push_back(line.substr(start, tab - start));
    start = tab + 1;
  }
}

/* what a TV can spare: at most 2 GiB, and never the last of its storage */
std::uint64_t disk_budget(const std::string& directory) {
  struct statvfs info {};
  if (statvfs(directory.c_str(), &info) != 0) {
    return 128 * MiB;
  }
  const std::uint64_t available = static_cast<std::uint64_t>(info.f_bavail) * info.f_frsize;
  const std::uint64_t reserve = 150 * MiB;
  const std::uint64_t spare = available > reserve ? available - reserve : 0;
  return std::clamp<std::uint64_t>(spare * 7 / 10, 64 * MiB, 2048 * MiB);
}

std::uint64_t memory_budget() {
  const long pages = sysconf(_SC_PHYS_PAGES);
  const long size = sysconf(_SC_PAGE_SIZE);
  const std::uint64_t total = pages > 0 && size > 0 ? static_cast<std::uint64_t>(pages) * static_cast<std::uint64_t>(size) : 0;
  return total > 1536 * MiB ? 32 * MiB : 12 * MiB;
}

bool is_small_tv() {
  return memory_budget() < 32 * MiB;
}

void report_status(const char* command, nuvio_engine_status status, const std::string& tag) {
  say("{" + field("event", "\"failed\"") + "," + field("command", quoted(command)) + "," + field("tag", quoted(tag.c_str())) + "," +
      field("message", quoted(nuvio_engine_status_message(status))) + "}");
}

void report_files(nuvio_engine* engine, const std::string& torrent) {
  std::size_t count = 0;
  const auto status = nuvio_engine_get_file_count(engine, torrent.c_str(), &count);
  if (status != NUVIO_ENGINE_STATUS_OK) {
    report_status("files", status, torrent);
    return;
  }
  std::string list;
  for (std::size_t i = 0; i < count; ++i) {
    nuvio_engine_file file;
    nuvio_engine_file_init(&file);
    if (nuvio_engine_get_file(engine, torrent.c_str(), i, &file) != NUVIO_ENGINE_STATUS_OK) {
      continue;
    }
    if (!list.empty()) {
      list += ",";
    }
    list += "{" + field("index", number(file.index)) + "," + field("size", number(file.size)) + "," + field("path", quoted(file.path)) + "}";
  }
  say("{" + field("event", "\"files\"") + "," + field("torrent", quoted(torrent.c_str())) + "," + field("files", "[" + list + "]") + "}");
}

void report_stats(nuvio_engine* engine) {
  nuvio_engine_stats stats;
  nuvio_engine_stats_init(&stats);
  const auto status = nuvio_engine_get_stats(engine, &stats);
  if (status != NUVIO_ENGINE_STATUS_OK) {
    report_status("stats", status, "");
    return;
  }
  say("{" + field("event", "\"stats\"") + "," + field("torrents", number(stats.active_torrents)) + "," +
      field("streams", number(stats.active_streams)) + "," + field("requests", number(stats.active_http_requests)) + "," +
      field("peers", number(stats.connected_peers)) + "," + field("seeds", number(stats.connected_seeds)) + "," +
      field("downBps", number(stats.download_rate_bytes_per_second)) + "," + field("upBps", number(stats.upload_rate_bytes_per_second)) + "," +
      field("memUsed", number(stats.memory_cache_used_bytes)) + "," + field("memCap", number(stats.memory_cache_capacity_bytes)) + "," +
      field("diskUsed", number(stats.disk_cache_used_bytes)) + "," + field("diskCap", number(stats.disk_cache_capacity_bytes)) + "}");
}

const char* event_name(nuvio_engine_event_type type) {
  switch (type) {
    case NUVIO_ENGINE_EVENT_TORRENT_ADDED: return "added";
    case NUVIO_ENGINE_EVENT_TORRENT_METADATA_READY: return "metadata";
    case NUVIO_ENGINE_EVENT_TORRENT_ERROR: return "error";
    case NUVIO_ENGINE_EVENT_STREAM_PREPARED: return "stream";
    case NUVIO_ENGINE_EVENT_TORRENT_REMOVED: return "removed";
    case NUVIO_ENGINE_EVENT_STREAM_STOPPED: return "stopped";
    case NUVIO_ENGINE_EVENT_DISK_CACHE_RECLAIMED: return "reclaimed";
    default: return "other";
  }
}

}  // namespace

int main(int argc, char** argv) {
  std::string root = argc > 1 ? argv[1] : "./torrents";
  const std::string data = root + "/data";
  const std::string cache = root + "/cache";
  std::error_code ignored;
  /* nothing from an earlier film stays on the TV */
  std::filesystem::remove_all(cache, ignored);
  std::filesystem::create_directories(data, ignored);
  std::filesystem::create_directories(cache, ignored);

  nuvio_engine_config config;
  nuvio_engine_config_init(&config);
  config.data_directory = data.c_str();
  config.cache_directory = cache.c_str();
  config.memory_cache_capacity_bytes = memory_budget();
  config.disk_cache_capacity_bytes = disk_budget(cache);
  config.upload_mode = NUVIO_ENGINE_UPLOAD_LIMITED;
  config.upload_limit_bytes_per_second = 256 * 1024;
  /* a paused film keeps its link for a while: the player does not ask for a new one */
  config.stream_inactivity_timeout_milliseconds = argc > 2 ? static_cast<std::uint32_t>(std::strtoul(argv[2], nullptr, 10)) : 15 * 60 * 1000;
  config.warm_torrent_timeout_milliseconds = 60 * 1000;
  config.torrent_profile = is_small_tv() ? NUVIO_ENGINE_TORRENT_PROFILE_SOFT : NUVIO_ENGINE_TORRENT_PROFILE_BALANCED;

  nuvio_engine* engine = nullptr;
  const auto created = nuvio_engine_create(&config, &engine);
  if (created != NUVIO_ENGINE_STATUS_OK) {
    report_status("create", created, "");
    return 1;
  }
  say("{" + field("event", "\"ready\"") + "," + field("version", quoted(nuvio_engine_version_string())) + "," +
      field("memCap", number(config.memory_cache_capacity_bytes)) + "," + field("diskCap", number(config.disk_cache_capacity_bytes)) + "}");

  std::map<std::uint64_t, std::string> tags;
  std::mutex tags_lock;
  std::atomic<bool> running{true};

  std::thread events([&] {
    while (running.load()) {
      nuvio_engine_event event;
      nuvio_engine_event_init(&event);
      const auto status = nuvio_engine_poll_event(engine, &event);
      if (status != NUVIO_ENGINE_STATUS_OK) {
        std::this_thread::sleep_for(std::chrono::milliseconds(40));
        continue;
      }
      std::string tag;
      {
        const std::lock_guard<std::mutex> lock(tags_lock);
        const auto found = tags.find(event.request_id);
        if (found != tags.end()) {
          tag = found->second;
          if (event.type == NUVIO_ENGINE_EVENT_TORRENT_ERROR || event.type == NUVIO_ENGINE_EVENT_STREAM_PREPARED) {
            tags.erase(found);
          }
        }
      }
      say("{" + field("event", quoted(event_name(event.type))) + "," + field("tag", quoted(tag.c_str())) + "," +
          field("torrent", quoted(event.torrent_id)) + "," + field("message", quoted(event.message)) + "," +
          field("file", number(event.file_index)) + "," + field("size", number(event.file_size)) + "," +
          field("stream", quoted(event.stream_id)) + "," + field("url", quoted(event.stream_url)) + "}");
    }
  });

  auto remember = [&](std::uint64_t request, const std::string& tag) {
    const std::lock_guard<std::mutex> lock(tags_lock);
    tags[request] = tag;
  };

  std::string line;
  while (std::getline(std::cin, line)) {
    const auto parts = split(line);
    const auto& command = parts[0];
    std::uint64_t request = 0;
    if (command == "add" && parts.size() == 3) {
      nuvio_engine_torrent_request add;
      nuvio_engine_torrent_request_init(&add);
      add.magnet_uri = parts[2].c_str();
      add.source_type = NUVIO_ENGINE_TORRENT_SOURCE_MAGNET;
      const auto status = nuvio_engine_add_torrent(engine, &add, &request);
      if (status == NUVIO_ENGINE_STATUS_OK) {
        remember(request, parts[1]);
      } else {
        report_status("add", status, parts[1]);
      }
    } else if (command == "prepare" && parts.size() == 4) {
      nuvio_engine_stream_request prepare;
      nuvio_engine_stream_request_init(&prepare);
      prepare.torrent_id = parts[2].c_str();
      prepare.file_index = static_cast<std::uint32_t>(std::strtoul(parts[3].c_str(), nullptr, 10));
      const auto status = nuvio_engine_prepare_stream(engine, &prepare, &request);
      if (status == NUVIO_ENGINE_STATUS_OK) {
        remember(request, parts[1]);
      } else {
        report_status("prepare", status, parts[1]);
      }
    } else if (command == "files" && parts.size() == 2) {
      report_files(engine, parts[1]);
    } else if (command == "stop" && parts.size() == 2) {
      static_cast<void>(nuvio_engine_stop_stream(engine, parts[1].c_str(), &request));
    } else if (command == "remove" && parts.size() == 2) {
      static_cast<void>(nuvio_engine_remove_torrent(engine, parts[1].c_str(), &request));
    } else if (command == "stats") {
      report_stats(engine);
    }
  }

  running.store(false);
  events.join();
  nuvio_engine_destroy(engine);
  std::filesystem::remove_all(cache, ignored);
  return 0;
}
