package io.github.alexesmm.stremcompat;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceView;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.text.Cue;
import androidx.media3.common.text.CueGroup;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * ExoPlayer for the player page (src/platform/android/player.js): window.AndroidPlayer takes its
 * orders, window.__androidPlayer(event, a, b) hears what happens. The video is drawn on a
 * SurfaceView under the page, which is transparent.
 */
final class TvPlayer {
    private final Context context;
    private final WebView page;
    private final SurfaceView surface;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private boolean reported;
    private boolean buffering;
    private boolean seeking;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            send("time", player.getCurrentPosition(), Math.max(0, player.getDuration()));
            main.postDelayed(this, 500);
        }
    };

    TvPlayer(Context context, WebView page, SurfaceView surface) {
        this.context = context;
        this.page = page;
        this.surface = surface;
    }

    private void send(String event, long a, long b) {
        page.evaluateJavascript("window.__androidPlayer&&window.__androidPlayer('" + event + "'," + a + "," + b + ")", null);
    }

    private void sendText(String event, long a, String text) {
        page.evaluateJavascript("window.__androidPlayer&&window.__androidPlayer('" + event + "'," + a + "," + JSONObject.quote(text) + ")", null);
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_BUFFERING) {
                buffering = true;
                send("buffering", 0, 0);
            } else if (state == Player.STATE_READY) {
                if (!reported) {
                    reported = true;
                    send("ready", Math.max(0, player.getDuration()), 0);
                } else if (buffering) send("buffered", 0, 0);
                buffering = false;
                if (seeking) {
                    seeking = false;
                    send("seeked", 0, 0);
                }
            } else if (state == Player.STATE_ENDED) {
                main.removeCallbacks(tick);
                send("ended", 0, 0);
            }
        }

        @Override public void onTracksChanged(Tracks tracks) {
            if (reported) send("tracks", 0, 0);
        }

        @Override public void onCues(CueGroup group) {
            StringBuilder text = new StringBuilder();
            for (Cue cue : group.cues) {
                if (cue.text == null) continue;
                if (text.length() > 0) text.append('\n');
                text.append(cue.text);
            }
            /* a line stays until the next one replaces it; an empty one clears it */
            sendText("cue", text.length() > 0 ? 60000 : 1, text.toString());
        }

        @Override public void onPlayerError(PlaybackException error) {
            main.removeCallbacks(tick);
            sendText("error", 0, error.getErrorCodeName());
        }
    };

    private void release() {
        main.removeCallbacks(tick);
        if (player == null) return;
        player.removeListener(listener);
        player.release();
        player = null;
    }

    /** Called when the screen goes away. */
    void stopNow() {
        main.post(this::release);
    }

    @JavascriptInterface public void open(String url, long startMs) {
        main.post(() -> {
            release();
            reported = false;
            buffering = false;
            seeking = false;
            DefaultRenderersFactory renderers = new DefaultRenderersFactory(context).setEnableDecoderFallback(true);
            player = new ExoPlayer.Builder(context, renderers).build();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
            player.setVideoSurfaceView(surface);
            /* the page shows subtitles itself, and only those it chose (selectText) */
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
            player.addListener(listener);
            player.setMediaItem(MediaItem.fromUri(url), startMs);
            player.setPlayWhenReady(false);
            player.prepare();
        });
    }

    @JavascriptInterface public void play() {
        main.post(() -> {
            if (player == null) return;
            player.play();
            main.removeCallbacks(tick);
            main.post(tick);
        });
    }

    @JavascriptInterface public void pause() {
        main.post(() -> {
            if (player != null) player.pause();
        });
    }

    @JavascriptInterface public void seek(long ms) {
        main.post(() -> {
            if (player == null) return;
            seeking = true;
            player.seekTo(ms);
        });
    }

    @JavascriptInterface public void stop() {
        main.post(this::release);
    }

    /** The audio and text tracks as JSON: index is the group's place among all the file's groups. */
    @JavascriptInterface public String tracks() {
        final String[] out = {"{\"audio\":[],\"text\":[]}"};
        Object lock = new Object();
        synchronized (lock) {
            main.post(() -> {
                try {
                    out[0] = describe();
                } catch (Exception ignored) {
                }
                synchronized (lock) {
                    lock.notify();
                }
            });
            try {
                lock.wait(1000);
            } catch (InterruptedException ignored) {
            }
        }
        return out[0];
    }

    private String describe() throws Exception {
        JSONArray audio = new JSONArray(), text = new JSONArray();
        if (player != null) {
            List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
            for (int i = 0; i < groups.size(); i++) {
                Tracks.Group g = groups.get(i);
                if (g.getType() != C.TRACK_TYPE_AUDIO && g.getType() != C.TRACK_TYPE_TEXT) continue;
                Format f = g.getTrackFormat(0);
                JSONObject t = new JSONObject();
                t.put("index", i);
                t.put("language", f.language == null ? "" : f.language);
                t.put("label", f.label == null ? "" : f.label);
                t.put("selected", g.isSelected());
                (g.getType() == C.TRACK_TYPE_AUDIO ? audio : text).put(t);
            }
        }
        return new JSONObject().put("audio", audio).put("text", text).toString();
    }

    private void choose(int index, int type) {
        if (player == null) return;
        List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
        if (index < 0 || index >= groups.size()) return;
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(type, false)
                .setOverrideForType(new TrackSelectionOverride(groups.get(index).getMediaTrackGroup(), 0))
                .build());
    }

    @JavascriptInterface public void selectAudio(int index) {
        main.post(() -> choose(index, C.TRACK_TYPE_AUDIO));
    }

    /** index < 0 turns the file's subtitles off */
    @JavascriptInterface public void selectText(int index) {
        main.post(() -> {
            if (player == null) return;
            if (index < 0)
                player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
            else choose(index, C.TRACK_TYPE_TEXT);
        });
    }
}
