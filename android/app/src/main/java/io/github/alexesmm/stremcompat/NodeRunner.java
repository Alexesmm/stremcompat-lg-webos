package io.github.alexesmm.stremcompat;

import android.content.Context;
import android.content.res.AssetManager;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * The local server, on nodejs-mobile's Node inside the app's process. Node can start only once
 * per process, so the server outlives the screen and is not started again when it comes back.
 */
final class NodeRunner {
    private static final String TAG = "StremCompat";
    private static boolean started;

    static {
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    private static native int startNode(String[] arguments);

    private NodeRunner() {}

    static synchronized void start(Context context) {
        if (started) return;
        started = true;
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                File service = prepareService(app);
                prepareEnvironment(app);
                Log.i(TAG, "starting the local server");
                int code = startNode(new String[] {"node", new File(service, "local-server.js").getAbsolutePath()});
                Log.w(TAG, "the local server stopped: " + code);
            } catch (Exception e) {
                Log.e(TAG, "the local server could not start", e);
            }
        }, "local-server").start();
    }

    /** FFmpeg and FFprobe come as libraries, which Android unpacks runnable. */
    static File program(Context context, String name) {
        return new File(context.getApplicationInfo().nativeLibraryDir, "lib" + name + ".so");
    }

    /** Whether FFmpeg runs on this TV: some do not run 32-bit ARM programs. Asked once per start. */
    private static Boolean mediaTools;

    static synchronized boolean hasMediaTools(Context context) {
        if (mediaTools != null) return mediaTools;
        mediaTools = false;
        try {
            Process p = new ProcessBuilder(program(context, "ffmpeg").getAbsolutePath(), "-version").redirectErrorStream(true).start();
            InputStream out = p.getInputStream();
            byte[] buffer = new byte[4096];
            while (out.read(buffer) > 0) {}
            mediaTools = p.waitFor() == 0;
        } catch (Exception e) {
            Log.w(TAG, "FFmpeg does not run here", e);
        }
        return mediaTools;
    }

    private static void prepareEnvironment(Context context) throws Exception {
        File data = new File(context.getFilesDir(), "data");
        data.mkdirs();
        /* server-address.js and streaming-file.js keep their files under $HOME */
        Os.setenv("HOME", data.getAbsolutePath(), true);
        Os.setenv("TMPDIR", context.getCacheDir().getAbsolutePath(), true);
        Os.setenv("SC_SERVER_LOG", new File(data, "local server.log").getAbsolutePath(), true);
        Os.setenv("TV_FFMPEG", program(context, "ffmpeg").getAbsolutePath(), true);
        Os.setenv("TV_FFPROBE", program(context, "ffprobe").getAbsolutePath(), true);
    }

    /** The server's files are copied out of the package once per version of the app. */
    private static File prepareService(Context context) throws Exception {
        File service = new File(context.getFilesDir(), "service");
        File marker = new File(service, ".copied-" + context.getPackageManager().getPackageInfo(context.getPackageName(), 0).lastUpdateTime);
        if (marker.exists()) return service;
        deleteAll(service);
        copyAssets(context.getAssets(), "service", service);
        marker.createNewFile();
        return service;
    }

    private static void copyAssets(AssetManager assets, String from, File to) throws IOException {
        String[] names = assets.list(from);
        if (names == null || names.length == 0) {
            to.getParentFile().mkdirs();
            try (InputStream in = assets.open(from); OutputStream out = new FileOutputStream(to)) {
                byte[] buffer = new byte[65536];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            }
            return;
        }
        to.mkdirs();
        for (String name : names) copyAssets(assets, from + "/" + name, new File(to, name));
    }

    private static void deleteAll(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteAll(child);
        file.delete();
    }
}
