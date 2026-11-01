#!/usr/bin/env python3
"""The whole chain as on a TV, on Linux or WSL: the staged server on a real Node 0.12, starting the real
ARM engine, ffprobe and ffmpeg under an emulator. A Creative Commons torrent (Big Buck Bunny) goes through
the app's own routes, including a stream link that expires.

Usage: native/test-e2e.py <stage, such as .build/lg-armv7>"""
import glob, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get('SC_BUILD', os.path.expanduser('~/stremcompat-build'))
OUT = BASE + '/out'
STAGE = os.path.abspath(sys.argv[1])
PORT = 8082
HASH = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c'
LINK_LIFETIME_MS = 20000
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
for name, extra in (('ffmpeg', ''), ('ffprobe', ''), ('sc-engine', ' %d' % LINK_LIFETIME_MS)):
    with open(wrappers + '/' + name, 'w') as f:
        f.write('#!/bin/sh\nexec "%s" "%s/%s" "$@"%s\n' % (emulator, OUT, name, extra))
    os.chmod(wrappers + '/' + name, 0o755)

home = BASE + '/e2e-home'
shutil.rmtree(home, ignore_errors=True)
os.makedirs(home)
env = dict(os.environ, HOME=home, TV_ENGINE=wrappers + '/sc-engine', TV_FFMPEG=wrappers + '/ffmpeg', TV_FFPROBE=wrappers + '/ffprobe', TVSERVER_LOG=home + '/server.log')
server = subprocess.Popen([node, '--max_semi_space_size=2', STAGE + '/service/tvserver.js'], cwd=STAGE + '/service', env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    status, _, body = get(local + '/embtracks?u=' + urllib.parse.quote(address, safe=''), 150)
    check('ARM ffprobe through the server', status == 200 and json.loads(body).get('err') == '', body[:100])
    art = urllib.parse.quote('https://images.metahub.space/background/medium/tt0468569/img', safe='')
    status, _, body = get(local + '/bgz?u=' + art, 60)
    check('ARM ffmpeg reduces artwork', status == 200 and body[:2] == b'\xff\xd8', (status, len(body)))
    status, _, body = get(local + '/spritegen?dur=600&u=' + urllib.parse.quote(address, safe=''), 30)
    check('seek previews start', json.loads(body).get('ok') is True, body[:80])

    log('leaving the stream unused until its link expires…')
    time.sleep((LINK_LIFETIME_MS / 1000) + 12)
    status, _, _ = get(link, 15, headers={'Range': 'bytes=0-1023'}) if True else (0, 0, 0)
    log('the old link now answers', status)
    status, headers, _ = get(address, 200, follow=False)
    fresh = headers.get('Location')
    log('the address now leads to', fresh)
    status, _, body = get(address, 200, headers={'Range': 'bytes=1048576-1114111'})
    check('after expiry the address gives a working link', status == 206 and len(body) == 65536, (status, len(body)))

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
