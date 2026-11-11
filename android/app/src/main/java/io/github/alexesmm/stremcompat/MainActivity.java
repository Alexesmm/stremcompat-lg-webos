package io.github.alexesmm.stremcompat;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The whole app on screen: the pages of the local server in a WebView, sized as a 1920x1080
 * screen, over the surface the player draws on. The remote's Back reaches the page as 461, the
 * key webOS sends, so the interface handles it as on LG.
 */
public class MainActivity extends Activity {
    private static final String HOME = "http://127.0.0.1:" + BuildConfig.SERVER_PORT;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView page;
    private TvPlayer player;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        NodeRunner.start(this);
        /* only a development build lets a computer inspect the page */
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        SurfaceView surface = new SurfaceView(this);
        page = new WebView(this);
        page.setBackgroundColor(Color.TRANSPARENT);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1));
        root.addView(page, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        page.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        WebSettings s = page.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setTextZoom(100);
        /* the interface is laid out for 1920 pixels across, whatever the TV's density */
        DisplayMetrics m = getResources().getDisplayMetrics();
        page.setInitialScale(Math.round(100f * Math.max(m.widthPixels, m.heightPixels) / 1920f));
        page.setWebChromeClient(new WebChromeClient());
        page.setWebViewClient(new WebViewClient());
        player = new TvPlayer(this, page, surface);
        page.addJavascriptInterface(player, "AndroidPlayer");
        page.addJavascriptInterface(new App(), "AndroidApp");
        page.requestFocus();
        waitForServer(0);
    }

    /** The server starts with the app: the page opens once it answers. */
    private void waitForServer(int attempt) {
        new Thread(() -> {
            boolean up = false;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(HOME + "/health").openConnection();
                c.setConnectTimeout(500);
                c.setReadTimeout(1000);
                up = c.getResponseCode() == 200;
                c.disconnect();
            } catch (Exception ignored) {
            }
            boolean ready = up;
            main.postDelayed(() -> {
                if (ready || attempt > 120) page.loadUrl(HOME + "/beta");
                else waitForServer(attempt + 1);
            }, ready ? 0 : 250);
        }).start();
    }

    /** The remote's keys that Android keeps for itself become the ones webOS sends. */
    private int webosKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE: return 461;
            case KeyEvent.KEYCODE_MEDIA_PLAY: return 415;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return 19;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return 179;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return 39;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return 37;
            case KeyEvent.KEYCODE_PROG_RED: return 403;
            case KeyEvent.KEYCODE_PROG_GREEN: return 404;
            case KeyEvent.KEYCODE_PROG_YELLOW: return 405;
            case KeyEvent.KEYCODE_PROG_BLUE: return 406;
            default: return 0;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int key = webosKey(event.getKeyCode());
        if (key == 0) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN || event.getAction() == KeyEvent.ACTION_UP) {
            String type = event.getAction() == KeyEvent.ACTION_DOWN ? "keydown" : "keyup";
            page.evaluateJavascript("(function(){var t=document.activeElement&&document.activeElement.tagName==='INPUT'?document.activeElement:document;"
                    + "var e=document.createEvent('Event');e.initEvent('" + type + "',true,true);e.keyCode=" + key + ";e.which=" + key + ";t.dispatchEvent(e);})()", null);
        }
        return true;
    }

    @Override
    protected void onStop() {
        super.onStop();
        player.stopNow();
    }

    /** What the page may ask of the app (src/platform/android). */
    private final class App {
        @JavascriptInterface public void exit() {
            main.post(MainActivity.this::finishAndRemoveTask);
        }

        @JavascriptInterface public boolean hasMediaTools() {
            return NodeRunner.hasMediaTools(MainActivity.this);
        }

        @JavascriptInterface public boolean openYoutube(String videoId) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:" + videoId)));
                return true;
            } catch (ActivityNotFoundException e) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=" + videoId)));
                    return true;
                } catch (ActivityNotFoundException ignored) {
                    return false;
                }
            }
        }
    }
}
