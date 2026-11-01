#!/usr/bin/env python3
"""The whole chain as on a TV, on Linux or WSL: the staged server on a real Node 0.12, starting the real
ARM engine, ffprobe and ffmpeg under an emulator. A Creative Commons torrent (Big Buck Bunny) goes through
the app's own routes, including a stream link that expires.

Usage: native/test-e2e.py <stage, such as .build/lg-armv7>"""
import glob, http.server, json, os, re, shutil, subprocess, sys, threading, time, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get('SC_BUILD', os.path.expanduser('~/stremcompat-build'))
OUT = BASE + '/out'
STAGE = os.path.abspath(sys.argv[1])
PORT = 8082
HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
LINK_LIFETIME_MS = 20000
DISK_LIMIT_MIB = 64
start = time.time()
failed = []

def log(*parts):
    print('[%5.1fs]' % (time.time() - start), *parts, flush=True)

def check(name, good, extra=''):
    log('ok  ' if good else 'FAIL', name, str(extra)[:150])
    if not good:
        failed.append(name)

def get_emulator():
    folder = BASE + '/qemu'
    path = folder + '/usr/bin/qemu-arm'
    if not os.path.exists(path):
        os.makedirs(folder, exist_ok=True)
        pool = 'http://archive.ubuntu.com/ubuntu/pool/universe/q/qemu/'
        names = re.findall(r'qemu-user_[^"<>]*_amd64\.deb', urllib.request.urlopen(pool, timeout=40).read().decode())
        urllib.request.urlretrieve(pool + sorted(set(names))[-1], folder + '/qemu-user.deb')
        subprocess.run(['dpkg', '-x', folder + '/qemu-user.deb', folder], check=True)
    return path

def get_old_node():
    node = BASE + '/node012/bin/node'
    if not os.path.exists(node):
        os.makedirs(BASE + '/node012', exist_ok=True)
        archive = BASE + '/downloads/node-v0.12.18-linux-x64.tar.gz'
        os.makedirs(BASE + '/downloads', exist_ok=True)
        if not os.path.exists(archive):
            urllib.request.urlretrieve('https://nodejs.org/dist/v0.12.18/node-v0.12.18-linux-x64.tar.gz', archive)
        subprocess.run(['tar', '-xzf', archive, '-C', BASE + '/node012', '--strip-components=1'], check=True)
    return node

def get(url, timeout=120, headers=None, follow=True):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(urllib.request.Request(url, headers=headers or {}), timeout=timeout)
        return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()

emulator = get_emulator()
node = get_old_node()
wrappers = BASE + '/wrap'
os.makedirs(wrappers, exist_ok=True)
for name, extra in (('ffmpeg', ''), ('ffprobe', ''), ('sc-engine', ' %d %d' % (LINK_LIFETIME_MS, DISK_LIMIT_MIB))):
    with open(wrappers + '/' + name, 'w') as f:
        f.write('#!/bin/sh\nexec "%s" "%s/%s" "$@"%s\n' % (emulator, OUT, name, extra))
    os.chmod(wrappers + '/' + name, 0o755)

