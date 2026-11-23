"""StudioBindahh local server — serves the app and relays live collaboration.

Usage:  python serve.py [port] [--no-open] [--local-only]
Then open http://localhost:5173   (you can also just double-click index.html;
the server is only needed for live collaboration).

Live collaboration on a local network
  * Other devices on the network (a tablet, say) can open the app from this
    server at any time — the app files are public, your data stays in each
    device's browser. Live editing needs a session the host opens from inside
    the app (Share button), and everything in it is encrypted.
  * Everything that matters is encrypted in the browsers with a key derived
    from the session code, so this relay only ever sees opaque bytes. People
    join with the code; the code itself never crosses the network.
  * Every request is signed with a key derived from the code, join attempts
    are rate-limited, and sessions end when the host closes them.
Python 3.8+ standard library only.
"""
import hashlib
import hmac
import json
import mimetypes
import os
import queue
import secrets
import socket
import sys
import threading
import time
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 5173)
LOCAL_ONLY = "--local-only" in sys.argv
MAX_USERS = 30
MAX_JSON = 24 * 1024 * 1024
MAX_SNAPSHOT = 96 * 1024 * 1024
MAX_LOG = 20000
SIG_WINDOW = 120
STATIC_OK = ("/css/", "/js/", "/favicon")

LOCK = threading.RLock()
ROOM = None            # the one open session, or None
NONCES = {}            # nonce -> expiry
FAILS = {}             # ip -> deque of failure times
SEEN_SIGS = {}         # signature -> time (replay protection)


def lan_addresses():
    found = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        found.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in found:
                found.append(ip)
    except Exception:
        pass
    return [ip for ip in found if not ip.startswith("127.") and not ip.startswith("169.254.")]


def is_loopback(ip):
    return ip in ("127.0.0.1", "::1") or ip.startswith("::ffff:127.")


class User:
    def __init__(self, uid, name, color, role):
        self.uid, self.name, self.color, self.role = uid, name, color, role
        self.token = secrets.token_urlsafe(32)
        self.q = queue.Queue(maxsize=20000)
        self.online = False
        self.last = time.time()
        self.cids = {}                 # cid -> seq (idempotent resends)
        self.cid_order = deque(maxlen=400)
        self.rate = deque(maxlen=120)  # recent message times
        self.stream_gen = 0

    def public(self):
        return {"uid": self.uid, "name": self.name, "color": self.color, "role": self.role, "online": self.online}


class Room:
    def __init__(self, name, salt, auth, host_name, color, default_role, pid):
        self.id = secrets.token_hex(4)
        self.name, self.salt, self.auth, self.pid = name, salt, auth, pid
        self.default_role = default_role
        self.users = {}
        self.by_token = {}
        self.seq = 0
        self.log = deque()             # (seq, envelope dict)
        self.log_floor = 0             # first seq still in the log is > log_floor
        self.snap_seq = -1
        self.snap = None
        self.host = self.add_user(host_name, color, "edit")
        self.created = time.time()

    def add_user(self, name, color, role):
        uid = secrets.token_hex(4)
        u = User(uid, name[:40], color, role)
        self.users[uid] = u
        self.by_token[u.token] = u
        return u

    def users_event(self):
        return {"k": "users", "users": [u.public() for u in self.users.values()], "host": self.host.uid}

    def broadcast(self, ev, skip=None):
        data = json.dumps(ev, separators=(",", ":"))
        for u in list(self.users.values()):
            if u.uid == skip:
                continue
            try:
                u.q.put_nowait(data)
            except queue.Full:
                u.online = False


def now():
    return time.time()


