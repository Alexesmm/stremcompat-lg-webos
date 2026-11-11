// Starts Node with the arguments given, in one block of memory as node::Start expects, and sends
// what Node prints to the Android log (tag StremCompat).
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include "node.h"

static int pipeFds[2];

static void *logOutput(void *) {
    char buffer[2048];
    ssize_t n;
    while ((n = read(pipeFds[0], buffer, sizeof buffer - 1)) > 0) {
        if (buffer[n - 1] == '\n') n--;
        buffer[n] = 0;
        __android_log_write(ANDROID_LOG_INFO, "StremCompat", buffer);
    }
    return nullptr;
}

extern "C" JNIEXPORT jint JNICALL
Java_io_github_alexesmm_stremcompat_NodeRunner_startNode(JNIEnv *env, jclass, jobjectArray arguments) {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    pipe(pipeFds);
    dup2(pipeFds[1], STDOUT_FILENO);
    dup2(pipeFds[1], STDERR_FILENO);
    pthread_t thread;
    pthread_create(&thread, nullptr, logOutput, nullptr);
    pthread_detach(thread);

    jsize argc = env->GetArrayLength(arguments);
    size_t size = 0;
    for (jsize i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        size += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    char *block = (char *) calloc(size, 1);
    char **argv = (char **) calloc(argc, sizeof(char *));
    char *at = block;
    for (jsize i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        strcpy(at, c);
        argv[i] = at;
        at += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    return jint(node::Start(argc, argv));
}