home = BASE + '/e2e-home'
shutil.rmtree(home, ignore_errors=True)
os.makedirs(home)
shutil.rmtree(STAGE + '/service/subcache', ignore_errors=True)
env = dict(os.environ, HOME=home, TV_ENGINE=wrappers + '/sc-engine', TV_FFMPEG=wrappers + '/ffmpeg', TV_FFPROBE=wrappers + '/ffprobe', SC_SERVER_LOG=home + '/server.log')
server = subprocess.Popen([node, '--max_semi_space_size=2', STAGE + '/service/local-server.js'], cwd=STAGE + '/service', env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
address = 'http://127.0.0.1:11470/%s/1' % HASH
local = 'http://127.0.0.1:%d' % PORT

try:
    for attempt in range(100):
        try:
            health = json.loads(get(local + '/health', 3)[2])
            break
        except Exception:
            time.sleep(0.2)
    check('server up on Node 0.12', health.get('runtime', '').startswith('v0.12'), health)
    log('server memory idle', health.get('memory'))

    status, headers, _ = get(address, 200, follow=False)
    link = headers.get('Location')
    check('torrent address redirects to the engine', status == 302 and link, link)
    status, _, body = get(address, 200, headers={'Range': 'bytes=0-65535'})
    check('the player reads the film through it', status == 206 and body[4:8] == b'ftyp', (status, body[4:12]))
    status, _, body = get(address, 200, headers={'Range': 'bytes=276000000-276065535'})
    check('seeking far ahead works', status == 206 and len(body) == 65536, (status, len(body)))
    check('asked file 0 (a subtitle file): the film instead', get('http://127.0.0.1:11470/%s/0' % HASH, 60, follow=False)[1].get('Location') == link)
    status, _, body = get('http://127.0.0.1:11470/opensubHash?videoUrl=' + urllib.parse.quote(address), 200)
    check('OpenSubtitles hash', status == 200 and len(json.loads(body)['result']['hash']) == 16, body[:90])
    check('interface told the engine is ready', json.loads(get(local + '/streamfile', 10)[2]).get('state') == 'ready')
    status, _, body = get(local + '/subtitle-tracks?u=' + urllib.parse.quote(address, safe=''), 150)
    check('ARM ffprobe through the server', status == 200 and json.loads(body).get('err') == '', body[:100])
    art = urllib.parse.quote('https://images.metahub.space/background/medium/tt0468569/img', safe='')
    status, _, body = get(local + '/artwork?u=' + art, 60)
    check('ARM ffmpeg reduces artwork', status == 200 and body[:2] == b'\xff\xd8', (status, len(body)))

    # subtitles inside a file: 60 lines, one every 10 s of a 10-minute film
    fixture = open(os.path.dirname(os.path.abspath(__file__)) + '/test-subtitles.mkv', 'rb').read()
    class RangeFile(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if not self.path.startswith('/film'):
                self.send_error(404)
                return
            asked = re.match(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
            first = int(asked.group(1)) if asked else 0
            last = int(asked.group(2)) if asked and asked.group(2) else len(fixture) - 1
            self.send_response(206 if asked else 200)
            self.send_header('Content-Type', 'video/x-matroska')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(last - first + 1))
            if asked:
                self.send_header('Content-Range', 'bytes %d-%d/%d' % (first, last, len(fixture)))
            self.end_headers()
            self.wfile.write(fixture[first:last + 1])
        def log_message(self, *a):
            pass
    film_server = http.server.ThreadingHTTPServer(('127.0.0.1', 9193), RangeFile)
    threading.Thread(target=film_server.serve_forever, daemon=True).start()
    film = urllib.parse.quote('http://127.0.0.1:9193/film.mkv', safe='')
    def subtitle_call(route, query):
        return json.loads(get('%s/%s?u=%s&id=tt1&vid=tt1&%s' % (local, route, film, query), 60)[2])
    tracks = json.loads(get(local + '/subtitle-tracks?u=' + film, 150)[2]).get('tracks', [])
    check('the track list names the language', tracks and tracks[0].get('lang') == 'eng', tracks)
    broken = json.loads(get(local + '/subtitle-tracks?u=' + urllib.parse.quote('http://127.0.0.1:9193/none.mkv', safe=''), 150)[2])
    check('a file that cannot be read says so', broken.get('err'), broken)
    subtitle_call('subtitle-start', 'n=0&t=300')
    lines = []
    def read_until_done(at):
        for attempt in range(120):
            answer = subtitle_call('subtitle-cues', 'n=0&t=%d&since=%d' % (at, len(lines)))
            lines.extend(answer.get('cues', []))
            if answer.get('done'):
                return answer
            time.sleep(1)
        return {}
    answer = read_until_done(300)
    # FFmpeg seeks to a point somewhat before the one asked for, which only adds earlier lines
    check('reading starts near the playhead', lines and 100 <= lines[0]['s'] <= 285 and lines[-1]['s'] > 300, (lines[:1], lines[-1:]))
    check('a read from the middle still watches for going back', answer.get('done') and not answer.get('final'), answer.get('final'))
    subtitle_call('subtitle-cues', 'n=0&t=100&since=%d' % len(lines))
    time.sleep(1)
    answer = read_until_done(100)
    starts = sorted(line['s'] for line in lines)
    check('going back reads what was missing', answer.get('final') and starts and starts[0] < 10, (answer.get('final'), starts[:1]))
    check('no line twice', len(starts) == len(set(starts)) and len(starts) == 60, len(starts))
    stored = subtitle_call('subtitle-start', 'n=0&t=0')
    check('the whole track is kept and final', stored.get('cached') and stored.get('final') and len(stored.get('cues', [])) == 60, len(stored.get('cues', [])))
    subtitle_call('subtitle-start', 'n=7&t=0')
    for attempt in range(40):
        answer = subtitle_call('subtitle-cues', 'n=7&t=0&since=0')
        if answer.get('done'):
            break
        time.sleep(1)
    check('a track that cannot be read fails once', answer.get('err') and answer.get('final'), answer)
    film_server.shutdown()

    # the storage limit, while the film plays from start to end at several times its speed
    def on_storage():
        return int(subprocess.run(['du', '-sk', home], capture_output=True, text=True).stdout.split()[0]) // 1024
    biggest = on_storage()
    for second in range(0, 276, 12):
        at = second * 1000000
        status, _, _ = get(address, 120, headers={'Range': 'bytes=%d-%d' % (at, at + 1048575)})
        biggest = max(biggest, on_storage())
    log('most on storage while playing: %d MiB, with a limit of %d MiB' % (biggest, DISK_LIMIT_MIB))
    check('storage stays near its limit', biggest <= DISK_LIMIT_MIB * 2, '%d MiB' % biggest)

    log('leaving the stream unused until its link expires…')
    time.sleep((LINK_LIFETIME_MS / 1000) + 15)
    status, _, _ = get(link, 15, headers={'Range': 'bytes=0-1023'})
    log('the old link now answers', status)
    check('an unused link does expire', status >= 400, status)
    status, headers, _ = get(address, 200, follow=False)
    fresh = headers.get('Location')
    log('the address now leads to', fresh)
    check('the address gives a new link', fresh and fresh != link, fresh)
    status, _, body = get(address, 200, headers={'Range': 'bytes=1048576-1114111'})
    check('the new link works', status == 206 and len(body) == 65536, (status, len(body)))

    status, _, body = get(local + '/previews?dur=600&u=' + urllib.parse.quote(address, safe=''), 30)
    check('seek previews start', json.loads(body).get('ok') is True, body[:80])
    log('engine stats', get('http://127.0.0.1:11470/stats.json', 10)[2][:200])
    log('server memory after streaming', json.loads(get(local + '/health', 5)[2]).get('memory'))
    uncaught = [l for l in open(home + '/server.log', errors='replace') if 'UNCAUGHT' in l]
    check('no uncaught errors in the server', not uncaught, uncaught[:2])
finally:
    server.terminate()
    for wait in range(30):
        time.sleep(1)
        left = subprocess.run("pgrep -f '[o]ut/sc-engine' | wc -l", shell=True, capture_output=True, text=True).stdout.strip()
        if left == '0':
            break
    check('the engine leaves with the server', left == '0', 'after about %d s' % (wait + 1))
    log('left on storage:', subprocess.run(['du', '-sh', home], capture_output=True, text=True).stdout.split()[0])

print('E2E ' + ('OK' if not failed else 'FAILED: ' + ', '.join(failed)))
sys.exit(1 if failed else 0)