def purge():
    t = now()
    for n in [n for n, e in NONCES.items() if e < t]:
        NONCES.pop(n, None)
    for s in [s for s, ts in SEEN_SIGS.items() if ts < t - SIG_WINDOW * 2]:
        SEEN_SIGS.pop(s, None)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "StudioBindahh"

    def log_message(self, *a):
        pass

    # ---------- plumbing ----------
    def ip(self):
        return self.client_address[0]

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Token, X-Sig, X-Ts, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "X-Seq")

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code, msg):
        self.send_json(code, {"error": msg})

    def read_body(self, limit):
        if self.headers.get("Transfer-Encoding"):
            return None
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            return None
        data = b""
        while len(data) < n:
            chunk = self.rfile.read(min(65536, n - len(data)))
            if not chunk:
                break
            data += chunk
        return data

    def authed(self, body=b""):
        """Check token + request signature; returns the User or None."""
        tok, sig, ts = self.headers.get("X-Token", ""), self.headers.get("X-Sig", ""), self.headers.get("X-Ts", "")
        with LOCK:
            r = ROOM
            u = r.by_token.get(tok) if r else None
            if not u:
                return None
            try:
                if abs(now() - float(ts) / 1000.0) > SIG_WINDOW:
                    return None
            except ValueError:
                return None
            path = urlparse(self.path).path
            msg = f"{tok}|{ts}|{hashlib.sha256(body).hexdigest()}|{self.command}|{path}".encode()
            good = hmac.new(r.auth, msg, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(good, sig):
                return None
            if sig in SEEN_SIGS and self.command != "GET":
                return None
            SEEN_SIGS[sig] = now()
            u.last = now()
            return u

    # ---------- routing ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        if p.path.startswith("/api/"):
            return self.api_get(p)
        return self.static(p.path)

    def do_POST(self):
        p = urlparse(self.path)
        if not p.path.startswith("/api/"):
            return self.fail(404, "not found")
        return self.api_post(p)

    def do_PUT(self):
        p = urlparse(self.path)
        if p.path == "/api/snapshot":
            return self.api_put_snapshot(p)
        return self.fail(404, "not found")

    # ---------- static files ----------
    def static(self, path):
        # The app files are not secret (all data stays in each device's browser), so tablets and phones
        # on the network may load them any time. Starting --local-only closes this.
        path = unquote(path)
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if os.path.commonpath([ROOT, full]) != ROOT or not os.path.isfile(full):
            return self.fail(404, "not found")
        if not is_loopback(self.ip()):
            # other devices may only fetch the app itself (checked on the resolved path, so ../ tricks do not help)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            if not (rel in ("index.html", "sw.js", "manifest.webmanifest") or rel.startswith(("js/", "css/", "icons/"))) or "/." in "/" + rel:
                return self.fail(404, "not found")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".js"):
            ctype = "text/javascript"
        elif full.endswith(".webmanifest"):
            ctype = "application/manifest+json"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if full.endswith("sw.js"):
            self.send_header("Service-Worker-Allowed", "/")
        self.end_headers()
        self.wfile.write(data)

    # ---------- API: GET ----------
    def api_get(self, p):
        path = p.path
        if path == "/api/status":
            with LOCK:
                r = ROOM
                st = {"loopback": is_loopback(self.ip()), "lan": lan_addresses(), "port": PORT, "localOnly": LOCAL_ONLY, "room": None}
                if r:
                    st["room"] = {"id": r.id, "name": r.name, "salt": r.salt, "users": len([u for u in r.users.values() if u.online]), "pid": r.pid, "open": True}
            return self.send_json(200, st)
        if path == "/api/challenge":
            with LOCK:
                if not ROOM:
                    return self.fail(404, "no session")
                purge()
                n = secrets.token_hex(16)
                NONCES[n] = now() + 60
            return self.send_json(200, {"nonce": n})
        if path == "/api/snapshot":
            return self.api_get_snapshot()
        if path == "/api/stream":
            return self.api_stream(p)
        return self.fail(404, "not found")

    def api_get_snapshot(self):
        u = self.authed()
        if not u:
            return self.fail(401, "unauthorised")
        with LOCK:
            r = ROOM
            if r.snap is None:
                return self.fail(404, "no snapshot yet")
            data, seq = r.snap, r.snap_seq
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Seq", str(seq))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        self.wfile.write(data)

    def api_stream(self, p):
        u = self.authed()
        if not u:
            return self.fail(401, "unauthorised")
        since = int((parse_qs(p.query).get("since") or ["-1"])[0])
        with LOCK:
            r = ROOM
            u.stream_gen += 1
            gen = u.stream_gen
            u.online = True
            backlog, resync = [], False
            if since >= 0:
                if since < r.log_floor:
                    resync = True
                else:
                    backlog = [json.dumps(e, separators=(",", ":")) for (s, e) in r.log if s > since]
            while not u.q.empty():                  # a fresh stream starts clean
                try:
                    u.q.get_nowait()
                except queue.Empty:
                    break
            r.broadcast(r.users_event())
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self.cors()
        self.end_headers()
        try:
            hello = {"k": "hello", "uid": u.uid, "role": u.role, "seq": r.seq, "snapSeq": r.snap_seq, "resync": resync, "users": r.users_event()["users"], "host": r.host.uid}
            self.wfile.write(("data: " + json.dumps(hello, separators=(",", ":")) + "\n\n").encode())
            for line in backlog:
                self.wfile.write(("data: " + line + "\n\n").encode())
            self.wfile.flush()
            while True:
                with LOCK:
                    if ROOM is not r or r.users.get(u.uid) is not u or u.stream_gen != gen:
                        break
                try:
                    data = u.q.get(timeout=10)
                    self.wfile.write(("data: " + data + "\n\n").encode())
                    ev = json.loads(data)
                    if ev.get("k") in ("closed", "kicked") and (ev.get("k") == "closed" or ev.get("uid") == u.uid):
                        self.wfile.flush()
                        break
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with LOCK:
                if ROOM is r and u.stream_gen == gen:
                    u.online = False
                    r.broadcast(r.users_event())
            self.close_connection = True

    # ---------- API: POST ----------
    def api_post(self, p):
        global ROOM
        path = p.path
        body = self.read_body(MAX_JSON)
        if body is None:
            return self.fail(413, "body too large")
        if path == "/api/room/open":
            if not is_loopback(self.ip()):
                return self.fail(403, "only this computer can open a session")
            try:
                d = json.loads(body)
                salt, auth = d["salt"], bytes.fromhex(d["auth"])
                if len(auth) != 32 or len(salt) < 16:
                    raise ValueError
            except Exception:
                return self.fail(400, "bad request")
            with LOCK:
                if ROOM:
                    self.close_room_locked("replaced")
                ROOM = Room(str(d.get("name") or "Session")[:60], salt, auth, str(d.get("hostName") or "Host"), str(d.get("color") or "#2468d8"), "view" if d.get("defaultRole") == "view" else "edit", str(d.get("pid") or ""))
                r = ROOM
                out = {"token": r.host.token, "uid": r.host.uid, "lan": lan_addresses(), "port": PORT, "room": r.id}
            for ip in out["lan"]:
                print(f"  Session open — others join at http://{ip}:{PORT}", flush=True)
            return self.send_json(200, out)
        if path == "/api/join":
            return self.api_join(body)
        u = self.authed(body)
        if not u:
            return self.fail(401, "unauthorised")
        with LOCK:
            r = ROOM
        if path == "/api/send":
            return self.api_send(u, r, body)
        if path == "/api/leave":
            with LOCK:
                if u is r.host:
                    pass
                else:
                    r.users.pop(u.uid, None)
                    r.by_token.pop(u.token, None)
                    r.broadcast(r.users_event())
            return self.send_json(200, {"ok": True})
        if path in ("/api/role", "/api/kick", "/api/room/close"):
            if u is not r.host:
                return self.fail(403, "host only")
            with LOCK:
                if path == "/api/room/close":
                    self.close_room_locked("closed")
                    ROOM = None
                    return self.send_json(200, {"ok": True})
                d = json.loads(body or b"{}")
                t = r.users.get(d.get("uid"))
                if not t or t is r.host:
                    return self.fail(404, "no such user")
                if path == "/api/role":
                    t.role = "view" if d.get("role") == "view" else "edit"
                    r.broadcast({"k": "role", "uid": t.uid, "role": t.role})
                else:
                    r.broadcast({"k": "kicked", "uid": t.uid})
                    r.users.pop(t.uid, None)
                    r.by_token.pop(t.token, None)
                r.broadcast(r.users_event())
            return self.send_json(200, {"ok": True})
        return self.fail(404, "not found")

    def close_room_locked(self, why):
        r = ROOM
        if r:
            r.broadcast({"k": "closed", "why": why})

    def api_join(self, body):
        ip = self.ip()
        with LOCK:
            r = ROOM
            if not r:
                return self.fail(404, "no session")
            fl = FAILS.setdefault(ip, deque(maxlen=20))
            t = now()
            recent = [x for x in fl if x > t - 300]
            if len(recent) >= 5:
                return self.fail(429, "too many attempts — wait a few minutes")
            try:
                d = json.loads(body)
                nonce, name, color, proof = d["nonce"], str(d["name"])[:40] or "Guest", str(d.get("color") or "#e8830c"), d["proof"]
            except Exception:
                return self.fail(400, "bad request")
            exp = NONCES.pop(nonce, None)
            good = hmac.new(r.auth, f"{nonce}|{name}".encode(), hashlib.sha256).hexdigest()
            if not exp or exp < t or not hmac.compare_digest(good, str(proof)):
                fl.append(t)
                return self.fail(403, "wrong session code")
            if len([u for u in r.users.values() if u.online or u is r.host]) >= MAX_USERS:
                return self.fail(409, "session is full")
            # same name rejoining takes over its old seat
            seat = next((u for u in r.users.values() if u.name == name and not u.online and u is not r.host), None)
            if seat:
                r.by_token.pop(seat.token, None)
                seat.token = secrets.token_urlsafe(32)
                r.by_token[seat.token] = seat
                seat.color = color
                u = seat
            else:
                u = r.add_user(name, color, r.default_role)
            out = {"token": u.token, "uid": u.uid, "role": u.role, "seq": r.seq, "snapSeq": r.snap_seq, "pid": r.pid, "name": r.name, "host": r.host.uid}
            r.broadcast(r.users_event())
        return self.send_json(200, out)

    def api_send(self, u, r, body):
        try:
            d = json.loads(body)
            k, data = d["k"], d["d"]
            if not isinstance(data, str):
                raise ValueError
        except Exception:
            return self.fail(400, "bad request")
        t = now()
        with LOCK:
            u.rate.append(t)
            if len(u.rate) >= 100 and t - u.rate[0] < 1.0:
                return self.fail(429, "slow down")
            if k == "ops":
                if u.role != "edit":
                    return self.fail(403, "read-only")
                cid = str(d.get("cid") or "")
                if cid and cid in u.cids:
                    return self.send_json(200, {"seq": u.cids[cid], "dup": True})
                r.seq += 1
                env = {"seq": r.seq, "from": u.uid, "k": "ops", "cid": cid, "d": data}
                r.log.append((r.seq, env))
                while len(r.log) > MAX_LOG:
                    s, _ = r.log.popleft()
                    r.log_floor = s
                if cid:
                    u.cids[cid] = r.seq
                    if len(u.cid_order) == u.cid_order.maxlen:
                        u.cids.pop(u.cid_order[0], None)
                    u.cid_order.append(cid)
                r.broadcast(env)
                return self.send_json(200, {"seq": r.seq})
            if k in ("pres", "chat"):
                if len(data) > 8192:
                    return self.fail(413, "too large")
                r.broadcast({"k": k, "from": u.uid, "d": data, "t": int(t * 1000)})
                return self.send_json(200, {"ok": True})
        return self.fail(400, "unknown message")

    def api_put_snapshot(self, p):
        body = self.read_body(MAX_SNAPSHOT)
        if body is None:
            return self.fail(413, "snapshot too large")
        u = self.authed(body)
        if not u:
            return self.fail(401, "unauthorised")
        try:
            seq = int((parse_qs(p.query).get("seq") or ["-1"])[0])
        except ValueError:
            return self.fail(400, "bad seq")
        with LOCK:
            r = ROOM
            if u.role != "edit":
                return self.fail(403, "read-only")
            if seq < 0 or seq > r.seq or seq < r.snap_seq:
                return self.fail(409, "stale snapshot")
            r.snap, r.snap_seq = body, seq
            while r.log and r.log[0][0] <= seq:
                s, _ = r.log.popleft()
                r.log_floor = max(r.log_floor, s)
            r.log_floor = max(r.log_floor, seq)
        return self.send_json(200, {"ok": True, "seq": seq})


def main():
    host = "127.0.0.1" if LOCAL_ONLY else "0.0.0.0"
    ThreadingHTTPServer.allow_reuse_address = True
    ThreadingHTTPServer.daemon_threads = True
    httpd = ThreadingHTTPServer((host, PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"StudioBindahh running at {url}  (Ctrl+C to stop)")
    if not LOCAL_ONLY:
        for ip in lan_addresses():
            print(f"  On your network:  http://{ip}:{PORT}  (other devices can only connect while a session is open)")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
